"""Staleness note for live runs on old review sets: pure code, no model or search calls."""
import json
from datetime import date

import pandas as pd

from src.config import ROOT
from src.pipeline import stale_note

TODAY = date(2026, 10, 26)


def _df(*dates):
    return pd.DataFrame({"date": pd.to_datetime(list(dates))})


def test_old_reviews_get_a_note():
    note = stale_note(_df("2019-01-03", "2019-03-14"), TODAY)
    assert note == ("These reviews end in March 2019. Web search reflects today, so outside causes may not apply.")


def test_boundary_is_more_than_90_days():
    assert stale_note(_df("2026-07-28"), TODAY) is None  # exactly 90 days
    assert stale_note(_df("2026-07-27"), TODAY).startswith("These reviews end in July 2026.")


def test_recent_or_undated_reviews_get_none():
    assert stale_note(_df("2026-01-01", "2026-10-20"), TODAY) is None
    assert stale_note(_df(None, None), TODAY) is None


def test_cached_demo_is_recent():
    d = json.loads((ROOT / "data" / "synthetic" / "demo_result.json").read_text(encoding="utf-8"))
    as_of = date.fromisoformat(d["meta"]["generated_at"][:10])
    end = pd.Timestamp(d["meta"]["period"].split(" to ")[1])
    assert stale_note(pd.DataFrame({"date": [end]}), as_of) is None
