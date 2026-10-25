import pytest

from src.ingest import CSVError, clean_text, parse_reviews_csv
from src.extract import normalize


def test_detects_text_date_rating_and_strips_html():
    csv = ("Review Date,Score,Review Text\n"
           "2026-10-01,2,\"<p>The <b>AC</b> was broken &amp; loud</p>\"\n"
           "2026-10-02,5,Lovely stay and a great breakfast spread\n")
    df, meta = parse_reviews_csv(csv.encode())
    assert meta["text_column"] == "Review Text"
    assert meta["date_column"] == "Review Date" and meta["rating_column"] == "Score"
    assert df.loc[0, "text"] == "The AC was broken & loud"
    assert df["rating"].tolist() == [2, 5]
    assert df["review_id"].tolist() == ["r1", "r2"]


def test_datafiniti_columns_and_hotel_city():
    csv = ("name,city,reviews.date,reviews.rating,reviews.text,reviews.title\n"
           "Hotel A,Austin,2026-09-01T00:00:00Z,4,Nice room but noisy street outside,Good\n"
           "Hotel A,Austin,2026-09-02T00:00:00Z,3,Breakfast ran out of eggs very early,Meh\n")
    df, meta = parse_reviews_csv(csv)
    assert meta["text_column"] == "reviews.text"
    assert meta["hotel"] == "Hotel A" and meta["city"] == "Austin"
    assert df["date"].notna().all()


def test_fallback_longest_column_and_cp1252():
    csv = "a,b\nx,Ceci est un très bon hôtel avec une vue magnifique\ny,Room was small but the staff were kind\n"
    df, meta = parse_reviews_csv(csv.encode("cp1252"))
    assert meta["text_column"] == "b"
    assert "très" in df.loc[0, "text"]


def test_truncates_long_reviews_and_caps_count():
    rows = "\n".join(f"2026-10-{(i % 28) + 1:02d},4,{'word ' * 600}" for i in range(20))
    df, meta = parse_reviews_csv(("date,rating,text\n" + rows).encode(), max_reviews=5)
    assert len(df) == 5 and meta["truncated_to"] == 5
    assert df["text"].str.len().max() <= 1503


def test_rejects_binary_and_empty():
    with pytest.raises(CSVError):
        parse_reviews_csv(b"\x00\x01\x02PK")
    with pytest.raises(CSVError):
        parse_reviews_csv(b"text\n")


def test_keeps_unique_review_id_column():
    df, _ = parse_reviews_csv("review_id,text\ns1,The pool was closed all week\ns2,Great staff and a clean room\n")
    assert df["review_id"].tolist() == ["s1", "s2"]


def test_clean_text_controls():
    assert clean_text("a\x00b\n\n c") == "a b c"


def test_normalize_schema():
    out = normalize({"aspects": [
        {"aspect": "Breakfast", "sentiment": "negative", "severity": "3", "department": "F&B"},
        {"aspect": "noise", "sentiment": "p", "severity": 4},
        {"aspect": "noise", "sentiment": "n", "severity": 0},
        {"aspect": "made_up", "sentiment": "n", "severity": 2},
        {"aspect": "safety", "sentiment": "n", "severity": 9, "department": "Security"},
    ]})
    by = {a["aspect"]: a for a in out}
    assert by["food_beverage"] == {"aspect": "food_beverage", "sentiment": "n", "severity": 3, "department": "Food & Beverage"}
    assert by["noise"]["sentiment"] == "n" and by["noise"]["severity"] == 1  # negative wins, min severity 1
    assert by["safety_security"]["severity"] == 5 and by["safety_security"]["department"] == "Management"
    assert "made_up" not in by
