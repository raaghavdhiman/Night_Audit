import os, time, json
from dotenv import load_dotenv
from openai import OpenAI
load_dotenv()

MODELS = {
    "lightning": ("nvidia/Nemotron-3_5-Lightning", "https://api.tokenfactory.nebius.com/v1/"),
    "super":     ("nvidia/nemotron-3-super-120b-a12b", "https://api.tokenfactory.us-central1.nebius.com/v1/"),
    "ultra":     ("nvidia/Nemotron-3-Ultra-550b-a55b", "https://api.tokenfactory.us-central1.nebius.com/v1/"),
}

REVIEW = ("Stayed 3 nights. Room was nice but AC was loud and the "
          "breakfast buffet ran out of eggs by 9:30. Front desk was lovely though.")
PROMPT = ("Extract from this hotel review as JSON with keys: "
          "aspects (list of {aspect, sentiment, severity 1-5, department}). "
          "Return only JSON.\n\nReview: " + REVIEW)

VARIANTS = {
    "A_default_3000": dict(max_tokens=3000),
    "B_enable_thinking_false": dict(
        max_tokens=1000,
        extra_body={"chat_template_kwargs": {"enable_thinking": False}}),
    "C_json_mode": dict(
        max_tokens=3000,
        response_format={"type": "json_object"}),
}

def try_parse(text):
    if not text:
        return False
    s, e = text.find("{"), text.rfind("}")
    if s == -1 or e == -1:
        return False
    try:
        json.loads(text[s:e + 1])
        return True
    except Exception:
        return False

for name, (model_id, base_url) in MODELS.items():
    client = OpenAI(base_url=base_url, api_key=os.environ["NEBIUS_API_KEY"])
    for vname, kwargs in VARIANTS.items():
        t0 = time.time()
        try:
            r = client.chat.completions.create(
                model=model_id,
                messages=[{"role": "user", "content": PROMPT}],
                **kwargs,
            )
            dt = time.time() - t0
            u = r.usage
            rt = u.completion_tokens_details.reasoning_tokens if u.completion_tokens_details else None
            msg = r.choices[0].message
            print(f"{name:9} {vname:24} {dt:5.1f}s finish={r.choices[0].finish_reason:6} "
                  f"out={u.completion_tokens:5} reasoning={rt} "
                  f"json_ok={try_parse(msg.content)} "
                  f"has_reasoning_field={bool(getattr(msg, 'reasoning_content', None))}")
        except Exception as e:
            print(f"{name:9} {vname:24} FAILED: {str(e)[:200]}")