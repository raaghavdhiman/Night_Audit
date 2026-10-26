"""Source-quality pass on investigation output: offline, no model or search calls."""
import copy
import json
from datetime import date

from src.investigate import annotate_sources, is_older, other_city, source_date, source_kind
from src.config import ROOT

CITY = "Austin, Texas"
TODAY = date(2026, 10, 25)
DEMO_PATH = ROOT / "data" / "synthetic" / "demo_result.json"


def test_source_kind():
    assert source_kind("https://www.txdot.gov/x") == "official"
    assert source_kind("https://services.austintexas.gov/edims") == "official"
    assert source_kind("https://www.mysanantonio.com/news/a") == "news"
    assert source_kind("https://www.ntxe-news.com/artman/1") == "news"
    assert source_kind("https://www.facebook.com/TxDOTAustinTX/videos/1") == "social"
    assert source_kind("https://m.youtube.com/watch?v=1") == "social"
    assert source_kind("https://x.com/a/status/1") == "social"
    assert source_kind("https://theaustinnewsletter.com/guides/a") == "other"
    assert source_kind("https://www.govtech-example.com/a") == "other"


def test_source_kind_review_sites():
    for url in ["https://www.tripadvisor.com/Hotel_Review-g1", "https://www.tripadvisor.co.uk/Hotel_Review-g1",
                "https://www.booking.com/hotel/us/x.html", "https://www.expedia.com/Austin-Hotels.h1.Hotel-Information",
                "https://www.expedia.ca/x", "https://m.yelp.com/biz/x", "https://www.google.com/maps/place/x",
                "https://maps.google.com/?cid=1", "https://maps.app.goo.gl/abc", "https://www.hotels.com/ho1"]:
        assert source_kind(url) == "reviews", url
    assert source_kind("https://www.google.com/search?q=x") == "other"
    assert source_kind("https://www.notbooking.com/a") == "other"
    assert source_kind("https://expediagroup-news.com/a") == "news"


def test_source_date():
    assert source_date("2026-10-15T08:00:00Z", "https://a.com/x") == ("2026-10-15", "tavily")
    assert source_date("Wed, 15 Oct 2025 14:00:00 GMT", "https://a.com/x") == ("2025-10-15", "tavily")
    assert source_date(None, "https://www.politico.com/news/magazine/2026/10/18/egg-prices") == ("2026-10-18", "url")
    assert source_date(None, "https://www.bizjournals.com/austin/news/2026/10/05/crowds.html") == ("2026-10-05", "url")
    assert source_date(None, "https://a.com/blog/2024/03/post") == ("2024-03", "url")
    assert source_date(None, "https://beecityusa.org/2025-annual-report") == (None, None)


def test_is_older():
    assert is_older("2025-10-24", TODAY) and not is_older("2025-10-26", TODAY)
    assert not is_older("2025-10", TODAY)  # month precision counts to the end of the month
    assert is_older("2025-09", TODAY)
    assert not is_older(None, TODAY)


def test_other_city():
    assert other_city("I-35 and Loop 1604 weekend closures in San Antonio Oct ...", "https://facebook.com/p/1", CITY) == "San Antonio"
    # "Austin street" is a street in Seguin, not the hotel's city
    assert other_city("Austin street lane closures in Seguin for paving 2026", "https://facebook.com/SeguinTX/posts/austin-st", CITY) == "Seguin"
    assert other_city("FM 1626 nighttime lane closures in Buda TX", "https://facebook.com/Budatx/posts/1", CITY) == "Buda"
    assert other_city("Project updates", "https://www.txdot.gov/about/newsroom/local/tyler/updates.html", CITY) == "Tyler"
    # the hotel's city named in the title wins, even on a San Antonio paper's site
    assert other_city("TxDOT extends nightly closure on I-35 in Austin", "https://www.mysanantonio.com/a/b.php", CITY) is None
    assert other_city("What is Austin known for?", "https://theaustinnewsletter.com/guides/a", CITY) is None
    assert other_city("Labor market report", "https://example.com/report", CITY) is None


def _src(i, url, title="t", published_date=None):
    return {"id": i, "title": title, "url": url, "snippet": "", "published_date": published_date, "query": "q"}


