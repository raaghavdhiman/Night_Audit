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
