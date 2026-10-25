"""Live-mode guards: hard spend cap, per-IP and global daily run limits, concurrent-run limit.

State is persisted in data/runtime/ (or Upstash Redis when configured, see cost_tracker.SpendCounter).
Everything fails closed: if the spend counter cannot be read, live mode is off.
"""
from __future__ import annotations

import hashlib
import json
import os
import threading
import time
from dataclasses import dataclass
from pathlib import Path


def _env_float(name, default):
    try:
        return float(os.environ.get(name, default))
    except ValueError:
        return float(default)


def _env_int(name, default):
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return int(default)


@dataclass
class Settings:
    live_enabled: bool
    spend_cap_usd: float
    per_ip_daily: int
    global_daily: int
    max_reviews: int
    max_upload_bytes: int
    max_concurrent: int
    max_run_cost_usd: float

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            live_enabled=os.environ.get("LIVE_MODE_ENABLED", "1").strip() not in ("0", "false", "no", ""),
            spend_cap_usd=_env_float("SPEND_CAP_USD", 5.0),
            per_ip_daily=_env_int("PER_IP_DAILY_RUNS", 3),
            global_daily=_env_int("GLOBAL_DAILY_RUNS", 30),
            max_reviews=_env_int("MAX_REVIEWS_PER_UPLOAD", 150),
            max_upload_bytes=_env_int("MAX_UPLOAD_BYTES", 1_000_000),
            max_concurrent=_env_int("MAX_CONCURRENT_RUNS", 2),
            max_run_cost_usd=_env_float("MAX_RUN_COST_USD", 0.60),
        )


class RunLimiter:
    """Daily counters keyed by UTC date. IPs are stored hashed."""

    def __init__(self, path: Path, settings: Settings):
        self.path = Path(path)
        self.s = settings
        self._lock = threading.Lock()
        self._active = 0

    @staticmethod
    def _day() -> str:
        return time.strftime("%Y-%m-%d", time.gmtime())

    @staticmethod
    def _hash(ip: str) -> str:
        return hashlib.sha256(("nightaudit:" + ip).encode()).hexdigest()[:16]

    def _load(self) -> dict:
        try:
            st = json.loads(self.path.read_text(encoding="utf-8"))
        except (FileNotFoundError, json.JSONDecodeError, OSError):
            st = {}
        if st.get("day") != self._day():
            st = {"day": self._day(), "global": 0, "ips": {}}
        return st

    def _save(self, st: dict) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(st), encoding="utf-8")
        os.replace(tmp, self.path)

    def status(self, ip: str) -> dict:
        with self._lock:
            st = self._load()
            used_ip = st["ips"].get(self._hash(ip), 0)
            return {"ip_runs_today": used_ip, "ip_runs_left": max(0, self.s.per_ip_daily - used_ip),
                    "global_runs_today": st["global"], "global_runs_left": max(0, self.s.global_daily - st["global"]),
                    "active_runs": self._active}

    def try_acquire(self, ip: str) -> tuple[bool, str | None]:
        """Reserve a run slot. Returns (ok, reason_code)."""
        with self._lock:
            st = self._load()
            h = self._hash(ip)
            if self._active >= self.s.max_concurrent:
                return False, "busy"
            if st["ips"].get(h, 0) >= self.s.per_ip_daily:
                return False, "ip_limit"
            if st["global"] >= self.s.global_daily:
                return False, "global_limit"
            st["ips"][h] = st["ips"].get(h, 0) + 1
            st["global"] += 1
            self._save(st)
            self._active += 1
            return True, None

    def release(self) -> None:
        with self._lock:
            self._active = max(0, self._active - 1)


REASONS = {
    "busy": "Two live runs are already in progress. Please try again in a minute.",
    "ip_limit": "You have used today's live runs from this network. The cached demo is always available.",
    "global_limit": "Today's live runs for this demo are used up. The cached demo is always available.",
    "spend_cap": "The demo's spending cap has been reached, so live mode is switched off. The cached demo still works.",
    "disabled": "Live mode is switched off on this deployment. The cached demo still works.",
    "no_keys": "Live mode is unavailable: the server is missing its API keys. The cached demo still works.",
}
