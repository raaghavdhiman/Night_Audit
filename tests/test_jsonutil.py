import pytest

from src.jsonutil import extract_json


def test_plain():
    assert extract_json('{"a": 1}') == {"a": 1}


def test_code_fence_and_prose():
    txt = 'Sure! Here it is:\n```json\n{"aspects": [{"aspect": "noise"}]}\n```\nHope that helps.'
    assert extract_json(txt)["aspects"][0]["aspect"] == "noise"


def test_first_and_last_brace():
    assert extract_json('result: {"x": {"y": 2}} done') == {"x": {"y": 2}}


def test_trailing_comma():
    assert extract_json('{"a": [1, 2,],}') == {"a": [1, 2]}


def test_think_block_removed():
    assert extract_json('<think>maybe {"wrong": 1}</think>{"right": 2}') == {"right": 2}


@pytest.mark.parametrize("bad", ["", "   ", "no json here", '{"a": '])
def test_failures_raise(bad):
    with pytest.raises(ValueError):
        extract_json(bad)
