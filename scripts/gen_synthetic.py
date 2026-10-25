"""Generate the synthetic demo hotel: ~600 reviews over 8 weeks with a planted story.

Structure (aspect, sentiment, severity, date) is decided deterministically here; Lightning
(thinking off) only writes the natural-language text for each spec. Outputs (committed):
  data/synthetic/reviews.csv
  data/synthetic/ground_truth.json

Usage: python scripts/gen_synthetic.py [--limit N] [--concurrency 10]
"""
from __future__ import annotations

import argparse
import asyncio
import csv
import json
import random
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from src import config  # noqa: E402
from src.cost_tracker import Ledger, use_ledger, stage  # noqa: E402
from src.extract import DEFAULT_DEPT  # noqa: E402
from src.jsonutil import extract_json  # noqa: E402

OUT = ROOT / "data" / "synthetic"
SEED = 2026

HOTEL = {
    "name": "Hotel Wrenfield",
    "city": "Austin, Texas",
    "description": "Fictional 140-room boutique hotel in downtown Austin, TX, a few blocks from the "
                   "I-35 frontage road and Rainey Street. Breakfast buffet included; rooftop pool; valet parking.",
    "fictional": True,
}
START = date(2026, 8, 31)  # Monday of week 1
WEEKS = 8
REVIEWS_PER_WEEK = [70, 72, 71, 74, 82, 80, 76, 75]  # weeks 5-6 busier (festival season)

# P(aspect mentioned positively) and P(aspect mentioned negatively) for an ordinary review
BG_POS = {"location": 0.38, "staff_general": 0.30, "room_condition": 0.24, "cleanliness": 0.24,
          "front_desk": 0.14, "food_beverage": 0.12, "facilities": 0.11, "value_price": 0.08,
          "housekeeping_service": 0.05}
BG_NEG = {"room_condition": 0.06, "value_price": 0.06, "facilities": 0.05, "cleanliness": 0.04,
          "front_desk": 0.04, "noise": 0.04, "food_beverage": 0.03, "housekeeping_service": 0.03,
          "staff_general": 0.02, "location": 0.01}

# Planted trends: extra P(negative) by week index (0-based)
PLANT_FB = [0, 0, 0, 0, 0.20, 0.27, 0.30, 0.32]      # breakfast breakdown from week 5
PLANT_NOISE = [0, 0, 0, 0.10, 0.15, 0.17, 0.19, 0.19]  # overnight highway construction from week 4

DETAILS_NEG = {
    "food_beverage_planted": [
        "the breakfast buffet had run out of eggs and pastries by 8:30am and nothing was restocked",
        "waited about 40 minutes for a table at breakfast; the room was packed",
        "only one staff member was running the whole breakfast room and could not keep up",
        "the coffee urns were empty and there were no clean mugs or plates at breakfast",
        "breakfast was chaos: empty trays, a long line, and the waffle station closed",
        "came down at 9 and the breakfast was mostly gone, staff said they were 'out for today'",
    ],
    "noise_planted": [
        "overnight highway construction on the freeway side: jackhammers and beeping trucks from midnight to 5am",
        "road crews working on the interstate right outside all night; impossible to sleep even with earplugs",
        "heavy machinery and backup alarms from the highway work kept us awake until 4am",
        "the construction on I-35 runs through the night and our room faced it; front desk said it has been going on for weeks",
        "bright work lights and drilling from the road construction all night",
    ],
    "cleanliness": ["hair in the shower", "stained carpet", "dusty surfaces", "a musty smell in the hallway"],
    "room_condition": ["the AC was weak", "a worn-out mattress", "a dripping faucet", "the safe did not work"],
    "noise": ["thin walls; could hear the neighbours", "loud bar crowd from Rainey Street on Saturday night",
              "a noisy ice machine near the room"],
    "facilities": ["the rooftop pool was closed for a private event", "slow wifi", "one elevator out of service",
                   "valet parking took 30 minutes"],
    "front_desk": ["a long check-in line", "the room was not ready at 4pm", "a billing mistake at check-out"],
    "housekeeping_service": ["the room was not serviced one day", "had to ask twice for towels"],
    "food_beverage": ["the bar drinks were overpriced and weak", "room service arrived cold"],
    "staff_general": ["a staff member was curt with us", "nobody seemed to know the answer to anything"],
    "value_price": ["expensive for the size of the room", "surprise destination fee", "valet is $55 a night"],
    "location": ["the walk from the convention center was longer than expected"],
}
DETAILS_POS = {
    "location": ["walkable to Rainey Street and the river trail", "great central location"],
    "staff_general": ["the staff were warm and helpful", "everyone was friendly"],
    "room_condition": ["comfortable bed", "stylish, spacious room", "great shower"],
    "cleanliness": ["spotless room", "very clean"],
    "front_desk": ["quick check-in", "the front desk gave great restaurant tips"],
    "food_beverage": ["good breakfast tacos", "the rooftop bar was great", "nice breakfast spread"],
    "facilities": ["lovely rooftop pool", "good gym"],
    "value_price": ["good value for downtown Austin"],
    "housekeeping_service": ["housekeeping was thorough"],
}
SEV5 = [
    {"week": 6, "aspect": "safety_security", "severity": 5,
     "detail": "my laptop was taken from the room while we were out; the door had not latched properly and "
               "security footage was 'not available'"},
    {"week": 7, "aspect": "cleanliness", "severity": 5,
     "detail": "found bed bugs on the mattress seam on the second night and woke up with bites"},
]
PERSONAS = ["business traveler", "couple on a weekend trip", "family with two kids", "solo traveler",
            "group of friends in town for a music festival", "F1 fan in town for the race weekend",
            "conference attendee", "retired couple", "wedding guest"]
