"""Orchestrates EXTRACT -> TRENDS -> INVESTIGATE -> REPLIES and yields progress events.

    async for event in run_pipeline(df, meta): ...

Events (dicts with "type"): start, stage, progress, search, search_done, fallback, issue_done,
folio, result, error. The final event is "result" (or "error").
"""
from __future__ import annotations

import asyncio
import time
from datetime import date, datetime, timezone

import pandas as pd

from src import config
from src.cost_tracker import MODEL_LABELS, Ledger, stage, use_ledger
from src.extract import extract_all
from src.investigate import MAX_TOOL_CALLS, investigate_issue
from src.replies import draft_replies
from src.trends import ASPECT_LABELS, compute_trends, focus_excerpt, interpret, quotes_for

# Final routing (decided by scripts/run_eval.py and scripts/eval_trends.py; see README).
ROUTING = {
    "extract": ("super", False),
    "trends": ("super", True),
    "investigate": ("ultra", True),
    "replies": ("lightning", False),
}
BASELINE_ROUTING = {k: ("ultra", True) for k in ROUTING}
STAGES = ["extract", "trends", "investigate", "replies"]
STAGE_LABELS = {"extract": "Extract", "trends": "Trends", "investigate": "Investigate", "replies": "Replies"}


class BudgetExceeded(RuntimeError):
    pass


def _period(df: pd.DataFrame) -> str:
    d = df["date"].dropna()
    if d.empty:
        return "undated reviews"
    return f"{d.min():%b %d, %Y} to {d.max():%b %d, %Y}"


STALE_AFTER_DAYS = 90


def stale_note(df: pd.DataFrame, today: date) -> str | None:
    """A warning when the newest review is more than STALE_AFTER_DAYS old: Tavily searches today's web."""
    d = df["date"].dropna()
    if d.empty:
        return None
    newest = d.max().date()
    if (today - newest).days <= STALE_AFTER_DAYS:
        return None
    return f"These reviews end in {newest:%B %Y}. Web search reflects today, so outside causes may not apply."


async def run_pipeline(df: pd.DataFrame, meta: dict, routing: dict | None = None, ledger: Ledger | None = None,
                       max_run_cost: float | None = None, budget_ok=None, replies_k: int = 5,
                       extract_concurrency: int = 10, include_reviews: bool = True, heartbeat_s: float = 10.0):
    """Async generator of progress events; last event is {"type": "result", "result": {...}}."""
    routing = routing or ROUTING
    ledger = ledger or Ledger("run")
    q: asyncio.Queue = asyncio.Queue()
    loop = asyncio.get_running_loop()

    def emit(e):  # thread-safe
        loop.call_soon_threadsafe(q.put_nowait, e)

    def check_budget(where: str):
        if max_run_cost is not None and ledger.total_cost > max_run_cost:
            raise BudgetExceeded(f"run cost cap reached before {where}")
        if budget_ok is not None and not budget_ok():
            raise BudgetExceeded(f"global spend cap reached before {where}")

    async def work():
        with use_ledger(ledger):
            return await _work(df, meta, routing, ledger, emit, check_budget, replies_k, extract_concurrency,
                               include_reviews)

    task = asyncio.create_task(work())
    try:
        while True:
            get = asyncio.create_task(q.get())
            done, _ = await asyncio.wait({get, task}, return_when=asyncio.FIRST_COMPLETED, timeout=heartbeat_s)
            if not done:  # keep proxies from closing an idle stream
                get.cancel()
                yield {"type": "ping"}
                continue
            if get in done:
                yield get.result()
                continue
            get.cancel()
            while not q.empty():
                yield q.get_nowait()
            exc = task.exception()
            if exc is not None:
                yield {"type": "error", "error": type(exc).__name__,
                       "message": str(exc) if isinstance(exc, BudgetExceeded) else "The analysis failed. Try again later.",
                       "folio": ledger.summary()}
            else:
                yield {"type": "result", "result": task.result()}
            return
    finally:
        if not task.done():  # client went away: stop spending
            task.cancel()


def _stage_meta(name, routing):
    model, thinking = routing[name]
    return {"stage": name, "label": STAGE_LABELS[name], "model": model, "model_label": MODEL_LABELS[model],
            "model_id": config.MODELS[model]["id"], "thinking": thinking}


