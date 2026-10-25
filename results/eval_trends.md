# Trends stage: Super thinking ON vs OFF

_scripts/eval_trends.py, 2026-10-25 17:07. Extraction: `super_off` on all 600 synthetic reviews; counting done in pandas. Scored against the planted story (expected: food_beverage, noise; acceptable third: safety_security, cleanliness)._

| thinking | run | top 3 | top-3 precision | both planted trends found | reasoning tokens | seconds | cost |
|---|---|---|---|---|---|---|---|
| on | 1 | food_beverage, noise, cleanliness | 1.00 | yes | 1,866 | 16 | $0.0031 |
| on | 2 | food_beverage, noise, cleanliness | 1.00 | yes | 1,555 | 13 | $0.0029 |
| off | 1 | food_beverage, noise, cleanliness | 1.00 | yes | 0 | 6 | $0.0014 |
| off | 2 | food_beverage, noise, cleanliness | 1.00 | yes | 0 | 3 | $0.0014 |
