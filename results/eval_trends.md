# Trends stage: Super thinking ON vs OFF

_scripts/eval_trends.py, 2026-10-25 17:07. Extraction: `super_off` on all 600 synthetic reviews; counting done in pandas. Scored against the planted story (expected: food_beverage, noise; acceptable third: safety_security, cleanliness)._

| thinking | run | top 3 | top-3 precision | both planted trends found | reasoning tokens | seconds | cost |
|---|---|---|---|---|---|---|---|
| on | 1 | food_beverage, noise, cleanliness | 1.00 | yes | 1,866 | 16 | $0.0031 |
| on | 2 | food_beverage, noise, cleanliness | 1.00 | yes | 1,555 | 13 | $0.0029 |
| off | 1 | food_beverage, noise, cleanliness | 1.00 | yes | 0 | 6 | $0.0014 |
| off | 2 | food_beverage, noise, cleanliness | 1.00 | yes | 0 | 3 | $0.0014 |

Headlines written (the thing the GM reads first):

- thinking on, run 1: Breakfast buffet depleted by 8:30 AM / Nighttime traffic noise disrupts guest sleep / Bed bugs found in guest rooms spark health concerns
- thinking on, run 2: Food and beverage complaints spike to 32% / Noise complaints rise to 28% amid events / Bed‑bug report raises health concerns
- thinking off, run 1: Food & beverage complaints surge past 30% in recent weeks / Noise complaints climb to 28% amid rise in weekend events / Housekeeping lapse identified with confirmed bed bug report
- thinking off, run 2: Food & beverage complaints surge past 30% in recent weeks / Noise complaints jump to 33% of recent reviews amid event disruptions / Housekeeping lapse identified with confirmed bed bug report in recent stay

Decision: when both settings pick the same top 3, keep thinking ON for the more specific, less templated headlines; the extra cost is a fraction of a cent per run.
