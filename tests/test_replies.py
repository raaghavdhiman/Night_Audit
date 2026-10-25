"""Reply drafts must not promise actions outside a [GM to confirm: ...] placeholder. No model calls."""
import json

from src.config import ROOT
from src.replies import bracket_commitments, unconfirmed_commitments

PROMISES = [
    "We are deploying a two-shift breakfast model starting tomorrow.",
    "A licensed pest-control provider will treat your room this week, and housekeeping will inspect adjacent rooms.",
    "We have placed premium earplugs in every room facing I-35.",
    "Our team is conducting a full investigation into the incident.",
    "We are looking at breakfast staffing [GM to confirm: two-shift model] and are placing earplugs in rooms.",
    "We will refund your last night.",
]
FINE = [
    "We are sorry the breakfast service fell short.",
    "We understand your frustration and take this seriously.",
    "[GM to confirm: pest-control treatment of the room and adjacent rooms this week]",
    "We are looking at how breakfast is staffed [GM to confirm: two-shift breakfast, from tomorrow].",
    "We hope you will give us another chance to provide a restful stay.",
    "Please contact the General Manager directly.",
]


def test_detects_promises():
    for s in PROMISES:
        assert unconfirmed_commitments(s), s
    for s in FINE:
        assert not unconfirmed_commitments(s), s


def test_bracket_commitments_wraps_only_promising_sentences():
    text = ("We are sorry about the noise. We have placed earplugs in all rooms [GM to confirm: from today]. "
            "Please contact the General Manager directly.")
    out = bracket_commitments(text)
    assert out == ("We are sorry about the noise. [GM to confirm: We have placed earplugs in all rooms (from today)] "
                   "Please contact the General Manager directly.")
    assert not unconfirmed_commitments(out)
    assert bracket_commitments(out) == out


def test_stored_demo_replies_have_no_unconfirmed_promises():
    d = json.loads((ROOT / "data" / "synthetic" / "demo_result.json").read_text(encoding="utf-8"))
    for r in d["replies"]:
        assert not unconfirmed_commitments(r["draft"]), r["review_id"]
        assert "[GM to confirm:" in r["draft"], r["review_id"]
        assert r["draft"].rstrip().endswith("The General Manager, Hotel Wrenfield")
    # the folio bills what produced these drafts
    replies_row = next(s for s in d["folio"]["stages"] if s["stage"] == "replies")
    assert abs(sum(s["cost_usd"] for s in d["folio"]["stages"]) - d["folio"]["total"]["cost_usd"]) < 1e-5
    assert replies_row["calls"] >= len(d["replies"])
