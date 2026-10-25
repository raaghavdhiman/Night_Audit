"""Decide the TRENDS stage setting: Super thinking ON vs OFF, scored against the planted story.

Extracts all synthetic reviews once per extraction config (cached in data/runtime/), computes trends in
pandas, then asks the trends model for the top 3 several times per setting.

Usage: python scripts/eval_trends.py [--extract super_off] [--repeats 2]
Writes results/eval_trends.md.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import pandas as pd  # noqa: E402

from src import config  # noqa: E402
from src.cost_tracker import Ledger, stage, use_ledger  # noqa: E402
from src.extract import extract_all  # noqa: E402
from src.ingest import parse_reviews_csv  # noqa: E402
from src.trends import compute_trends, interpret  # noqa: E402

SYN = ROOT / "data" / "synthetic"
CFG = {"lightning_off": ("lightning", False), "super_off": ("super", False), "ultra_off": ("ultra", False)}


def load_synthetic():
    df, meta = parse_reviews_csv((SYN / "reviews.csv").read_bytes())
    return df, meta


def extracted_for(cfg: str, df) -> list[dict]:
    path = config.RUNTIME / f"synthetic_extracted_{cfg}.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    model, thinking = CFG[cfg]
    reviews = [{"review_id": r.review_id, "text": r.text, "title": r.title} for r in df.itertuples()]
    config.reset_async_clients()
    with stage("extract"):
        res = asyncio.run(extract_all(reviews, model=model, thinking=thinking, concurrency=12))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(res), encoding="utf-8")
    return res


def top3_score(issues, gt) -> dict:
    got = [i["aspect"] for i in issues]
    expected = set(gt["expected_top_issues"])
    acceptable = expected | set(gt["acceptable_third_issue"])
    return {"top3": got, "precision": sum(a in acceptable for a in got) / max(1, len(got)),
            "recovered_both_trends": expected <= set(got)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--extract", default="super_off")
    ap.add_argument("--repeats", type=int, default=2)
    args = ap.parse_args()
    config.require_keys(("NEBIUS_API_KEY",))
    gt = json.loads((SYN / "ground_truth.json").read_text(encoding="utf-8"))
    df, meta = load_synthetic()
    led = Ledger("eval_trends")
    rows = []
    with use_ledger(led):
        ex = extracted_for(args.extract, df)
        tr = compute_trends(df, ex)
        print("pandas priority hint order:", [(s["aspect"], s["priority_hint"]) for s in tr["aspects"][:5]])
        print("severity-5 escalations:", [(e["aspect"], e["review_id"]) for e in tr["escalations"]])
        for thinking in (True, False):
            for rep in range(args.repeats):
                n0, c0, t0 = len(led.calls), led.total_cost, time.time()
                with stage("trends"):
                    issues = interpret(tr, df, ex, gt["hotel"]["name"], gt["hotel"]["city"], "super", thinking)
                sc = top3_score(issues, gt)
                new_calls = led.calls[n0:]
                rows.append({"thinking": thinking, "rep": rep + 1, **sc, "cost": led.total_cost - c0,
                             "seconds": time.time() - t0, "reasoning": sum(c.reasoning_tokens for c in new_calls),
                             "titles": [i["title"] for i in issues]})
                print(f"thinking={thinking} rep={rep + 1}: {sc['top3']} precision={sc['precision']:.2f} "
                      f"both_trends={sc['recovered_both_trends']} cost=${rows[-1]['cost']:.4f} "
                      f"{rows[-1]['seconds']:.0f}s\n   titles: {rows[-1]['titles']}")
    md = ["# Trends stage: Super thinking ON vs OFF", "",
          f"_scripts/eval_trends.py, {time.strftime('%Y-%m-%d %H:%M')}. Extraction: `{args.extract}` on all "
          f"{len(df)} synthetic reviews; counting done in pandas. Scored against the planted story "
          f"(expected: {', '.join(gt['expected_top_issues'])}; acceptable third: "
          f"{', '.join(gt['acceptable_third_issue'])})._", "",
          "| thinking | run | top 3 | top-3 precision | both planted trends found | reasoning tokens | seconds | cost |",
          "|---|---|---|---|---|---|---|---|"]
    for r in rows:
        md.append(f"| {'on' if r['thinking'] else 'off'} | {r['rep']} | {', '.join(r['top3'])} | {r['precision']:.2f} | "
                  f"{'yes' if r['recovered_both_trends'] else 'no'} | {r['reasoning']:,} | {r['seconds']:.0f} | ${r['cost']:.4f} |")
    md += ["", "Headlines written (the thing the GM reads first):", ""]
    md += [f"- thinking {'on' if r['thinking'] else 'off'}, run {r['rep']}: " + " / ".join(r["titles"]) for r in rows]
    md += ["", "Decision: when both settings pick the same top 3, keep thinking ON for the more specific, "
           "less templated headlines; the extra cost is a fraction of a cent per run."]
    (ROOT / "results" / "eval_trends.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    (ROOT / "results" / "eval_trends.json").write_text(json.dumps(rows, indent=1), encoding="utf-8")
    print(f"\nwrote results/eval_trends.md | dev spend ${config.SPEND.get():.3f}")


if __name__ == "__main__":
    main()
