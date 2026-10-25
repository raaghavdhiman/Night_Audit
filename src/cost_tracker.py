"""Cost ledger: every model / tool call is recorded here.

A Ledger belongs to one pipeline run. The "active" ledger and stage are held in
contextvars so call_model() can log without threading a ledger argument through
every function (works for threads started with copy_context and for asyncio tasks).

Separately, SpendCounter is a persisted running total of estimated spend used for
the hard spend cap (see src/limits.py).
"""
from __future__ import annotations

import contextvars
import json
import os
import threading
import time
from contextlib import contextmanager
from dataclasses import asdict, dataclass, field
from pathlib import Path

# USD per 1M tokens (input, output). Reasoning tokens are treated as billed output
# tokens. That is an assumption (unverified against an invoice): see FEEDBACK.md.
PRICES = {
    "lightning": (0.06, 0.24),
    "super": (0.30, 0.90),
    "ultra": (1.00, 3.00),
}

MODEL_LABELS = {
    "lightning": "Nemotron 3.5 Lightning",
    "super": "Nemotron 3 Super 120B",
    "ultra": "Nemotron 3 Ultra 550B",
}


def cost_usd(model: str, tokens_in: int, tokens_out: int) -> float:
    """tokens_out must already include reasoning tokens (OpenAI usage convention)."""
    p_in, p_out = PRICES[model]
    return (tokens_in * p_in + tokens_out * p_out) / 1_000_000


@dataclass
class CallRecord:
    stage: str
    model: str
    thinking: bool
    tokens_in: int
    tokens_out: int
    reasoning_tokens: int
    latency_s: float
    cost_usd: float
    finish_reason: str | None = None
    ok: bool = True
    ts: float = field(default_factory=time.time)


@dataclass
class ToolRecord:
    stage: str
    tool: str
    latency_s: float
    credits: int = 1
    ok: bool = True
    cached: bool = False
    ts: float = field(default_factory=time.time)


class Ledger:
    def __init__(self, name: str = "run", on_cost=None):
        self.name = name
        self.calls: list[CallRecord] = []
        self.tools: list[ToolRecord] = []
        self._lock = threading.Lock()
        self._on_cost = on_cost  # callback(float usd) for the persisted spend counter
        self.started = time.time()

    def add_call(self, rec: CallRecord) -> None:
        with self._lock:
            self.calls.append(rec)
        if self._on_cost and rec.cost_usd:
            self._on_cost(rec.cost_usd)

    def add_tool(self, rec: ToolRecord) -> None:
        with self._lock:
            self.tools.append(rec)

    @property
    def total_cost(self) -> float:
        with self._lock:
            return sum(c.cost_usd for c in self.calls)

    def summary(self) -> dict:
        """Per-stage and total summary (the 'guest folio')."""
        with self._lock:
            calls = list(self.calls)
            tools = list(self.tools)
        stages: dict[str, dict] = {}
        for c in calls:
            s = stages.setdefault(c.stage, {
                "stage": c.stage, "models": [], "calls": 0, "failed_calls": 0,
                "tokens_in": 0, "tokens_out": 0, "reasoning_tokens": 0,
                "model_seconds": 0.0, "cost_usd": 0.0, "first_ts": c.ts, "last_ts": c.ts,
                "thinking": False,
            })
            if c.model not in s["models"]:
                s["models"].append(c.model)
            s["calls"] += 1
            s["failed_calls"] += 0 if c.ok else 1
            s["tokens_in"] += c.tokens_in
            s["tokens_out"] += c.tokens_out
            s["reasoning_tokens"] += c.reasoning_tokens
            s["model_seconds"] += c.latency_s
            s["cost_usd"] += c.cost_usd
            s["thinking"] = s["thinking"] or c.thinking
            s["first_ts"] = min(s["first_ts"], c.ts - c.latency_s)
            s["last_ts"] = max(s["last_ts"], c.ts)
        for t in tools:
            s = stages.setdefault(t.stage, {
                "stage": t.stage, "models": [], "calls": 0, "failed_calls": 0,
                "tokens_in": 0, "tokens_out": 0, "reasoning_tokens": 0,
                "model_seconds": 0.0, "cost_usd": 0.0, "first_ts": t.ts, "last_ts": t.ts,
                "thinking": False,
            })
            s.setdefault("tool_calls", 0)
            s.setdefault("tool_credits", 0)
            s.setdefault("tool_cached", 0)
            s["tool_calls"] += 1
            s["tool_credits"] += 0 if t.cached else t.credits
            s["tool_cached"] += 1 if t.cached else 0
        out = []
        for s in stages.values():
            # wall-clock seconds for the stage (calls overlap under concurrency)
            s["wall_seconds"] = round(max(0.0, s.pop("last_ts") - s.pop("first_ts")), 2)
            s["model_seconds"] = round(s["model_seconds"], 2)
            s["cost_usd"] = round(s["cost_usd"], 6)
            out.append(s)
        total = {
            "calls": sum(s["calls"] for s in out),
            "tokens_in": sum(s["tokens_in"] for s in out),
            "tokens_out": sum(s["tokens_out"] for s in out),
            "reasoning_tokens": sum(s["reasoning_tokens"] for s in out),
            "cost_usd": round(sum(s["cost_usd"] for s in out), 6),
            "tool_calls": sum(s.get("tool_calls", 0) for s in out),
            "wall_seconds": round(time.time() - self.started, 2),
        }
        return {"stages": out, "total": total}

    def records(self) -> list[dict]:
        with self._lock:
            return [asdict(c) for c in self.calls]


