"""Robust JSON extraction from model output."""
from __future__ import annotations

import json
import re

_FENCE = re.compile(r"```(?:json|JSON)?\s*(.*?)```", re.S)


def extract_json(text: str | None):
    """Parse the JSON object in a model reply.

    Handles code fences, leading/trailing prose, <think> blocks, and trailing commas.
    Raises ValueError if nothing parseable is found.
    """
    if not text or not text.strip():
        raise ValueError("empty response")
    s = text.strip()
    s = re.sub(r"<think>.*?</think>", "", s, flags=re.S).strip()
    candidates = [s]
    candidates += [m.strip() for m in _FENCE.findall(s)]
    a, b = s.find("{"), s.rfind("}")
    if a != -1 and b > a:
        candidates.append(s[a:b + 1])
    a, b = s.find("["), s.rfind("]")
    if a != -1 and b > a:
        candidates.append(s[a:b + 1])
    for c in candidates:
        for variant in (c, re.sub(r",\s*([}\]])", r"\1", c)):
            try:
                return json.loads(variant)
            except (json.JSONDecodeError, ValueError):
                continue
    raise ValueError(f"no JSON found in response: {s[:120]!r}")
