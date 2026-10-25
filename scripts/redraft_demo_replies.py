"""Re-draft only the cached demo's replies with the current replies prompt (Lightning, 1-3 calls per reply,
under $0.001), keeping the same reviews. The folio's replies row, its totals, the replay's last folio
snapshot and savings_pct are updated to the new calls, so the bill matches what produced the drafts.

Usage: python scripts/redraft_demo_replies.py [--dry-run]
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from src.cost_tracker import Ledger, stage, use_ledger  # noqa: E402
from src.pipeline import ROUTING  # noqa: E402
from src.replies import _draft  # noqa: E402

OUT = ROOT / "data" / "synthetic" / "demo_result.json"
TOTAL_KEYS = ("calls", "tokens_in", "tokens_out", "reasoning_tokens", "cost_usd")


def patch_folio(folio: dict, new_row: dict) -> None:
    """Swap the replies row and move the totals by the difference."""
    old = next(s for s in folio["stages"] if s["stage"] == "replies")
    for k in TOTAL_KEYS:
        folio["total"][k] = round(folio["total"][k] - old[k] + new_row[k], 6)
    folio["stages"][folio["stages"].index(old)] = new_row


async def redraft(result: dict) -> tuple[list[dict], dict]:
    reviews = {r["review_id"]: r for r in result["reviews"]}
    actions = {i["aspect"]: [a["action"] for a in (i.get("investigation") or {}).get("actions", [])]
               for i in result["issues"]}
    model, thinking = ROUTING["replies"]
    ledger = Ledger("redraft")
    out = []
    with use_ledger(ledger), stage("replies"):
        for old in result["replies"]:
            r = reviews[old["review_id"]]
            x = {"review_id": r["review_id"], "rating": r["rating"], "date": pd.Timestamp(r["date"]) if r["date"] else pd.NaT,
                 "text": r["text"], "max_sev": old["max_severity"], "issue_rank": old["issue_rank"],
                 "negs": [a for a in r["aspects"] if a["sentiment"] == "n"]}
            out.append(await _draft(x, result["meta"]["hotel"], actions, model, thinking))
    row = next(s for s in ledger.summary()["stages"] if s["stage"] == "replies")
    return out, row


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="print the drafts, do not write")
    args = ap.parse_args()
    result = json.loads(OUT.read_text(encoding="utf-8"))
    replies, row = asyncio.run(redraft(result))
    for r in replies:
        print(f"--- {r['review_id']} ({r['status']})\n{r['draft']}\n")
    print(f"replies: {row['calls']} calls, {row['tokens_in'] + row['tokens_out']} tokens, ${row['cost_usd']:.6f}")
    if args.dry_run or any(r["status"] != "pending" for r in replies):
        print("not written" + ("" if args.dry_run else ": a draft failed"))
        return
    result["replies"] = replies
    patch_folio(result["folio"], row)
    for ev in result.get("replay", []):
        if ev.get("type") == "stage" and ev.get("stage") == "replies" and ev.get("status") == "done" and ev.get("folio"):
            patch_folio(ev["folio"], row)
    if result.get("baseline"):
        result["savings_pct"] = round(100 * (1 - result["folio"]["total"]["cost_usd"]
                                             / result["baseline"]["extrapolated_cost_usd"]), 1)
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"written; folio total ${result['folio']['total']['cost_usd']:.6f}, saved {result.get('savings_pct')}%")


if __name__ == "__main__":
    main()
