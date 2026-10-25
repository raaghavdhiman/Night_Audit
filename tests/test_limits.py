from src.limits import RunLimiter, Settings


def settings(**kw):
    base = dict(live_enabled=True, spend_cap_usd=5, per_ip_daily=2, global_daily=3, max_reviews=150,
                max_upload_bytes=1_000_000, max_concurrent=5, max_run_cost_usd=0.6)
    base.update(kw)
    return Settings(**base)


def test_per_ip_and_global_limits(tmp_path):
    lim = RunLimiter(tmp_path / "l.json", settings())
    assert lim.try_acquire("1.1.1.1") == (True, None)
    assert lim.try_acquire("1.1.1.1") == (True, None)
    assert lim.try_acquire("1.1.1.1") == (False, "ip_limit")
    assert lim.try_acquire("2.2.2.2") == (True, None)
    assert lim.try_acquire("3.3.3.3") == (False, "global_limit")
    # persisted across instances (process restart)
    assert RunLimiter(tmp_path / "l.json", settings()).status("1.1.1.1")["ip_runs_left"] == 0


def test_concurrency_limit(tmp_path):
    lim = RunLimiter(tmp_path / "l.json", settings(max_concurrent=1, per_ip_daily=9, global_daily=9))
    assert lim.try_acquire("a")[0]
    assert lim.try_acquire("b") == (False, "busy")
    lim.release()
    assert lim.try_acquire("b")[0]


def test_ips_are_hashed(tmp_path):
    lim = RunLimiter(tmp_path / "l.json", settings())
    lim.try_acquire("203.0.113.9")
    assert "203.0.113.9" not in (tmp_path / "l.json").read_text()