FIRST_NAMES = ["Sarah", "Mike", "Priya", "Jose", "Linda", "Kevin", "Aisha", "Tom", "Mei", "Carlos",
               "Rachel", "Dan", "Fatima", "Greg", "Hannah", "Omar", "Julia", "Ben"]


def build_specs(rng: random.Random) -> list[dict]:
    specs = []
    rid = 0
    for w in range(WEEKS):
        week_start = START + timedelta(days=7 * w)
        for _ in range(REVIEWS_PER_WEEK[w]):
            rid += 1
            aspects = {}
            planted = []
            for a, p in BG_POS.items():
                if rng.random() < p:
                    aspects[a] = {"aspect": a, "sentiment": "p", "severity": 0,
                                  "detail": rng.choice(DETAILS_POS[a])}
            for a, p in BG_NEG.items():
                if rng.random() < p:
                    aspects[a] = {"aspect": a, "sentiment": "n", "severity": rng.choice([1, 2, 2, 2, 3, 3, 4]),
                                  "detail": rng.choice(DETAILS_NEG[a])}
            if rng.random() < PLANT_FB[w]:
                aspects["food_beverage"] = {"aspect": "food_beverage", "sentiment": "n",
                                            "severity": rng.choice([2, 2, 3, 3, 3, 4]),
                                            "detail": rng.choice(DETAILS_NEG["food_beverage_planted"])}
                planted.append("breakfast")
            if rng.random() < PLANT_NOISE[w]:
                aspects["noise"] = {"aspect": "noise", "sentiment": "n", "severity": rng.choice([2, 3, 3, 4, 4]),
                                    "detail": rng.choice(DETAILS_NEG["noise_planted"])}
                planted.append("construction_noise")
            if not aspects and rng.random() < 0.6:
                a = rng.choice(list(DETAILS_POS))
                aspects[a] = {"aspect": a, "sentiment": "p", "severity": 0, "detail": rng.choice(DETAILS_POS[a])}
            # cap at 4 aspects, keep negatives first
            items = sorted(aspects.values(), key=lambda x: (x["sentiment"] == "p", rng.random()))[:4]
            day = week_start + timedelta(days=rng.choices(range(7), weights=[3, 2, 2, 2, 2, 3, 4])[0])
            specs.append({"review_id": f"s{rid:04d}", "date": day.isoformat(), "week": w + 1,
                          "aspects": items, "planted": planted})
    # severity-5 incidents replace a random review's content in the given week
    for inc in SEV5:
        pool = [s for s in specs if s["week"] == inc["week"] and not s["planted"]]
        s = rng.choice(pool)
        s["aspects"] = [{"aspect": inc["aspect"], "sentiment": "n", "severity": 5, "detail": inc["detail"]}]
        if inc["aspect"] == "cleanliness":
            s["aspects"].append({"aspect": "front_desk", "sentiment": "n", "severity": 3,
                                 "detail": "the front desk only offered a room change, no refund"})
        s["planted"] = ["severity5_" + ("theft" if inc["aspect"] == "safety_security" else "pest")]
    for s in specs:
        for a in s["aspects"]:
            a["department"] = DEFAULT_DEPT[a["aspect"]]
        negs = [a["severity"] for a in s["aspects"] if a["sentiment"] == "n"]
        top = max(negs) if negs else 0
        s["rating"] = (rng.choice([4, 5, 5, 5]) if top == 0 else rng.choice([3, 4, 4]) if top <= 2
                       else rng.choice([2, 3]) if top == 3 else 1 if top == 5 else rng.choice([1, 2]))
        if not s["aspects"]:
            s["rating"] = rng.choice([4, 5])
        s["persona"] = rng.choice(PERSONAS if s["week"] >= 5 else [p for p in PERSONAS if "F1" not in p])
        s["length"] = rng.choices(["short", "medium", "long"], weights=[3, 5, 2])[0]
        s["guest_name"] = rng.choice(FIRST_NAMES)
        s["glued_reply"] = rng.random() < 0.09
        s["truncated"] = (not s["glued_reply"]) and rng.random() < 0.09
    return specs


