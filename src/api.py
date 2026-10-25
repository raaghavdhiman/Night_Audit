"""FastAPI app: cached demo (zero cost), rate-limited live analysis over SSE, and the built frontend.

Run:  uvicorn src.api:app --port 8000          (one worker: limits are per-process)
"""
from __future__ import annotations

import json
import logging
import os
import sys
from pathlib import Path

from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles

from src import config
from src.cost_tracker import Ledger
from src.ingest import CSVError, clean_text, parse_reviews_csv
from src.limits import REASONS, RunLimiter, Settings
from src.pipeline import ROUTING, STAGE_LABELS, run_pipeline

log = logging.getLogger("nightaudit")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

ROOT = config.ROOT
DEMO_PATH = ROOT / "data" / "synthetic" / "demo_result.json"
SAMPLE_CSV = ROOT / "data" / "synthetic" / "reviews.csv"
DIST = ROOT / "frontend" / "dist"

SETTINGS = Settings.from_env()
SPEND = config.set_spend_file(Path(os.environ.get("SPEND_FILE", config.RUNTIME / "live_spend.json")))
LIMITER = RunLimiter(config.RUNTIME / "run_limits.json", SETTINGS)

# --- startup key check (loud). Demo mode needs no keys; live mode does. -------------------
MISSING_KEYS = config.check_keys()
if MISSING_KEYS:
    banner = ("\n" + "!" * 72 + f"\n  NIGHT AUDIT: missing environment variable(s): {', '.join(MISSING_KEYS)}\n"
              "  Live mode is DISABLED. The cached demo still works.\n"
              "  Set them in .env (local) or the host's environment settings.\n" + "!" * 72 + "\n")
    print(banner, file=sys.stderr, flush=True)
    if os.environ.get("STRICT_KEYS") == "1":
        raise SystemExit(f"Missing required keys: {', '.join(MISSING_KEYS)}")

_demo_cache: bytes | None = None


def demo_bytes() -> bytes:
    global _demo_cache
    if _demo_cache is None:
        _demo_cache = DEMO_PATH.read_bytes()
    return _demo_cache


def live_state() -> tuple[bool, str | None]:
    if not SETTINGS.live_enabled:
        return False, "disabled"
    if MISSING_KEYS:
        return False, "no_keys"
    if SPEND.get() >= SETTINGS.spend_cap_usd:
        return False, "spend_cap"
    return True, None


def client_ip(request: Request) -> str:
    # Behind one proxy (Render/Railway/Fly) the right-most X-Forwarded-For entry is the one the proxy added.
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        return xff.split(",")[-1].strip()[:64]
    return request.client.host if request.client else "unknown"


app = FastAPI(title="Night Audit", docs_url="/api/docs", redoc_url=None, openapi_url="/api/openapi.json")


@app.middleware("http")
async def security_headers(request: Request, call_next):
    resp = await call_next(request)
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    if not request.url.path.startswith("/api/docs"):
        resp.headers.setdefault(
            "Content-Security-Policy",
            "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; "
            "connect-src 'self'; frame-ancestors 'none'; base-uri 'none'")
    return resp


@app.get("/api/health")
def health():
    return {"ok": True, "demo_available": DEMO_PATH.exists()}


@app.get("/api/config")
def get_config(request: Request):
    ok, reason = live_state()
    st = LIMITER.status(client_ip(request))
    if ok and st["ip_runs_left"] <= 0:
        ok, reason = False, "ip_limit"
    elif ok and st["global_runs_left"] <= 0:
        ok, reason = False, "global_limit"
    spent = SPEND.get()
    return {
        "live_available": ok,
        "live_reason": reason,
        "live_message": REASONS.get(reason) if reason else None,
        "limits": {"max_reviews": SETTINGS.max_reviews, "per_ip_daily_runs": SETTINGS.per_ip_daily,
                   "global_daily_runs": SETTINGS.global_daily, "max_upload_bytes": SETTINGS.max_upload_bytes,
                   "max_searches_per_issue": 4, "issues_investigated": 3},
        "usage": {"ip_runs_left": st["ip_runs_left"], "global_runs_left": st["global_runs_left"],
                  "spend_cap_usd": SETTINGS.spend_cap_usd,
                  "spend_used_pct": None if spent == float("inf") else round(100 * spent / SETTINGS.spend_cap_usd, 1)},
        "routing": [{"stage": s, "label": STAGE_LABELS[s], "model": m, "model_id": config.MODELS[m]["id"],
                     "thinking": t} for s, (m, t) in ROUTING.items()],
    }


@app.get("/api/demo")
def get_demo(request: Request):
    if not DEMO_PATH.exists():
        return JSONResponse({"error": "Demo result has not been built (run scripts/build_demo.py)."}, status_code=503)
    body = demo_bytes()
    etag = f'"{len(body)}-{int(DEMO_PATH.stat().st_mtime)}"'
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304)
    return Response(body, media_type="application/json", headers={"ETag": etag, "Cache-Control": "public, max-age=300"})


