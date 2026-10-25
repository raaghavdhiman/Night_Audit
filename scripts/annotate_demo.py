"""Apply the offline post-processing passes to the cached demo in place. No model or search calls; safe
to re-run. New builds get both from the pipeline (investigate_issue, compute_trends).
  - source quality (kind, date, older, other-city, renumbering, social-only cap)
  - week-over-week direction (rising / easing / steady) on every aspect and issue

Usage: python scripts/annotate_demo.py
"""
from __future__ import annotations

import json
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from src.investigate import annotate_sources  # noqa: E402
from src.trends import week_direction  # noqa: E402

OUT = ROOT / "data" / "synthetic" / "demo_result.json"


def direction_of(weekly: list[dict]) -> str:
    if len(weekly) < 2:
        return "steady"
    return week_direction(weekly[-1]["neg"], weekly[-2]["neg"], weekly[-1]["reviews"], weekly[-2]["reviews"])


def main():
    result = json.loads(OUT.read_text(encoding="utf-8"))
    as_of = datetime.fromisoformat(result["meta"]["generated_at"]).date()  # the run's date, not today
    for iss in result["issues"]:
        if iss.get("investigation"):
            annotate_sources(iss["investigation"], result["meta"]["city"], as_of)
    for a in result["aspects"]:
        a["direction"] = direction_of(a["weekly"])
    for iss in result["issues"]:
        iss["stats"]["direction"] = direction_of(iss["weekly"])
    if "cited_sources_per_issue" in result.get("validation", {}):
        result["validation"]["cited_sources_per_issue"] = {
            i["aspect"]: len(i["investigation"].get("cited_source_ids", [])) for i in result["issues"]}
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    for iss in result["issues"]:
        inv = iss["investigation"]
        print(f"issue {iss['rank']}: {len(inv['cited_source_ids'])} cited "
              f"(model cited {len(inv['model_cited_source_ids'])}) of {len(inv['sources'])} searched; "
              f"direction {iss['stats']['direction']}")


if __name__ == "__main__":
    main()
