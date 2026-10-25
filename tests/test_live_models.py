"""Real calls, one per model, thinking off. Run with: RUN_LIVE=1 pytest tests/test_live_models.py"""
import os

import pytest

from src import config

pytestmark = pytest.mark.skipif(os.environ.get("RUN_LIVE") != "1", reason="set RUN_LIVE=1 to make real API calls")


@pytest.mark.parametrize("name", ["lightning", "super", "ultra"])
def test_one_call(name):
    r = config.call_model(name, [{"role": "user", "content": 'Return the JSON {"ok": true}'}],
                          thinking=False, max_tokens=100, stage="test")
    assert r.finish_reason == "stop"
    assert r.reasoning_tokens == 0
    assert r.tokens_in > 0 and r.cost_usd > 0
