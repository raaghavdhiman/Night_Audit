"""Evaluate extraction configs against references and write results/eval_summary.md.

References, in order of authority:
  human     - your hand labels in data/eval/label_sheet.csv (aspect:sentiment:severity; ... | none)
  silver    - Ultra with thinking ON on the same 100 eval reviews (the expensive "all-Ultra" baseline;
              cached in results/silver_labels.json so it is only paid for once)
  synthetic - planted aspects in data/synthetic/ground_truth.json (recall-oriented: generated text
              may legitimately mention extra aspects)

Usage:  python scripts/run_eval.py [--configs lightning_off,lightning_on,super_off,ultra_off]
                                   [--no-silver] [--synthetic-n 120] [--concurrency 8]
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
from src.cost_tracker import Ledger, use_ledger  # noqa: E402
from src.extract import ASPECTS, extract_all  # noqa: E402
from src.ingest import clean_text  # noqa: E402

RESULTS = ROOT / "results"
LABELS = ROOT / "data" / "eval" / "label_sheet.csv"
SYN_GT = ROOT / "data" / "synthetic" / "ground_truth.json"
SYN_CSV = ROOT / "data" / "synthetic" / "reviews.csv"
SILVER = RESULTS / "silver_labels.json"

CONFIGS = {
    "lightning_off": ("lightning", False),
    "lightning_on": ("lightning", True),
    "super_off": ("super", False),
    "ultra_off": ("ultra", False),
}
MIN_HUMAN = 30


def parse_label(s: str):
    """'noise:n:3; cleanliness:p:0' -> list of dicts. 'none' -> []. '' -> None (unlabeled)."""
    s = str(s or "").strip()
    if not s:
        return None
    if s.lower() == "none":
        return []
    out = []
    for part in s.split(";"):
        bits = [b.strip().lower() for b in part.strip().split(":")]
        if len(bits) == 3 and bits[0] in ASPECTS and bits[1] in ("p", "n") and bits[2].isdigit():
            out.append({"aspect": bits[0], "sentiment": bits[1], "severity": int(bits[2]), "department": None})
    return out


def score(preds: dict, refs: dict, recall_only=False) -> dict:
    """preds/refs: {id: [aspect dicts]}. Micro-averaged over ids present in refs."""
    tp = fp = fn = 0
    ntp = nfp = nfn = 0
    sent_ok = sent_n = 0
    sev_err = []
    dept_ok = dept_n = 0
    for rid, ref in refs.items():
        pred = preds.get(rid)
        if pred is None:
            continue
        P = {a["aspect"]: a for a in pred}
        R = {a["aspect"]: a for a in ref}
        tp += len(P.keys() & R.keys())
        fp += len(P.keys() - R.keys())
        fn += len(R.keys() - P.keys())
        Pn = {k for k, v in P.items() if v["sentiment"] == "n"}
        Rn = {k for k, v in R.items() if v["sentiment"] == "n"}
        ntp += len(Pn & Rn)
        nfp += len(Pn - Rn)
        nfn += len(Rn - Pn)
        for k in P.keys() & R.keys():
            sent_n += 1
            sent_ok += P[k]["sentiment"] == R[k]["sentiment"]
            sev_err.append(abs(P[k]["severity"] - R[k]["severity"]))
            if R[k].get("department"):
                dept_n += 1
                dept_ok += P[k]["department"] == R[k]["department"]

    def prf(t, f_p, f_n):
        p = t / (t + f_p) if t + f_p else 0.0
        r = t / (t + f_n) if t + f_n else 0.0
        return p, r, (2 * p * r / (p + r) if p + r else 0.0)

    p, r, f = prf(tp, fp, fn)
    npp, nr, nf = prf(ntp, nfp, nfn)
    return {
        "n_reviews": sum(1 for k in refs if k in preds), "precision": p, "recall": r, "f1": f,
        "neg_precision": npp, "neg_recall": nr, "neg_f1": nf,
        "sentiment_agree": sent_ok / sent_n if sent_n else None,
        "severity_mae": sum(sev_err) / len(sev_err) if sev_err else None,
        "severity_within1": sum(e <= 1 for e in sev_err) / len(sev_err) if sev_err else None,
        "dept_agree": dept_ok / dept_n if dept_n else None,
        "recall_only": recall_only,
    }


def _ranks(vals):
    order = sorted(range(len(vals)), key=lambda i: -vals[i])
    r = [0.0] * len(vals)
    i = 0
    while i < len(order):  # average ranks for ties
        j = i
        while j + 1 < len(order) and vals[order[j + 1]] == vals[order[i]]:
            j += 1
        for k in range(i, j + 1):
            r[order[k]] = (i + j) / 2
        i = j + 1
    return r


def issue_level(preds: dict, refs: dict) -> dict:
    """Aggregate agreement: rank aspects by number of negative mentions (what the briefing uses)."""
    ids = [k for k in refs if k in preds]

    def counts(src):
        c = {a: 0 for a in ASPECTS}
        for k in ids:
            for x in src[k]:
                if x["sentiment"] == "n":
                    c[x["aspect"]] += 1
        return c

    cp, cr = counts(preds), counts(refs)
    top_p = sorted(ASPECTS, key=lambda a: -cp[a])[:3]
    top_r = sorted(ASPECTS, key=lambda a: -cr[a])[:3]
    rp, rr = _ranks([cp[a] for a in ASPECTS]), _ranks([cr[a] for a in ASPECTS])
    n = len(ASPECTS)
    mp, mr = sum(rp) / n, sum(rr) / n
    cov = sum((x - mp) * (y - mr) for x, y in zip(rp, rr))
    sd = (sum((x - mp) ** 2 for x in rp) * sum((y - mr) ** 2 for y in rr)) ** 0.5
    return {"top3_overlap": len(set(top_p) & set(top_r)), "top3_pred": top_p, "top3_ref": top_r,
            "spearman": cov / sd if sd else None,
            "count_err": sum(abs(cp[a] - cr[a]) for a in ASPECTS) / max(1, sum(cr.values()))}


def run_config(name, model, thinking, reviews, concurrency):
    ledger = Ledger(name)
    t0 = time.time()
    config.reset_async_clients()
    with use_ledger(ledger):
        res = asyncio.run(extract_all(reviews, model=model, thinking=thinking, concurrency=concurrency))
    wall = time.time() - t0
    with open(RESULTS / f"{name}.jsonl", "w", encoding="utf-8") as f:
        for rv, r in zip(reviews, res):
            f.write(json.dumps({"id": rv["review_id"], **r}) + "\n")
    s = ledger.summary()["total"]
    n = len(res)
    stats = {
        "n": n,
        "json_fail_first": sum(r["json_fail_first"] for r in res) / n,
        "json_fail_final": sum(not r["ok"] for r in res) / n,
        "mean_latency_s": sum(r["latency_s"] for r in res) / n,
        "wall_s": wall,
        "cost_usd": s["cost_usd"],
        "cost_per_1k": s["cost_usd"] / n * 1000,
        "tokens_in": s["tokens_in"], "tokens_out": s["tokens_out"], "reasoning_tokens": s["reasoning_tokens"],
    }
    preds = {rv["review_id"]: r["aspects"] for rv, r in zip(reviews, res) if r["ok"]}
    print(f"  {name:14} n={n} cost=${stats['cost_usd']:.4f} mean_lat={stats['mean_latency_s']:.2f}s "
          f"json_fail={stats['json_fail_final']:.0%} wall={wall:.0f}s | dev spend ${config.SPEND.get():.3f}")
    return preds, stats


def fmt(x, pct=False, nd=2):
    if x is None:
        return "n/a"
    return f"{x:.0%}" if pct else f"{x:.{nd}f}"


def table(scores: dict, stats: dict, title: str, note: str = "") -> str:
    lines = [f"### vs {title}", ""]
    if note:
        lines += [note, ""]
    lines += ["| config | reviews | aspect P | aspect R | aspect F1 | neg-issue F1 | sentiment agree | "
              "severity MAE | sev within 1 | dept agree |",
              "|---|---|---|---|---|---|---|---|---|---|"]
    for name, sc in scores.items():
        lines.append(f"| {name} | {sc['n_reviews']} | {fmt(sc['precision'])} | {fmt(sc['recall'])} | "
                     f"{fmt(sc['f1'])} | {fmt(sc['neg_f1'])} | {fmt(sc['sentiment_agree'], True)} | "
                     f"{fmt(sc['severity_mae'])} | {fmt(sc['severity_within1'], True)} | "
                     f"{fmt(sc['dept_agree'], True)} |")
    return "\n".join(lines) + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--configs", default=",".join(CONFIGS))
    ap.add_argument("--no-silver", action="store_true")
    ap.add_argument("--synthetic-n", type=int, default=120)
    ap.add_argument("--concurrency", type=int, default=8)
    args = ap.parse_args()
    config.require_keys(("NEBIUS_API_KEY",))
    RESULTS.mkdir(exist_ok=True)

    sheet = pd.read_csv(LABELS).fillna("")
    sheet["parsed"] = sheet["labels"].map(parse_label)
    human = {f"e{r.eval_id}": r.parsed for r in sheet.itertuples() if r.parsed is not None}
    print(f"Human-labeled rows: {len(human)} / {len(sheet)}")
    eval_reviews = [{"review_id": f"e{r.eval_id}", "text": clean_text(r.text)} for r in sheet.itertuples()]

    # synthetic subset (stratified: planted issue reviews + background)
    syn_reviews, syn_refs = [], {}
    if SYN_GT.exists() and SYN_CSV.exists():
        gt = json.loads(SYN_GT.read_text(encoding="utf-8"))
        specs = {s["review_id"]: s for s in gt["reviews"]}
        sdf = pd.read_csv(SYN_CSV)
        sdf = sdf.sample(n=min(args.synthetic_n, len(sdf)), random_state=7)
        for r in sdf.itertuples():
            syn_reviews.append({"review_id": r.review_id, "text": clean_text(r.text)})
            syn_refs[r.review_id] = specs[r.review_id]["aspects"]
        print(f"Synthetic reviews in eval: {len(syn_reviews)}")

    all_reviews = eval_reviews + syn_reviews

    # silver labels: Ultra thinking ON (cached)
    silver, silver_stats = {}, None
    if not args.no_silver:
        cached = json.loads(SILVER.read_text(encoding="utf-8")) if SILVER.exists() else {}
        todo = [rv for rv in eval_reviews if rv["review_id"] not in cached]
        if todo:
            print(f"Silver labels: running Ultra thinking ON on {len(todo)} reviews (cached afterwards)")
            preds, st = run_config("silver_ultra_on", "ultra", True, todo, args.concurrency)
            cached.update(preds)
            SILVER.write_text(json.dumps(cached), encoding="utf-8")
            cached["_stats"] = cached.get("_stats") or st
            SILVER.write_text(json.dumps(cached), encoding="utf-8")
        silver_stats = cached.pop("_stats", None)
        silver = {k: v for k, v in cached.items() if k.startswith("e")}

    stats, preds_by = {}, {}
    print("Running configs:")
    for name in args.configs.split(","):
        model, thinking = CONFIGS[name]
        preds_by[name], stats[name] = run_config(name, model, thinking, all_reviews, args.concurrency)

    sections = []
    scores_h = {n: score(p, human) for n, p in preds_by.items()} if human else {}
    scores_s = {n: score(p, silver) for n, p in preds_by.items()} if silver else {}
    scores_y = {n: score(p, syn_refs, recall_only=True) for n, p in preds_by.items()} if syn_refs else {}

    # decision: primary reference = human if enough labels, else silver
    if len(human) >= MIN_HUMAN:
        primary, prim_name = scores_h, "human labels"
    elif scores_s:
        primary, prim_name = scores_s, "silver (Ultra thinking ON)"
    else:
        primary, prim_name = scores_y, "synthetic ground truth"
    issues_s = {n: issue_level(p, silver) for n, p in preds_by.items()} if silver else {}
    issues_y = {n: issue_level(p, syn_refs) for n, p in preds_by.items()} if syn_refs else {}
    issues_h = {n: issue_level(p, human) for n, p in preds_by.items()} if len(human) >= MIN_HUMAN else {}

    # Decision rule (fixed before the final run):
    #  1. final JSON failure rate <= 2%
    #  2. issue level: top-3 negative aspects overlap the reference's top-3 by >= 2 on every reference
    #  3. review level: neg-issue F1 within 0.10 of the best config on the primary reference. "Best"
    #     excludes ultra_off when the reference is the Ultra silver set (same-model bias).
    #  -> cheapest passing config; if none pass, the config with the best neg-issue F1.
    unbiased = [n for n in primary if not (prim_name.startswith("silver") and n.startswith("ultra"))] or list(primary)
    best = max(primary[n]["neg_f1"] for n in unbiased)
    rule = {}
    for n in primary:
        ok_json = stats[n]["json_fail_final"] <= 0.02
        ok_issue = all(d[n]["top3_overlap"] >= 2 for d in (issues_s, issues_y, issues_h) if d)
        ok_f1 = primary[n]["neg_f1"] >= best - 0.10
        rule[n] = {"json": ok_json, "issue_level": ok_issue, "review_level": ok_f1}
    passing = [n for n, r in rule.items() if all(r.values())]
    choice = (min(passing, key=lambda n: stats[n]["cost_per_1k"]) if passing
              else max(primary, key=lambda n: primary[n]["neg_f1"]))

    md = ["# Extraction eval summary", "",
          f"_Generated by `scripts/run_eval.py` on {time.strftime('%Y-%m-%d %H:%M')}._", ""]
    md += [f"- Human-labeled rows: **{len(human)}** of {len(sheet)}."]
    if len(human) < MIN_HUMAN:
        md += [f"- **Fewer than {MIN_HUMAN} rows are hand-labeled, so the human-label comparison is "
               f"{'not available' if not human else 'not statistically meaningful'}.** The model choice below is "
               "based on agreement with the silver reference (Ultra, thinking ON, i.e. the expensive "
               "all-Ultra baseline) on the 100 real eval reviews, plus recall on planted synthetic aspects. "
               "Re-run this script after labeling to replace it with a human-label comparison."]
    md += [f"- Eval reviews: {len(eval_reviews)} real (Datafiniti, not redistributed) + "
           f"{len(syn_reviews)} synthetic.", ""]
    md += ["## Decision", "",
           f"**Extraction uses `{choice}`.**", "",
           "Rule (fixed before the final run): the cheapest config that (1) fails JSON on at most 2% of "
           "reviews after one retry, (2) recovers at least 2 of the reference's top-3 negative aspects on "
           f"every reference, and (3) has negative-issue F1 within 0.10 of the best config vs {prim_name} "
           f"(best = {best:.2f}; `ultra_off` excluded from 'best' because it is the reference's own model).", "",
           "| config | JSON ok | issue-level ok | review-level ok | cost per 1k reviews |",
           "|---|---|---|---|---|"]
    md += [f"| {n} | {'yes' if r['json'] else 'no'} | {'yes' if r['issue_level'] else 'no'} | "
           f"{'yes' if r['review_level'] else 'no'} | ${stats[n]['cost_per_1k']:.3f} |" for n, r in rule.items()]
    md.append("")
    md += ["## Issue-level agreement (what the briefing consumes)", "",
           "Aspects ranked by number of negative mentions. top-3 overlap = how many of the reference's "
           "top-3 negative aspects the config also ranks top-3. Count error = sum of |count differences| / "
           "reference negative mentions.", "",
           "| config | reference | top-3 overlap | config top-3 | reference top-3 | Spearman (11 aspects) | count error |",
           "|---|---|---|---|---|---|---|"]
    for label, d in (("human", issues_h), ("silver", issues_s), ("synthetic", issues_y)):
        for n, x in d.items():
            md.append(f"| {n} | {label} | {x['top3_overlap']}/3 | {', '.join(x['top3_pred'])} | "
                      f"{', '.join(x['top3_ref'])} | {fmt(x['spearman'])} | {fmt(x['count_err'], True)} |")
    md.append("")
    md += ["## Cost, latency, reliability (all eval reviews)", "",
           "| config | reviews | mean latency / review | JSON fail (1st try) | JSON fail (after retry) | "
           "reasoning tokens | cost | cost per 1k reviews |",
           "|---|---|---|---|---|---|---|---|"]
    for n, st in stats.items():
        md.append(f"| {n} | {st['n']} | {st['mean_latency_s']:.2f}s | {st['json_fail_first']:.1%} | "
                  f"{st['json_fail_final']:.1%} | {st['reasoning_tokens']:,} | ${st['cost_usd']:.4f} | "
                  f"${st['cost_per_1k']:.3f} |")
    if silver_stats:
        md.append(f"| _silver: ultra_on_ | {silver_stats['n']} | {silver_stats['mean_latency_s']:.2f}s | "
                  f"{silver_stats['json_fail_first']:.1%} | {silver_stats['json_fail_final']:.1%} | "
                  f"{silver_stats['reasoning_tokens']:,} | ${silver_stats['cost_usd']:.4f} | "
                  f"${silver_stats['cost_per_1k']:.3f} |")
    md.append("")
    md += ["## Quality", "",
           "Metrics: aspect P/R/F1 match on aspect name per review (micro-averaged). Neg-issue F1 matches "
           "(aspect, negative) pairs, which is what feeds the issue ranking. Sentiment, severity and "
           "department are scored on matched aspects.", ""]
    if scores_h:
        sections.append(table(scores_h, stats, f"human labels ({len(human)} rows)",
                              "Human labels have no department column, so department agreement is n/a."
                              + (" **Too few rows to be conclusive.**" if len(human) < MIN_HUMAN else "")))
    if scores_s:
        sections.append(table(scores_s, stats, "silver reference: Ultra thinking ON (100 real reviews)",
                              "Caveat: `ultra_off` is the same model as the reference, so its agreement is "
                              "inflated. Treat this as 'how close does a cheap config get to the expensive "
                              "baseline', not as accuracy."))
    if scores_y:
        sections.append(table(scores_y, stats, f"synthetic planted aspects ({len(syn_refs)} reviews)",
                              "Recall is the meaningful number: the review writer may add aspects beyond the "
                              "planted ones, which count as false positives here."))
    md += sections
    md += ["## Notes", "",
           "- All configs use the same prompt, `temperature=0` (0.6 with thinking), JSON mode, and one retry.",
           "- Costs are estimates from list prices; reasoning tokens are billed as output tokens.",
           "- Raw per-review outputs: `results/<config>.jsonl` (gitignored: they reference licensed reviews)."]
    (RESULTS / "eval_summary.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    (RESULTS / "eval_decision.json").write_text(json.dumps({
        "choice": choice, "primary_reference": prim_name, "human_labeled": len(human),
        "stats": stats, "scores_primary": primary}, indent=2), encoding="utf-8")
    print(f"\nDecision: {choice}  (vs {prim_name})\nWrote results/eval_summary.md | "
          f"dev spend so far ${config.SPEND.get():.3f}")


if __name__ == "__main__":
    main()
