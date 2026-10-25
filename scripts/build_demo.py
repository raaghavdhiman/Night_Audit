"""Build the cached demo: run the real pipeline once on the synthetic hotel, measure the all-Ultra
baseline on a 20-review sample, validate against the planted story, and save everything to
data/synthetic/demo_result.json (served by GET /api/demo with zero model calls).

Usage: python scripts/build_demo.py [--baseline-only] [--skip-baseline]
"""
from __future__ import annotations

import argparse
import asyncio
import json
import random
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from src import config  # noqa: E402
from src.cost_tracker import Ledger  # noqa: E402
from src.ingest import parse_reviews_csv  # noqa: E402
from src.pipeline import BASELINE_ROUTING, ROUTING, extrapolate_baseline, run_pipeline  # noqa: E402

SYN = ROOT / "data" / "synthetic"
OUT = SYN / "demo_result.json"
BASELINE_N = 20


async def run(df, meta, routing, label, record=False):
    ledger = Ledger(label)
    events, result, t0 = [], None, time.time()
    async for ev in run_pipeline(df, meta, routing=routing, ledger=ledger):
        if record and ev["type"] != "result":
            events.append({"t": round(time.time() - t0, 2), **ev})
        if ev["type"] == "stage":
            print(f"  [{label}] {ev['stage']:11} {ev['status']:7} "
                  + (f"{ev.get('seconds', '')}s" if ev["status"] == "done" else ev.get("model_label", "")))
        elif ev["type"] == "search":
            print(f"  [{label}] search #{ev['issue_rank']}.{ev['n']}: {ev['query']}")
        elif ev["type"] == "fallback":
            print(f"  [{label}] FALLBACK on issue {ev['issue_rank']}: {ev['reason']}")
        elif ev["type"] == "error":
            raise SystemExit(f"pipeline error: {ev}")
        elif ev["type"] == "result":
            result = ev["result"]
    return result, ledger, events


def validate(result, gt) -> dict:
    top = [i["aspect"] for i in result["issues"]]
    expected = set(gt["expected_top_issues"])
    acceptable = expected | set(gt["acceptable_third_issue"])
    planted_ids = {p["id"]: p for p in gt["planted_story"]}
    sev5_truth = {r["review_id"]: r["planted"][0] for r in gt["reviews"] if any(x.startswith("severity5") for x in r["planted"])}
    found_sev5 = {e["review_id"] for e in result["escalations"]}
    weekly_truth = {w["week_start"]: w for w in gt["weekly_planted_counts"]}
    by_aspect = {a["aspect"]: a for a in result["aspects"]}
    series = {}
    for asp, key in (("food_beverage", "neg_food_beverage"), ("noise", "neg_noise")):
        pts = [(w["week_start"], weekly_truth.get(w["week_start"], {}).get(key), w["neg"])
               for w in by_aspect[asp]["weekly"]]
        series[asp] = [{"week_start": a, "planted": b, "detected": c} for a, b, c in pts]
    cited = {i["aspect"]: len(i["investigation"].get("cited_source_ids", [])) for i in result["issues"]}
    return {
        "top3": top,
        "top3_precision": sum(a in acceptable for a in top) / max(1, len(top)),
        "planted_trends_recovered": sorted(expected & set(top)),
        "planted_trends_missed": sorted(expected - set(top)),
        "severity5_planted": sev5_truth,
        "severity5_found": sorted(found_sev5 & set(sev5_truth)),
        "severity5_extra": sorted(found_sev5 - set(sev5_truth)),
        "weekly_negatives_planted_vs_detected": series,
        "cited_sources_per_issue": cited,
        "planted_story": [planted_ids[k]["description"] for k in planted_ids],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-baseline", action="store_true")
    args = ap.parse_args()
    config.require_keys()
    gt = json.loads((SYN / "ground_truth.json").read_text(encoding="utf-8"))
    df, meta = parse_reviews_csv((SYN / "reviews.csv").read_bytes())
    meta.update({"synthetic": True, "source": "synthetic", "hotel": gt["hotel"]["name"], "city": gt["hotel"]["city"]})
    print(f"Routed pipeline on {len(df)} synthetic reviews...")
    config.reset_async_clients()
    result, ledger, events = asyncio.run(run(df, meta, ROUTING, "routed", record=True))

    baseline = None
    if not args.skip_baseline:
        sample = df.sample(n=BASELINE_N, random_state=random.Random(11).randint(0, 10_000)).sort_values("date")
        print(f"All-Ultra (thinking ON) baseline on a {BASELINE_N}-review sample...")
        config.reset_async_clients()
        b_res, b_ledger, _ = asyncio.run(run(sample, meta, BASELINE_ROUTING, "baseline"))
        baseline = extrapolate_baseline(b_ledger.summary(), BASELINE_N, len(df), len(result["issues"]),
                                        len(result["replies"]), len(b_res["issues"]), max(1, len(b_res["replies"])))
        baseline["sample_review_ids"] = sample["review_id"].tolist()
    elif OUT.exists():
        baseline = json.loads(OUT.read_text(encoding="utf-8")).get("baseline")

    routed_cost = result["folio"]["total"]["cost_usd"]
    result["baseline"] = baseline
    if baseline:
        result["savings_pct"] = round(100 * (1 - routed_cost / baseline["extrapolated_cost_usd"]), 1)
    result["validation"] = validate(result, gt)
    result["replay"] = events
    result["meta"]["disclosure"] = ("All reviews for Hotel Wrenfield are synthetic, generated with Nemotron "
                                    "Lightning from a planted scenario. The hotel is fictional.")
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")

    v = result["validation"]
    print(f"\nTop 3: {v['top3']}  precision vs planted story: {v['top3_precision']:.2f}")
    print(f"Planted trends recovered: {v['planted_trends_recovered']}  missed: {v['planted_trends_missed']}")
    print(f"Severity-5 planted {v['severity5_planted']} found {v['severity5_found']} extra {v['severity5_extra']}")
    for asp, pts in v["weekly_negatives_planted_vs_detected"].items():
        print(f"  {asp:14} planted  {[p['planted'] for p in pts]}\n  {'':14} detected {[p['detected'] for p in pts]}")
    print(f"Routed run cost ${routed_cost:.4f} in {result['meta']['wall_seconds']}s")
    if baseline:
        print(f"Baseline measured ${baseline['measured_cost_usd']:.4f} on {BASELINE_N}, extrapolated "
              f"${baseline['extrapolated_cost_usd']:.4f} -> saved {result['savings_pct']}%")
    print(f"Wrote {OUT.relative_to(ROOT)} | dev spend ${config.SPEND.get():.3f}")


if __name__ == "__main__":
    main()
