import pytest

from src.cost_tracker import CallRecord, Ledger, SpendCounter, cost_usd, stage, use_ledger, current_stage


def test_cost_math():
    # 1M in + 1M out on each model equals the sum of the list prices
    assert cost_usd("lightning", 1_000_000, 1_000_000) == pytest.approx(0.30)
    assert cost_usd("super", 1_000_000, 1_000_000) == pytest.approx(1.20)
    assert cost_usd("ultra", 1_000_000, 1_000_000) == pytest.approx(4.00)
    assert cost_usd("ultra", 2000, 500) == pytest.approx(0.002 + 0.0015)


def test_ledger_summary_per_stage():
    led = Ledger()
    led.add_call(CallRecord("extract", "lightning", False, 100, 50, 0, 1.0, cost_usd("lightning", 100, 50)))
    led.add_call(CallRecord("extract", "lightning", False, 100, 50, 0, 1.0, cost_usd("lightning", 100, 50)))
    led.add_call(CallRecord("investigate", "ultra", True, 1000, 2000, 1500, 9.0, cost_usd("ultra", 1000, 2000)))
    s = led.summary()
    by = {x["stage"]: x for x in s["stages"]}
    assert by["extract"]["calls"] == 2 and by["extract"]["tokens_in"] == 200
    assert by["investigate"]["reasoning_tokens"] == 1500
    assert s["total"]["cost_usd"] == pytest.approx(2 * cost_usd("lightning", 100, 50) + cost_usd("ultra", 1000, 2000))


def test_context_vars():
    led = Ledger()
    with use_ledger(led), stage("trends"):
        assert current_stage() == "trends"
    assert current_stage() == "misc"


def test_spend_counter_persists(tmp_path, monkeypatch):
    monkeypatch.delenv("UPSTASH_REDIS_REST_URL", raising=False)
    p = tmp_path / "spend.json"
    c = SpendCounter(p)
    assert c.get() == 0.0
    c.add(0.25)
    c.add(0.5)
    assert SpendCounter(p).get() == pytest.approx(0.75)