WRITER_PROMPT = """You write realistic hotel guest reviews for a software test dataset.
Hotel: {hotel}, a downtown hotel in {city}.
Write ONE review as a {persona}, star rating {rating}/5, length: {length} ({words} words).
The review MUST clearly mention every point below, in natural words (do not copy them verbatim, do not
use the category names):
{points}
Do NOT praise or criticise anything that is not in the list above (no extra comments about location,
cleanliness, staff, beds, breakfast, etc.). Fill the length with neutral context instead: why you were
in town, who you travelled with, what you did that day.
{mixed}Vary the voice: some guests are casual, some formal, some use no capitals or minor typos.
Do not mention the date. Do not use the word "review".
Return JSON: {{"title": "short review title", "review": "the review text"{extra_fields}}}"""


async def write_one(spec: dict, sem: asyncio.Semaphore) -> dict:
    points = "\n".join(
        f"- {'PRAISE' if a['sentiment'] == 'p' else 'COMPLAINT (severity ' + str(a['severity']) + '/5)'}: {a['detail']}"
        for a in spec["aspects"]) or "- nothing specific: a vague, generic comment such as 'nice stay, would come back'"
    extra = ""
    if spec["glued_reply"]:
        extra += (', "manager_reply": "a reply from the hotel general manager starting \'Dear '
                  + spec["guest_name"] + ',\' thanking them and apologizing or responding to each point (2-4 sentences)"')
    if spec["truncated"]:
        extra += ', "extra": "two more sentences of harmless small talk about the trip"'
    words = {"short": "20-45", "medium": "50-110", "long": "120-200"}[spec["length"]]
    mixed = ("This is a mixed review: balance the praise and complaints.\n"
             if any(a["sentiment"] == "p" for a in spec["aspects"]) and any(a["sentiment"] == "n" for a in spec["aspects"])
             else "")
    prompt = WRITER_PROMPT.format(hotel=HOTEL["name"], city=HOTEL["city"], persona=spec["persona"],
                                  rating=spec["rating"], length=spec["length"], words=words, points=points,
                                  mixed=mixed, extra_fields=extra)
    err = None
    async with sem:
        for _ in range(3):
            try:
                r = await config.acall_model("lightning", [{"role": "user", "content": prompt}], thinking=False,
                                             max_tokens=900, temperature=0.9, response_format={"type": "json_object"})
                obj = extract_json(r.text)
                if len(" ".join(str(obj.get("review") or "").split())) >= 20:
                    return obj
            except Exception as e:  # retry on API or JSON errors
                err = e
                await asyncio.sleep(1)
    raise RuntimeError(f"failed to write {spec['review_id']}: {err}")


