"""Probe Token Factory behaviour: 1 call per model (thinking off), token accounting
with thinking on, and tool calling on Ultra/Super. Cheap (< $0.02)."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src import config  # noqa: E402
from src.cost_tracker import Ledger, use_ledger  # noqa: E402

config.require_keys(("NEBIUS_API_KEY",))
MSG = [{"role": "user", "content": "Reply with exactly the JSON {\"ok\": true} and nothing else."}]

TOOLS = [{
    "type": "function",
    "function": {
        "name": "web_search",
        "description": "Search the web for recent local news.",
        "parameters": {
            "type": "object",
            "properties": {"query": {"type": "string", "description": "search query"}},
            "required": ["query"],
        },
    },
}]

ledger = Ledger("probe")
with use_ledger(ledger):
    for name in ("lightning", "super", "ultra"):
        r = config.call_model(name, MSG, thinking=False, max_tokens=200, stage="probe")
        print(f"{name:9} off  finish={r.finish_reason} in={r.tokens_in} out={r.tokens_out} "
              f"reason={r.reasoning_tokens} {r.latency_s:.1f}s text={r.text.strip()[:60]!r}")

    r = config.call_model("lightning", [{"role": "user", "content": "What is 17*23? Answer with the number."}],
                          thinking=True, max_tokens=2000, stage="probe")
    vis = len((r.text or "").split())
    print(f"lightning ON   finish={r.finish_reason} completion_tokens={r.tokens_out} "
          f"reasoning_tokens={r.reasoning_tokens} visible_words={vis} "
          f"has_reasoning_content={bool(r.reasoning)} text={r.text.strip()[:40]!r}")

    for name in ("ultra", "super"):
        for thinking in (True, False):
            msgs = [{"role": "system", "content": "You are a research agent. Use the web_search tool."},
                    {"role": "user", "content": "Find recent construction news near Union Square, San Francisco."}]
            try:
                r = config.call_model(name, msgs, thinking=thinking, max_tokens=3000, stage="probe",
                                      tools=TOOLS, tool_choice="auto")
                tc = [(t.function.name, t.function.arguments) for t in r.tool_calls]
                print(f"{name:9} tools thinking={thinking} finish={r.finish_reason} tool_calls={tc} "
                      f"text={r.text.strip()[:80]!r}")
                if tc:
                    json.loads(tc[0][1])
                    # second turn: feed a fake result back and check it answers
                    msgs.append(r.message.model_dump(exclude_none=True))
                    msgs.append({"role": "tool", "tool_call_id": r.tool_calls[0].id,
                                 "content": json.dumps([{"title": "Crane work on Geary St", "url": "https://example.com"}])})
                    r2 = config.call_model(name, msgs, thinking=thinking, max_tokens=3000, stage="probe", tools=TOOLS)
                    print(f"          turn2 finish={r2.finish_reason} more_tools={len(r2.tool_calls)} "
                          f"text={r2.text.strip()[:100]!r}")
            except Exception as e:
                print(f"{name:9} tools thinking={thinking} FAILED: {type(e).__name__}: {str(e)[:300]}")

s = ledger.summary()["total"]
print(f"\nprobe cost ${s['cost_usd']:.5f}  | dev spend so far ${config.SPEND.get():.4f}")
