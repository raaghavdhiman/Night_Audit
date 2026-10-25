import pandas as pd
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "eval" / "eval_sample.csv"
OUT = ROOT / "data" / "eval" / "label_sheet.csv"

if OUT.exists():
    print("label_sheet.csv already exists. Not overwriting your work.")
else:
    df = pd.read_csv(SRC)
    sheet = df[["eval_id", "rating", "text"]].copy()
    sheet["labels"] = ""
    sheet.to_csv(OUT, index=False, encoding="utf-8-sig")
    print("created", OUT)