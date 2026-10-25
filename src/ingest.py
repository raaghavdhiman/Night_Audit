"""CSV ingestion and sanitizing. Review text is untrusted data."""
from __future__ import annotations

import html
import io
import re

import pandas as pd

MAX_REVIEW_CHARS = 1500

TEXT_CANDIDATES = ["reviews.text", "review_text", "review", "text", "comment", "comments", "body",
                   "content", "feedback", "review body"]
DATE_CANDIDATES = ["reviews.date", "review_date", "date", "stay_date", "created_at", "submitted", "timestamp"]
RATING_CANDIDATES = ["reviews.rating", "rating", "score", "stars", "overall"]
TITLE_CANDIDATES = ["reviews.title", "title", "review_title", "headline"]
HOTEL_CANDIDATES = ["name", "hotel", "hotel_name", "property"]
CITY_CANDIDATES = ["city", "hotel_city", "location"]

_TAG = re.compile(r"<[^>]{0,400}>")
_WS = re.compile(r"\s+")
_CTRL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


class CSVError(ValueError):
    """Upload problem with a user-facing message."""


def clean_text(s, max_chars: int = MAX_REVIEW_CHARS) -> str:
    if s is None or (isinstance(s, float) and pd.isna(s)):
        return ""
    s = html.unescape(str(s))
    s = _TAG.sub(" ", s)
    s = _CTRL.sub(" ", s)
    s = _WS.sub(" ", s).strip()
    if len(s) > max_chars:
        s = s[:max_chars].rsplit(" ", 1)[0] + "..."
    return s


def _find_col(cols, candidates):
    low = {c.lower().strip(): c for c in cols}
    for cand in candidates:
        if cand in low:
            return low[cand]
    for cand in candidates:  # substring match, e.g. "Review Text"
        for lc, orig in low.items():
            if cand in lc:
                return orig
    return None


_NOT_TEXT = ("date", "rating", "score", "star", "title", "id", "name", "city", "user", "url")


def _median_len(s: pd.Series) -> float:
    m = s.dropna().astype(str).str.len().median()
    return float(m) if pd.notna(m) else 0.0


def detect_text_column(df: pd.DataFrame) -> str:
    low = {c.lower().strip(): c for c in df.columns}
    for cand in TEXT_CANDIDATES:  # exact names first
        if cand in low and _median_len(df[low[cand]]) >= 15:
            return low[cand]
    for cand in TEXT_CANDIDATES:  # then substrings, skipping date/rating/title-like columns
        for lc, orig in low.items():
            if cand in lc and not any(w in lc.replace(cand, "") for w in _NOT_TEXT) and _median_len(df[orig]) >= 15:
                return orig
    # fall back: the object column with the longest median length
    best, best_len = None, 0.0
    for c in df.columns:
        if df[c].dtype == object or str(df[c].dtype).startswith("str"):
            m = df[c].dropna().astype(str).str.len().median()
            if pd.notna(m) and m > best_len:
                best, best_len = c, float(m)
    if best is None or best_len < 20:
        raise CSVError("Could not find a review text column. Name it 'text' or 'review'.")
    return best


def parse_reviews_csv(data: bytes | str, max_reviews: int | None = None) -> tuple[pd.DataFrame, dict]:
    """Parse an uploaded CSV into a normalized frame.

    Returns (df, meta) where df has columns review_id, text, date (datetime or NaT),
    rating (float or NaN), title. meta has detected columns, hotel, city, counts.
    """
    if isinstance(data, bytes):
        if b"\x00" in data[:4096]:
            raise CSVError("That file looks binary, not a CSV.")
        for enc in ("utf-8-sig", "cp1252", "latin-1"):
            try:
                data = data.decode(enc)
                break
            except UnicodeDecodeError:
                continue
    try:
        raw = pd.read_csv(io.StringIO(data), dtype=str, keep_default_na=False, on_bad_lines="skip")
    except Exception as e:  # pandas raises several types here
        raise CSVError(f"Could not read the CSV: {str(e)[:120]}") from None
    if raw.empty or len(raw.columns) == 0:
        raise CSVError("The CSV has no rows.")

    text_col = detect_text_column(raw)
    date_col = _find_col([c for c in raw.columns if c != text_col], DATE_CANDIDATES)
    rating_col = _find_col([c for c in raw.columns if c != text_col], RATING_CANDIDATES)
    title_col = _find_col([c for c in raw.columns if c != text_col], TITLE_CANDIDATES)
    hotel_col = _find_col([c for c in raw.columns if c not in (text_col, title_col)], HOTEL_CANDIDATES)
    city_col = _find_col([c for c in raw.columns if c != text_col], CITY_CANDIDATES)

    df = pd.DataFrame({"text": raw[text_col].map(clean_text)})
    id_col = _find_col([c for c in raw.columns if c != text_col], ["review_id"])
    if id_col and raw[id_col].is_unique and (raw[id_col].str.len() <= 40).all():
        df["source_id"] = raw[id_col].map(lambda s: clean_text(s, 40))
    df["title"] = raw[title_col].map(lambda s: clean_text(s, 200)) if title_col else ""
    df["date"] = pd.to_datetime(raw[date_col], errors="coerce", utc=True).dt.tz_localize(None) if date_col else pd.NaT
    df["rating"] = pd.to_numeric(raw[rating_col], errors="coerce") if rating_col else float("nan")
    df = df[df["text"].str.len() >= 10].copy()
    n_valid = len(df)
    if n_valid == 0:
        raise CSVError("No reviews with text found.")
    truncated_to = None
    if max_reviews and n_valid > max_reviews:
        # keep the most recent reviews when dates exist, else the first N rows
        if df["date"].notna().any():
            df = df.sort_values("date", ascending=False, na_position="last")
        df = df.head(max_reviews).sort_index()
        truncated_to = max_reviews
    if "source_id" in df.columns:
        df.insert(0, "review_id", df.pop("source_id"))
    else:
        df.insert(0, "review_id", [f"r{i + 1}" for i in range(len(df))])
    df = df.reset_index(drop=True)

    def _mode(col):
        if not col:
            return None
        vals = raw[col].astype(str).str.strip()
        vals = vals[vals != ""]
        return clean_text(vals.mode().iloc[0], 120) if len(vals) else None

    meta = {
        "text_column": text_col, "date_column": date_col, "rating_column": rating_col,
        "hotel": _mode(hotel_col), "city": _mode(city_col),
        "n_rows": int(len(raw)), "n_reviews": int(n_valid), "truncated_to": truncated_to,
        "has_dates": bool(date_col) and bool(df["date"].notna().any()),
    }
    return df, meta
