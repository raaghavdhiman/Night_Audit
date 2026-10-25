"""Week-over-week direction and the rising-over-easing re-rank: pure code, no model calls."""
import json

from src.config import ROOT
from src.trends import rerank_by_direction, week_direction


def test_week_direction():
    assert week_direction(13, 24, 70, 72) == "easing"     # the live example: 24 -> 13
    assert week_direction(25, 17, 75, 76) == "rising"     # demo noise
    assert week_direction(24, 24, 75, 76) == "steady"     # demo breakfast
    assert week_direction(2, 5, 75, 76) == "steady"       # too few to call
    assert week_direction(12, 24, 35, 72) == "steady"     # half the reviews: the rate did not fall
    assert week_direction(5, None, 70, 0) == "steady"


def _a(aspect, rate, direction, sev5=0):
    return {"aspect": aspect, "recent_neg_rate": rate, "direction": direction, "severity5_count": sev5}


def test_rerank_moves_rising_above_easing_when_similar():
    by = {"food": _a("food", 0.30, "easing"), "noise": _a("noise", 0.27, "rising"), "bugs": _a("bugs", 0.04, "steady", 1)}
    issues = [{"aspect": "food"}, {"aspect": "noise"}, {"aspect": "bugs"}]
    assert [i["aspect"] for i in rerank_by_direction(issues, by)] == ["noise", "food", "bugs"]


def test_rerank_keeps_order_when_shares_differ_or_not_rising():
    by = {"food": _a("food", 0.40, "easing"), "noise": _a("noise", 0.20, "rising"), "room": _a("room", 0.38, "steady")}
    assert [i["aspect"] for i in rerank_by_direction([{"aspect": "food"}, {"aspect": "noise"}], by)] == ["food", "noise"]
    assert [i["aspect"] for i in rerank_by_direction([{"aspect": "food"}, {"aspect": "room"}], by)] == ["food", "room"]


def test_rerank_never_moves_severity5():
    by = {"bugs": _a("bugs", 0.30, "easing", sev5=1), "noise": _a("noise", 0.29, "rising")}
    assert [i["aspect"] for i in rerank_by_direction([{"aspect": "bugs"}, {"aspect": "noise"}], by)] == ["bugs", "noise"]


def test_demo_ranking_unchanged_by_rerank():
    d = json.loads((ROOT / "data" / "synthetic" / "demo_result.json").read_text(encoding="utf-8"))
    by = {a["aspect"]: a for a in d["aspects"]}
    assert all("direction" in a for a in d["aspects"]) and all("direction" in i["stats"] for i in d["issues"])
    assert rerank_by_direction(d["issues"], by) == d["issues"]