@app.get("/api/sample.csv")
def sample_csv():
    """Every 5th review of the synthetic hotel (120 reviews over all 8 weeks), in the upload format."""
    import pandas as pd
    df = pd.read_csv(SAMPLE_CSV).iloc[::5][["date", "rating", "title", "text"]]
    return Response(df.to_csv(index=False), media_type="text/csv",
                    headers={"Content-Disposition": 'attachment; filename="night-audit-sample-reviews.csv"'})


def live_baseline(result: dict) -> tuple[dict | None, float | None]:
    """Scale the demo's measured all-Ultra baseline to a live run by unit costs."""
    try:
        demo = json.loads(demo_bytes())
        b = demo["baseline"]
        by = b["extrapolated_by_stage"]
        unit = {"extract": by["extract"] / max(1, demo["meta"]["n_reviews"]),
                "investigate": by["investigate"] / max(1, len(demo["issues"])),
                "replies": by["replies"] / max(1, len(demo["replies"]))}
    except (OSError, KeyError, ValueError, TypeError):
        return None, None
    n = result["meta"]["n_reviews"]
    lines = {"extract": unit["extract"] * n, "trends": by["trends"],
             "investigate": unit["investigate"] * len(result["issues"]),
             "replies": unit["replies"] * len(result["replies"])}
    total = sum(lines.values())
    base = {"measured_on_reviews": b["measured_on_reviews"], "measured_cost_usd": b["measured_cost_usd"],
            "extrapolated_to_reviews": n, "extrapolated_cost_usd": round(total, 6),
            "extrapolated_by_stage": {k: round(v, 6) for k, v in lines.items()},
            "label": f"measured on {b['measured_on_reviews']} reviews, extrapolated"}
    cost = result["folio"]["total"]["cost_usd"]
    return base, (round(100 * (1 - cost / total), 1) if total else None)


def _err(status: int, code: str, message: str):
    return JSONResponse({"error": message, "code": code}, status_code=status)


@app.post("/api/analyze")
async def analyze(request: Request, file: UploadFile = File(...), hotel: str = Form(""), city: str = Form("")):
    ok, reason = live_state()
    if not ok:
        return _err(503 if reason in ("no_keys", "disabled") else 429, reason, REASONS[reason])
    clen = request.headers.get("content-length")
    if clen and clen.isdigit() and int(clen) > SETTINGS.max_upload_bytes + 10_000:
        return _err(413, "too_large", f"File is too large (limit {SETTINGS.max_upload_bytes // 1000} KB).")
    name = (file.filename or "").lower()
    if not name.endswith(".csv"):
        return _err(400, "not_csv", "Please upload a .csv file.")
    data = await file.read(SETTINGS.max_upload_bytes + 1)
    if len(data) > SETTINGS.max_upload_bytes:
        return _err(413, "too_large", f"File is too large (limit {SETTINGS.max_upload_bytes // 1000} KB).")
    try:
        df, meta = parse_reviews_csv(data, max_reviews=SETTINGS.max_reviews)
    except CSVError as e:
        return _err(400, "bad_csv", str(e))
    if len(df) < 10:
        return _err(400, "too_few", "Upload at least 10 reviews so there is something to trend.")
    meta["hotel"] = clean_text(hotel, 80) or meta.get("hotel") or "Your hotel"
    meta["city"] = clean_text(city, 80) or meta.get("city") or ""
    meta["source"] = "upload"

    ip = client_ip(request)
    acquired, why = LIMITER.try_acquire(ip)
    if not acquired:
        return _err(429, why, REASONS[why])

    def budget_ok():
        return SPEND.get() < SETTINGS.spend_cap_usd

    async def stream():
        try:
            yield "retry: 600000\n\n"
            info = {"type": "accepted", "n_reviews": int(len(df)), "truncated_to": meta.get("truncated_to"),
                    "text_column": meta["text_column"], "has_dates": meta["has_dates"]}
            yield f"data: {json.dumps(info)}\n\n"
            async for ev in run_pipeline(df, meta, ledger=Ledger("live"), max_run_cost=SETTINGS.max_run_cost_usd,
                                         budget_ok=budget_ok, include_reviews=True):
                if ev["type"] == "ping":
                    yield ": ping\n\n"
                    continue
                if ev["type"] == "result":
                    ev["result"]["baseline"], ev["result"]["savings_pct"] = live_baseline(ev["result"])
                yield f"data: {json.dumps(ev, default=str)}\n\n"
        except Exception:  # never leak internals into the stream
            log.exception("live run failed")
            yield f"data: {json.dumps({'type': 'error', 'message': 'The analysis failed. Try again later.'})}\n\n"
        finally:
            LIMITER.release()
            log.info("live run finished; total estimated spend $%.4f", SPEND.get())

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# --- frontend (production build) ------------------------------------------------------------
if (DIST / "assets").exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")


@app.get("/{path:path}", include_in_schema=False)
def spa(path: str):
    if path.startswith("api/"):
        return _err(404, "not_found", "Not found")
    f = (DIST / path).resolve()
    if path and f.is_file() and DIST.resolve() in f.parents:
        return FileResponse(f)
    index = DIST / "index.html"
    if index.exists():
        return FileResponse(index, headers={"Cache-Control": "no-cache"})
    return Response("Frontend not built. Run: cd frontend && npm install && npm run build", media_type="text/plain")
