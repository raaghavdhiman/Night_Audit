# FEEDBACK / running notes

Append-only log of findings while building Night Audit (Nebius x NVIDIA hackathon).
Newest entries at the bottom. Do not rewrite earlier entries.

---

## 2026-10-25 - repo inspection (Claude)
- FEEDBACK.md, .gitignore, .env.example, requirements.txt and LICENSE did not exist yet; created them.
  Repo was not a git repository; initialized with `main`.
- `data/eval/label_sheet.csv` has 100 rows, **0 labeled** at the time of inspection.
  run_eval.py therefore also scores against fallback references (see eval section below).
- `archive.zip` (13.7 MB, the Datafiniti download) sits at the repo root: gitignored.
- In the 100-row eval sample, 25 reviews contain a glued manager reply ("Dear ..., thank you ...")
  and 33 contain "...More" truncation markers. Real-world input is messy; prompts must handle it.
- Local Python default is 3.14; venv resolved to pandas 3.1 and openai 3.37.

## 2026-10-25 - API probe (scripts/probe_api.py, cost $0.0031)
- All three models answer with thinking OFF: reasoning_tokens=0, finish=stop, 0.4-1.0 s for a tiny prompt.
- Token accounting: Lightning thinking ON returned completion_tokens=337, reasoning_tokens=332 and a
  1-word answer. So **completion_tokens already includes reasoning tokens** (OpenAI convention).
  The cost estimate bills completion_tokens at the output price; that reasoning is billed at the
  output rate is still an assumption until checked against the Token Factory invoice.
- **Tool calling on Ultra works natively** (OpenAI `tools` + `tool_choice="auto"`), thinking ON and OFF:
  finish_reason=tool_calls, arguments are valid JSON, and the second turn with a `role: tool` message
  is accepted. Super also works. The "call Tavily yourself" fallback is kept in code for robustness
  but is not the primary path.
- Gotcha: with no date in context the models write "2024" into search queries. The investigate
  prompt includes today's date and the review date range.

## 2026-10-25 - extraction eval (scripts/run_eval.py -> results/eval_summary.md)
- 0 hand labels, so references were: silver = Ultra thinking ON on the 100 real eval reviews ($0.43,
  5.5 s/review, cached), and the planted aspects of 160 synthetic reviews.
- First prompt: Lightning (thinking off) over-predicted `value_price` negatives (16 false positives in 100
  reviews: it used price as a catch-all for general dissatisfaction) and confused front_desk/staff_general.
  Added explicit rules + 2 short examples. Lightning neg-issue F1 vs silver 0.72 -> 0.75; Super 0.79 -> 0.80
  (Super's recall jumped 0.61 -> 0.86).
- **Lightning with thinking ON is a trap for extraction**: ~4,700 reasoning tokens per short review, 66 s mean
  latency, 18-29% first-try JSON failures (truncated at max_tokens), 14x the cost of thinking off. Quality is
  good (neg F1 0.89) but it is slower and dearer than Super/Ultra with thinking off.
- Final rule (fixed before the last run): cheapest config with <=2% JSON failure, top-3 issue overlap >=2 on every
  reference, and neg-issue F1 within 0.10 of the best. Result: **Super thinking OFF** ($0.40 / 1k reviews).
  Lightning thinking off is 5x cheaper but fails the review-level bar (0.75 vs 0.89; synthetic 0.79 vs 0.93).
  So the brief's original plan (Lightning for extraction) was overridden by the data.
- Bug found: two processes writing dev_spend.json at once reset the counter (a failed read returned 0).
  Reads now retry and never fall back to 0; the dev total was reconstructed from run logs (~$1.90).

## 2026-10-25 - trends stage (scripts/eval_trends.py -> results/eval_trends.md)
- Super thinking ON and OFF both returned the planted top 3 (food_beverage, noise, + the bed-bug report) in
  2/2 runs each: top-3 precision 1.00. Thinking ON costs ~$0.003 vs $0.0014 and takes 13-16 s vs 3-6 s, but
  writes more specific headlines ("Breakfast buffet depleted by 8:30 AM" vs "Food & beverage complaints surge
  past 30%"). Kept thinking ON for trends: the briefing headline is the product.

## 2026-10-25 - investigate (Ultra + Tavily tool calling)
- Native tool calling loop works: on the breakfast issue Ultra used 4/4 searches and cited KXAN / Yahoo
  coverage of "Austin hotels could reach 95% occupancy as Formula One returns" -> hypothesis: event-driven
  occupancy outran static breakfast par levels. $0.034 and 27 s per issue.
- Tavily `basic` results for generic queries include junk (author pages, Instagram reels); only cited
  sources are highlighted in the UI and URLs only ever come from Tavily, never from model text.
- Synthetic generation: 1 of 600 Lightning outputs had an empty review body; generator now requires >= 20 chars.

## 2026-10-25 - full pipeline on the synthetic hotel (scripts/build_demo.py)
- Recovered the planted story: top 3 = noise, food_beverage, cleanliness (bed bugs) -> precision 1.00; both
  severity-5 incidents escalated; weekly detected negatives within +-1 of planted for both trends.
- Investigation found TxDOT's I-35 Capital Express nightly closures for the noise issue and ACL / F1 occupancy
  for breakfast. Ultra used 11-12 of the 12 allowed searches. Native tool calling, no fallback needed.
- Routed run $0.318 / 124 s for 600 reviews (incl. the later reply re-draft); all-Ultra-thinking baseline measured $0.185 on 20 reviews,
  extrapolated $2.18 -> 85% saved. Extraction is 75% of the routed cost.
- First demo copy leaked machine values ("0.2715 (27.15%)", "change_vs_baseline of 1.177", ISO dates).
  Fixed in the trends prompt (newspaper-style numbers). Pull quotes opened on scene-setting ("Arrived in Austin
  buzzing..."): quotes now start at the first sentence that mentions the aspect, with the manager reply removed.
- Live end-to-end in a real browser (headless Edge via playwright-core): 120-review sample, 66 s, $0.124,
  no console errors. Spend-cap test: counter preset to $0.049 with cap $0.05 -> the run stopped itself
  before trends ("global spend cap reached before trends"); afterwards /api/config reports spend_cap and
  uploads get 429. With both keys removed: loud banner, demo served (679 KB), live returns 503 no_keys.
- UI self-review fixes: a `.trail li {display:flex}` rule leaked into the sources list (titles squeezed into
  a 1-word column); folio columns collided ("686.1k2m 0s"); the APPROVED stamp covered the guest quote; the
  folio total stayed $0 during a run (now tracks running cost); the sample CSV covered only 2 weeks (now every
  5th review across all 8).
- Not verified locally: `docker build` (Docker is not installed on this machine). The Dockerfile is the
  standard two-stage pattern; first verification will be Render's build log.
- Dev spend so far: ~$2.86 estimated (well under the $10 budget).
