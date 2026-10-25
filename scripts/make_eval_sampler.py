import pandas as pd
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "raw" / "Datafiniti_Hotel_Reviews_Jun19.csv"
OUT = ROOT / "data" / "eval" / "eval_sample.csv"
OUT.parent.mkdir(parents=True, exist_ok=True)

df = pd.read_csv(SRC, low_memory=False)
df = df[["name", "city", "reviews.rating", "reviews.date", "reviews.text"]].copy()
df.columns = ["hotel", "city", "rating", "date", "text"]

# clean: need text and rating, sensible length, no duplicate texts
df = df.dropna(subset=["text", "rating"])
df["text"] = df["text"].astype(str).str.strip()
df = df[df["text"].str.len().between(150, 1000)]
df = df.drop_duplicates(subset="text")
df["rating"] = df["rating"].round().astype(int)

SEED = 42

def take(sub, n):
    return sub.sample(n=min(n, len(sub)), random_state=SEED)

low   = take(df[df.rating <= 2], 20)
three = take(df[df.rating == 3], 20)
four  = take(df[df.rating == 4], 20)
five  = take(df[df.rating == 5], 20)

# "mixed" reviews: 3-4 stars that contain contrast words (hard cases)
used = pd.concat([low, three, four, five]).index
mixed_pool = df[
    df.rating.isin([3, 4])
    & df.text.str.contains(r"\bbut\b|\bhowever\b|\balthough\b", case=False, regex=True)
    & ~df.index.isin(used)
]
mixed = take(mixed_pool, 20)

sample = pd.concat([low, three, four, five, mixed])
sample = sample.sample(frac=1, random_state=SEED).reset_index(drop=True)
sample.insert(0, "eval_id", range(1, len(sample) + 1))

sample.to_csv(OUT, index=False, encoding="utf-8-sig")
print("rows:", len(sample))
print(sample.rating.value_counts().sort_index().to_string())
print("text length (chars): median", int(sample.text.str.len().median()))
print("saved to", OUT)