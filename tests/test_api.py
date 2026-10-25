"""API smoke tests without any model calls."""
from fastapi.testclient import TestClient

from src.api import app

client = TestClient(app)


def test_health_and_demo():
    assert client.get("/api/health").json()["ok"] is True
    r = client.get("/api/demo")
    assert r.status_code == 200
    d = r.json()
    assert d["meta"]["synthetic"] is True and len(d["issues"]) == 3
    assert d["baseline"]["label"].startswith("measured on 20 reviews")


def test_config_shape():
    c = client.get("/api/config").json()
    assert {"live_available", "limits", "usage", "routing"} <= set(c)


def test_rejects_non_csv_and_bad_csv():
    r = client.post("/api/analyze", files={"file": ("x.txt", b"hello", "text/plain")})
    assert r.status_code in (400, 429, 503)
    r = client.post("/api/analyze", files={"file": ("x.csv", b"\x00\x01binary", "text/csv")})
    assert r.status_code in (400, 429, 503)


def test_sample_csv():
    r = client.get("/api/sample.csv")
    assert r.status_code == 200 and r.text.startswith("date,rating,title,text")
    assert r.text.count("\n") >= 100
