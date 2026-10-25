import pandas as pd
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent   # repo root (one level above scripts/)
DATA = ROOT / "data"
print("Looking in:", DATA)

files = [p for p in DATA.rglob("*") if p.is_file()]
if not files:
    print("No files found. Check that the data folder is where you expect.")

for path in sorted(files):
    print("=" * 70)
    print(path.relative_to(ROOT), f"({os.path.getsize(path) / 1e6:.0f} MB)")
    try:
        df = pd.read_csv(path, low_memory=False)
    except Exception as e:
        print("Could not read as CSV:", str(e)[:200])
        continue
    print("rows:", len(df))
    print("columns:", df.columns.tolist())
    text_cols = [c for c in df.columns if "text" in c.lower()]
    rating_cols = [c for c in df.columns if "rating" in c.lower()]
    date_cols = [c for c in df.columns if "date" in c.lower()]
    print("text-like columns:", text_cols)
    print("rating-like columns:", rating_cols)
    print("date-like columns:", date_cols)
    if text_cols:
        s = df[text_cols[0]].dropna().astype(str)
        print("review length (chars): median", int(s.str.len().median()),
              "| max", int(s.str.len().max()))
        print("sample:", s.iloc[0][:300])