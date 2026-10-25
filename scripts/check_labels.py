import pandas as pd
from pathlib import Path

ASPECTS = {"cleanliness", "room_condition", "noise", "facilities", "front_desk",
           "housekeeping_service", "food_beverage", "staff_general",
           "value_price", "location", "safety_security"}

ROOT = Path(__file__).resolve().parent.parent
df = pd.read_csv(ROOT / "data" / "eval" / "label_sheet.csv").fillna("")

done, problems = 0, 0
for _, row in df.iterrows():
    lab = str(row["labels"]).strip()
    if not lab:
        continue
    done += 1
    if lab.lower() == "none":
        continue
    seen = set()
    for part in lab.split(";"):
        bits = [b.strip().lower() for b in part.strip().split(":")]
        err = None
        if len(bits) != 3:
            err = "needs aspect:sentiment:severity"
        elif bits[0] not in ASPECTS:
            err = f"unknown aspect '{bits[0]}'"
        elif bits[1] not in ("p", "n"):
            err = "sentiment must be p or n"
        elif bits[2] not in "012345" or len(bits[2]) != 1:
            err = "severity must be 0-5"
        elif bits[1] == "p" and bits[2] != "0":
            err = "positive aspects need severity 0"
        elif bits[1] == "n" and bits[2] == "0":
            err = "negative aspects need severity 1-5"
        elif bits[0] in seen:
            err = "aspect used twice"
        if err:
            problems += 1
            print(f"eval_id {row['eval_id']}: '{part.strip()}' -> {err}")
        else:
            seen.add(bits[0])

print(f"\nlabeled: {done}/{len(df)}   problems: {problems}")