async def _work(df, meta, routing, ledger, emit, check_budget, replies_k, extract_concurrency, include_reviews):
    t_start = time.time()
    hotel = meta.get("hotel") or "Your hotel"
    city = meta.get("city") or ""
    period = _period(df)
    emit({"type": "start", "n_reviews": int(len(df)), "hotel": hotel, "city": city, "period": period,
          "stages": [_stage_meta(s, routing) for s in STAGES]})
    stage_times = {}

    # 1. EXTRACT ---------------------------------------------------------------
    check_budget("extract")
    model, thinking = routing["extract"]
    emit({"type": "stage", "status": "running", **_stage_meta("extract", routing)})
    t0 = time.time()
    step = max(1, len(df) // 40)

    def prog(done, total):
        if done % step == 0 or done == total:
            emit({"type": "progress", "stage": "extract", "done": done, "total": total,
                  "cost_usd": round(ledger.total_cost, 6)})

    with stage("extract"):
        reviews = [{"review_id": r.review_id, "text": r.text, "title": getattr(r, "title", "") or ""}
                   for r in df.itertuples()]
        extracted = await extract_all(reviews, model=model, thinking=thinking, concurrency=extract_concurrency,
                                      on_progress=prog)
    n_failed = sum(not e["ok"] for e in extracted)
    stage_times["extract"] = time.time() - t0
    emit({"type": "stage", "status": "done", "stage": "extract", "seconds": round(stage_times["extract"], 1),
          "failed": n_failed, "folio": ledger.summary()})

    # 2. TRENDS ----------------------------------------------------------------
    check_budget("trends")
    model, thinking = routing["trends"]
    emit({"type": "stage", "status": "running", **_stage_meta("trends", routing)})
    t0 = time.time()
    tr = compute_trends(df, extracted)
    with stage("trends"):
        issues = await asyncio.to_thread(interpret, tr, df, extracted, hotel, city, model, thinking)
    stats_by = {s["aspect"]: s for s in tr["aspects"]}
    for iss in issues:
        iss["label"] = ASPECT_LABELS[iss["aspect"]]
        iss["stats"] = {k: v for k, v in stats_by[iss["aspect"]].items() if k != "weekly"}
        iss["weekly"] = stats_by[iss["aspect"]]["weekly"]
        iss["quotes"] = quotes_for(iss["aspect"], df, extracted, k=4)
    stage_times["trends"] = time.time() - t0
    emit({"type": "stage", "status": "done", "stage": "trends", "seconds": round(stage_times["trends"], 1),
          "issues": [{"rank": i["rank"], "title": i["title"], "aspect": i["aspect"]} for i in issues],
          "folio": ledger.summary()})

    # 3. INVESTIGATE (issues in parallel, each capped at MAX_TOOL_CALLS searches) ----------
    check_budget("investigate")
    model, thinking = routing["investigate"]
    emit({"type": "stage", "status": "running", **_stage_meta("investigate", routing), "max_searches": MAX_TOOL_CALLS})
    t0 = time.time()

    async def inv(iss):
        res = await asyncio.to_thread(investigate_issue, iss, stats_by[iss["aspect"]], iss["quotes"], hotel, city,
                                      period, model, thinking, emit)
        iss["investigation"] = res
        emit({"type": "issue_done", "issue_rank": iss["rank"], "summary": res.get("summary", ""),
              "sources": len(res.get("sources", [])), "folio": ledger.summary()})

    with stage("investigate"):
        await asyncio.gather(*(inv(i) for i in issues))
    stage_times["investigate"] = time.time() - t0
    emit({"type": "stage", "status": "done", "stage": "investigate", "seconds": round(stage_times["investigate"], 1),
          "folio": ledger.summary()})

    # 4. REPLIES ---------------------------------------------------------------
    check_budget("replies")
    model, thinking = routing["replies"]
    emit({"type": "stage", "status": "running", **_stage_meta("replies", routing)})
    t0 = time.time()
    with stage("replies"):
        replies = await draft_replies(df, extracted, issues, hotel, k=replies_k, model=model, thinking=thinking)
    stage_times["replies"] = time.time() - t0
    folio = ledger.summary()
    emit({"type": "stage", "status": "done", "stage": "replies", "seconds": round(stage_times["replies"], 1),
          "folio": folio})

    # escalations with excerpts
    by_id = {r.review_id: r for r in df.itertuples()}
    escalations = []
    for esc in tr["escalations"]:
        r = by_id[esc["review_id"]]
        escalations.append({**esc, "label": ASPECT_LABELS[esc["aspect"]],
                            "date": None if pd.isna(r.date) else pd.Timestamp(r.date).date().isoformat(),
                            "excerpt": focus_excerpt(r.text, esc["aspect"], 420)})

    result = {
        "meta": {
            "hotel": hotel, "city": city, "period": period, "n_reviews": int(len(df)),
            "n_extraction_failed": n_failed, "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "synthetic": bool(meta.get("synthetic")), "source": meta.get("source", "upload"),
            "has_dates": tr["has_dates"], "truncated_to": meta.get("truncated_to"),
            "stale_note": stale_note(df, date.today()),
            "wall_seconds": round(time.time() - t_start, 1),
        },
        "routing": [_stage_meta(s, routing) for s in STAGES],
        "issues": issues,
        "escalations": escalations,
        "weeks": tr["weeks"],
        "aspects": [{k: v for k, v in s.items()} for s in tr["aspects"]],
        "replies": replies,
        "folio": folio,
        "stage_seconds": {k: round(v, 1) for k, v in stage_times.items()},
    }
    if include_reviews:
        ex_by = {e["review_id"]: e["aspects"] for e in extracted}
        result["reviews"] = [{"review_id": r.review_id,
                              "date": None if pd.isna(r.date) else pd.Timestamp(r.date).date().isoformat(),
                              "rating": None if pd.isna(r.rating) else float(r.rating), "text": r.text,
                              "aspects": ex_by.get(r.review_id, [])} for r in df.itertuples()]
    return result


def extrapolate_baseline(baseline_folio: dict, n_sample: int, n_full: int, n_issues: int, n_replies: int,
                         sample_issues: int, sample_replies: int) -> dict:
    """Scale a measured all-Ultra sample run to the full run.

    Extraction cost scales with review count; trends is one call; investigation scales with issue
    count; replies with the number of drafts.
    """
    by = {s["stage"]: s for s in baseline_folio["stages"]}

    def c(name):
        return by.get(name, {}).get("cost_usd", 0.0)

    lines = {
        "extract": c("extract") / max(1, n_sample) * n_full,
        "trends": c("trends"),
        "investigate": c("investigate") / max(1, sample_issues) * n_issues,
        "replies": c("replies") / max(1, sample_replies) * n_replies,
    }
    return {"measured_on_reviews": n_sample, "measured_cost_usd": round(baseline_folio["total"]["cost_usd"], 6),
            "extrapolated_to_reviews": n_full, "extrapolated_cost_usd": round(sum(lines.values()), 6),
            "extrapolated_by_stage": {k: round(v, 6) for k, v in lines.items()},
            "measured_stages": baseline_folio["stages"],
            "label": f"measured on {n_sample} reviews, extrapolated"}