def _inv():
    sources = [
        _src(1, "https://www.instagram.com/reel/a", "Austin road work"),
        _src(2, "https://www.example.com/a", "Austin guide"),
        _src(3, "https://www.txdot.gov/austin", "I-35 Austin"),
        _src(4, "https://www.kxan.com/news/2026/10/01/x", "Austin closures"),
        _src(5, "https://www.facebook.com/p/1", "Closures in San Antonio"),
        _src(6, "https://www.statesman.com/story/2024/05/02/old", "Austin road work 2024"),
        _src(7, "https://www.reddit.com/r/Austin/1", "Austin noise"),
        _src(8, "https://www.example.org/unused", "Unused"),
    ]
    hyps = [
        {"hypothesis": "mixed", "confidence": "high", "type": "external", "reasoning": "[1] [3]", "source_ids": [1, 3]},
        {"hypothesis": "social only", "confidence": "high", "type": "external", "reasoning": "[7]", "source_ids": [7, 1]},
        {"hypothesis": "excluded only", "confidence": "medium", "type": "external", "reasoning": "[5][6]", "source_ids": [5, 6]},
        {"hypothesis": "other + news", "confidence": "medium", "type": "external", "reasoning": "", "source_ids": [4, 2]},
        {"hypothesis": "internal", "confidence": "medium", "type": "internal", "reasoning": "", "source_ids": []},
    ]
    return {"summary": "s [3]", "hypotheses": hyps, "actions": [], "sources": sources,
            "cited_source_ids": [1, 2, 3, 4, 5, 6, 7]}


def test_annotate_orders_renumbers_and_caps():
    inv = annotate_sources(_inv(), CITY, TODAY)
    by = {s["id"]: s for s in inv["sources"]}
    # cited (usable) first, official > news > other > social, then the rest
    assert inv["cited_source_ids"] == [3, 4, 2, 1, 7]
    assert [by[i]["n"] for i in inv["cited_source_ids"]] == [1, 2, 3, 4, 5]
    assert sorted(s["n"] for s in inv["sources"]) == list(range(1, 9))
    assert by[8]["n"] == 6 and not by[8]["cited"]          # uncited but usable before excluded ones
    assert {by[5]["n"], by[6]["n"]} == {7, 8}
    assert by[5]["other_city"] == "San Antonio" and by[6]["older"] and by[6]["date"] == "2024-05-02"
    assert inv["model_cited_source_ids"] == [1, 2, 3, 4, 5, 6, 7]
    assert [s["id"] for s in inv["sources"]] == list(range(1, 9))  # data keeps search order

    h = inv["hypotheses"]
    assert h[0]["confidence"] == "high" and h[0]["confidence_note"] == ""
    assert h[1]["confidence"] == "low" and h[1]["confidence_model"] == "high"
    assert "social" in h[1]["confidence_note"]
    assert h[2]["confidence"] == "low" and h[2]["evidence_ids"] == [] and h[2]["source_ids"] == [5, 6]
    assert h[3]["confidence"] == "medium"
    assert h[4]["confidence"] == "medium" and h[4]["confidence_note"] == ""


def test_annotate_is_idempotent():
    once = annotate_sources(_inv(), CITY, TODAY)
    twice = annotate_sources(copy.deepcopy(once), CITY, TODAY)
    assert once == twice


def test_social_only_note_on_already_low():
    inv = _inv()
    inv["hypotheses"] = [{"hypothesis": "x", "confidence": "low", "type": "external", "reasoning": "", "source_ids": [7]}]
    out = annotate_sources(inv, CITY, TODAY)["hypotheses"][0]
    assert out["confidence"] == "low" and out["confidence_note"] == "only social-media evidence"


def test_stored_demo_is_annotated_and_consistent():
    d = json.loads(DEMO_PATH.read_text(encoding="utf-8"))
    as_of = date.fromisoformat(d["meta"]["generated_at"][:10])
    for iss in d["issues"]:
        inv = iss["investigation"]
        assert annotate_sources(copy.deepcopy(inv), d["meta"]["city"], as_of) == inv, "run scripts/annotate_demo.py"
        ns = sorted(s["n"] for s in inv["sources"])
        assert ns == list(range(1, len(ns) + 1))
        by = {s["id"]: s for s in inv["sources"]}
        assert [by[i]["n"] for i in inv["cited_source_ids"]] == list(range(1, len(inv["cited_source_ids"]) + 1))
        for h in inv["hypotheses"]:
            assert set(h["evidence_ids"]) <= set(inv["cited_source_ids"])
            assert all(not by[i]["older"] and not by[i]["other_city"] for i in h["evidence_ids"])