def assemble(spec: dict, obj: dict) -> str:
    text = " ".join(str(obj["review"]).split())
    if spec["truncated"] and obj.get("extra"):
        extra = " ".join(str(obj["extra"]).split())
        cut = max(10, int(len(extra) * 0.55))
        text = f"{text} {extra[:cut].rstrip()}...More"
    if spec["glued_reply"] and obj.get("manager_reply"):
        # Datafiniti style: guest text, '...More', then the manager reply with no separator
        text = f"{text}...More{' '.join(str(obj['manager_reply']).split())}"
    return text


async def main_async(specs, concurrency):
    sem = asyncio.Semaphore(concurrency)
    done = 0

    async def run(s):
        nonlocal done
        obj = await write_one(s, sem)
        done += 1
        if done % 50 == 0:
            print(f"  {done}/{len(specs)} written | dev spend ${config.SPEND.get():.3f}")
        return obj

    return await asyncio.gather(*(run(s) for s in specs))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--concurrency", type=int, default=10)
    args = ap.parse_args()
    config.require_keys(("NEBIUS_API_KEY",))
    rng = random.Random(SEED)
    specs = build_specs(rng)
    if args.limit:
        specs = specs[: args.limit]
    print(f"{len(specs)} review specs; writing text with Lightning (thinking off)...")
    ledger = Ledger("synthetic")
    with use_ledger(ledger), stage("synthetic"):
        objs = asyncio.run(main_async(specs, args.concurrency))

    OUT.mkdir(parents=True, exist_ok=True)
    with open(OUT / "reviews.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["review_id", "date", "rating", "title", "text", "hotel", "city"])
        for s, o in zip(specs, objs):
            w.writerow([s["review_id"], s["date"], s["rating"], " ".join(str(o.get("title", "")).split()),
                        assemble(s, o), HOTEL["name"], HOTEL["city"]])

    weekly = []
    for wk in range(1, WEEKS + 1):
        ws = [s for s in specs if s["week"] == wk]
        weekly.append({
            "week": wk, "week_start": (START + timedelta(days=7 * (wk - 1))).isoformat(), "reviews": len(ws),
            "neg_food_beverage": sum(any(a["aspect"] == "food_beverage" and a["sentiment"] == "n" for a in s["aspects"]) for s in ws),
            "neg_noise": sum(any(a["aspect"] == "noise" and a["sentiment"] == "n" for a in s["aspects"]) for s in ws),
        })
    gt = {
        "hotel": HOTEL, "period": {"start": START.isoformat(), "end": (START + timedelta(days=7 * WEEKS - 1)).isoformat(),
                                   "weeks": WEEKS},
        "generated": datetime.now().isoformat(timespec="seconds"), "seed": SEED,
        "writer_model": "nvidia/Nemotron-3_5-Lightning (thinking off)",
        "planted_story": [
            {"id": "breakfast", "aspect": "food_beverage", "department": "Food & Beverage", "starts_week": 5,
             "description": "Breakfast buffet breakdown (items running out, long waits, understaffed) rising "
                            "sharply from week 5, coinciding with festival-season occupancy."},
            {"id": "construction_noise", "aspect": "noise", "department": "Front Office", "starts_week": 4,
             "description": "Overnight highway (I-35) construction noise on the freeway-facing side from week 4."},
            {"id": "severity5_theft", "aspect": "safety_security", "week": 6,
             "description": "One theft from a room with a door that did not latch."},
            {"id": "severity5_pest", "aspect": "cleanliness", "week": 7,
             "description": "One bed bug report."},
        ],
        "expected_top_issues": ["food_beverage", "noise"],
        "acceptable_third_issue": ["safety_security", "cleanliness"],
        "weekly_planted_counts": weekly,
        "reviews": [{k: s[k] for k in ("review_id", "date", "week", "rating", "aspects", "planted",
                                       "glued_reply", "truncated")} for s in specs],
    }
    (OUT / "ground_truth.json").write_text(json.dumps(gt, indent=1), encoding="utf-8")
    t = ledger.summary()["total"]
    print(f"Wrote {len(specs)} reviews. Generation cost ${t['cost_usd']:.4f} | dev spend ${config.SPEND.get():.3f}")
    for wkrow in weekly:
        print(f"  week {wkrow['week']}: {wkrow['reviews']} reviews, neg F&B {wkrow['neg_food_beverage']}, "
              f"neg noise {wkrow['neg_noise']}")


if __name__ == "__main__":
    main()
