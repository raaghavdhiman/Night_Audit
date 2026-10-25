# config.py
"""Model registry, Token Factory clients, and call_model() which logs every call."""
from __future__ import annotations

import os
import time
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv
from openai import AsyncOpenAI, OpenAI

from src.cost_tracker import CallRecord, SpendCounter, cost_usd, current_ledger, current_stage

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")  # reads your .env file

DATA = ROOT / "data"
RUNTIME = DATA / "runtime"

MODELS = {
    "lightning": {
        "id": "nvidia/Nemotron-3_5-Lightning",
        "base_url": "https://api.tokenfactory.nebius.com/v1/",
    },
    "super": {
        "id": "nvidia/nemotron-3-super-120b-a12b",
        "base_url": "https://api.tokenfactory.us-central1.nebius.com/v1/",
    },
    "ultra": {
        "id": "nvidia/Nemotron-3-Ultra-550b-a55b",
        "base_url": "https://api.tokenfactory.us-central1.nebius.com/v1/",
    },
}

REQUIRED_KEYS = ("NEBIUS_API_KEY", "TAVILY_API_KEY")


def check_keys(required=REQUIRED_KEYS) -> list[str]:
    """Return the names of missing keys (never their values)."""
    return [k for k in required if not os.environ.get(k, "").strip()]


def require_keys(required=REQUIRED_KEYS) -> None:
    missing = check_keys(required)
    if missing:
        raise SystemExit(
            f"Missing required environment variable(s): {', '.join(missing)}. "
            "Copy .env.example to .env and fill them in."
        )


# --- persisted spend counter -----------------------------------------------
# Scripts (dev work) count into dev_spend.json; the API server switches to its own
# file via set_spend_file() so dev spend does not eat the live-mode cap.
SPEND = SpendCounter(Path(os.environ.get("SPEND_FILE", RUNTIME / "dev_spend.json")))


def set_spend_file(path: Path) -> SpendCounter:
    global SPEND
    SPEND = SpendCounter(Path(path))
    return SPEND


# --- clients: one per base URL -----------------------------------------------
_clients: dict[str, OpenAI] = {}
_aclients: dict[str, AsyncOpenAI] = {}
TIMEOUT_S = float(os.environ.get("MODEL_TIMEOUT_S", "180"))


def _key() -> str:
    key = os.environ.get("NEBIUS_API_KEY", "").strip()
    if not key:
        raise RuntimeError("NEBIUS_API_KEY is not set")
    return key


def get_client(name):
    """Returns (client, model_id) for a model nickname like 'ultra'."""
    base = MODELS[name]["base_url"]
    if base not in _clients:
        _clients[base] = OpenAI(base_url=base, api_key=_key(), timeout=TIMEOUT_S, max_retries=2)
    return _clients[base], MODELS[name]["id"]


def get_async_client(name):
    """Async twin of get_client. One AsyncOpenAI per base URL (per event loop)."""
    base = MODELS[name]["base_url"]
    if base not in _aclients:
        _aclients[base] = AsyncOpenAI(base_url=base, api_key=_key(), timeout=TIMEOUT_S, max_retries=2)
    return _aclients[base], MODELS[name]["id"]


def reset_async_clients() -> None:
    """AsyncOpenAI clients are bound to an event loop; call between asyncio.run()s."""
    _aclients.clear()


# --- calling ---------------------------------------------------------------
@dataclass
class ModelResult:
    text: str
    reasoning: str | None
    finish_reason: str | None
    tokens_in: int
    tokens_out: int
    reasoning_tokens: int
    latency_s: float
    cost_usd: float
    model: str
    thinking: bool
    tool_calls: list = field(default_factory=list)
    message: object = None  # raw assistant message (for tool-calling loops)

    @property
    def truncated(self) -> bool:
        return self.finish_reason == "length"


def _build_kwargs(thinking: bool, max_tokens: int | None, kw: dict) -> dict:
    extra = dict(kw.pop("extra_body", None) or {})
    tmpl = dict(extra.get("chat_template_kwargs") or {})
    tmpl["enable_thinking"] = bool(thinking)
    extra["chat_template_kwargs"] = tmpl
    # Reasoning tokens count against max_tokens, so thinking needs a much bigger budget.
    kw["max_tokens"] = max_tokens or (8000 if thinking else 1500)
    kw["extra_body"] = extra
    return kw


def _finish(name, thinking, resp, t0, stage_name) -> ModelResult:
    latency = time.time() - t0
    choice = resp.choices[0]
    msg = choice.message
    u = resp.usage
    t_in = getattr(u, "prompt_tokens", 0) or 0
    t_out = getattr(u, "completion_tokens", 0) or 0
    details = getattr(u, "completion_tokens_details", None)
    r_tok = (getattr(details, "reasoning_tokens", 0) or 0) if details else 0
    reasoning = getattr(msg, "reasoning_content", None)
    if reasoning is None and getattr(msg, "model_extra", None):
        reasoning = msg.model_extra.get("reasoning_content")
    # completion_tokens includes reasoning tokens (verified, see FEEDBACK.md); guard anyway
    billed_out = max(t_out, r_tok)
    cost = cost_usd(name, t_in, billed_out)
    rec = CallRecord(stage=stage_name, model=name, thinking=thinking, tokens_in=t_in,
                     tokens_out=billed_out, reasoning_tokens=r_tok, latency_s=round(latency, 3),
                     cost_usd=cost, finish_reason=choice.finish_reason)
    current_ledger().add_call(rec)
    SPEND.add(cost)
    return ModelResult(text=msg.content or "", reasoning=reasoning, finish_reason=choice.finish_reason,
                       tokens_in=t_in, tokens_out=billed_out, reasoning_tokens=r_tok,
                       latency_s=latency, cost_usd=cost, model=name, thinking=thinking,
                       tool_calls=list(msg.tool_calls or []), message=msg)


def _fail(name, thinking, t0, stage_name):
    current_ledger().add_call(CallRecord(stage=stage_name, model=name, thinking=thinking, tokens_in=0,
                                         tokens_out=0, reasoning_tokens=0,
                                         latency_s=round(time.time() - t0, 3), cost_usd=0.0,
                                         finish_reason="error", ok=False))


def call_model(name, messages, thinking=False, max_tokens=None, stage=None, **kw) -> ModelResult:
    """Synchronous model call. Returns text + usage and logs to the active ledger."""
    client, model_id = get_client(name)
    stage_name = stage or current_stage()
    kw = _build_kwargs(thinking, max_tokens, kw)
    t0 = time.time()
    try:
        resp = client.chat.completions.create(model=model_id, messages=messages, **kw)
    except Exception:
        _fail(name, thinking, t0, stage_name)
        raise
    return _finish(name, thinking, resp, t0, stage_name)


async def acall_model(name, messages, thinking=False, max_tokens=None, stage=None, **kw) -> ModelResult:
    """Async model call (used for high-concurrency extraction)."""
    client, model_id = get_async_client(name)
    stage_name = stage or current_stage()
    kw = _build_kwargs(thinking, max_tokens, kw)
    t0 = time.time()
    try:
        resp = await client.chat.completions.create(model=model_id, messages=messages, **kw)
    except Exception:
        _fail(name, thinking, t0, stage_name)
        raise
    return _finish(name, thinking, resp, t0, stage_name)