# --- active ledger / stage (contextvars) -----------------------------------
_default_ledger = Ledger("default")
_current_ledger: contextvars.ContextVar[Ledger] = contextvars.ContextVar("ledger", default=_default_ledger)
_current_stage: contextvars.ContextVar[str] = contextvars.ContextVar("stage", default="misc")


def current_ledger() -> Ledger:
    return _current_ledger.get()


def current_stage() -> str:
    return _current_stage.get()


@contextmanager
def use_ledger(ledger: Ledger):
    tok = _current_ledger.set(ledger)
    try:
        yield ledger
    finally:
        _current_ledger.reset(tok)


@contextmanager
def stage(name: str):
    tok = _current_stage.set(name)
    try:
        yield
    finally:
        _current_stage.reset(tok)


# --- persisted spend counter -------------------------------------------------
class SpendCounter:
    """Persisted running total of estimated USD spend.

    Backends: a local JSON file (default), or Upstash Redis over REST when
    UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are set (survives redeploys on
    hosts with ephemeral disks, e.g. Render free tier).
    """

    def __init__(self, path: Path, redis_key: str = "nightaudit:spend_usd"):
        self.path = Path(path)
        self._lock = threading.Lock()
        self._redis_url = os.environ.get("UPSTASH_REDIS_REST_URL", "").rstrip("/")
        self._redis_token = os.environ.get("UPSTASH_REDIS_REST_TOKEN", "")
        self._redis_key = redis_key
        self.backend = "upstash" if (self._redis_url and self._redis_token) else "file"

    # file backend (one writer process expected; reads retry so a concurrent replace never resets to 0)
    def _read_file(self) -> float:
        if not self.path.exists():
            return 0.0
        for _ in range(20):
            try:
                v = float(json.loads(self.path.read_text(encoding="utf-8"))["spend_usd"])
                self._last = max(getattr(self, "_last", 0.0), v)
                return v
            except FileNotFoundError:
                return getattr(self, "_last", 0.0)
            except (OSError, ValueError, KeyError):
                time.sleep(0.02)
        return getattr(self, "_last", 0.0)

    def _write_file(self, value: float) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(f".{os.getpid()}.tmp")
        tmp.write_text(json.dumps({"spend_usd": value, "updated": time.time()}), encoding="utf-8")
        for _ in range(20):
            try:
                os.replace(tmp, self.path)
                return
            except PermissionError:  # Windows: target briefly open in another process
                time.sleep(0.02)
        self._last = value

    # redis backend
    def _redis(self, *cmd):
        import httpx
        r = httpx.post(self._redis_url, json=list(cmd),
                       headers={"Authorization": f"Bearer {self._redis_token}"}, timeout=5)
        r.raise_for_status()
        return r.json().get("result")

    def get(self) -> float:
        if self.backend == "upstash":
            try:
                return float(self._redis("GET", self._redis_key) or 0.0)
            except Exception:
                # fail closed: if we cannot read the counter, report it as over any cap
                return float("inf")
        with self._lock:
            return self._read_file()

    def add(self, usd: float) -> float:
        if self.backend == "upstash":
            try:
                return float(self._redis("INCRBYFLOAT", self._redis_key, f"{usd:.8f}"))
            except Exception:
                return float("inf")
        with self._lock:
            v = self._read_file() + usd
            self._write_file(v)
            return v
