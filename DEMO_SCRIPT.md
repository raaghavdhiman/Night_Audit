# Night Audit: demo video shot list (target 2:45, hard limit 3:00)

Record at 1440×900 or larger in the browser, paper theme. Use the deployed URL and open it once beforehand so
Render is awake. Everything below uses the real demo data (Hotel Wrenfield, synthetic). Narration is a
suggestion: say it in your own words. Times are cumulative.

**Prep:** open the site → Demo edition → scroll to top. In a second tab, have the repo's
`results/eval_summary.md` open. For shot 7, have `night-audit-sample-reviews.csv` downloaded (Live tab →
"Download a sample file").

---

### 1 · Hook (0:00–0:15)
**Screen:** the masthead with "NIGHT AUDIT", Monday, October 26, 2026, Hotel Wrenfield · Austin, Texas,
**SYNTHETIC DATA** badge.
**Say:** "Every morning a hotel GM is supposed to have read hundreds of reviews. Night Audit reads them overnight
and hands over a front page: the three things to fix this week, why they're happening, and what to do."

### 2 · Replay the night (0:15–0:40)
**Action:** click **Replay last night's audit**. Let the reconciliation ledger run: Extract counts up to
600/600, Trends lists the three headlines, Investigate shows Ultra's searches appearing ("I-35 Capital Express
South Project nightly closures…"), and the Guest Folio fills in on the right.
**Say:** "Four stages, four different Nemotron models on Nebius Token Factory. Super labels every review, pandas
does all the counting so no model ever counts, Super ranks the issues, Ultra investigates on the web through
Tavily tool calls, and Lightning drafts the replies."

### 3 · The lead story (0:40–1:05)
**Screen:** after the replay, the lead "Nightly highway construction disrupts guest sleep". Point at the sparkline
and its dashed onset line (week of Sep 21), and the numbers row (28% of recent reviews, 2.2× before).
**Say:** "Noise complaints more than doubled from late September. The onset week is detected in code, and every
number on this page comes from pandas, not from the model."

### 4 · The investigation (1:05–1:35)
**Action:** the investigation is already open under the lead (or click **Open the investigation**). Scroll
through: the hypothesis tagged EXTERNAL / high confidence (TxDOT's I-35 Capital Express nightly closures, 8 p.m.–6
a.m.), click a citation like **[3]** so it jumps to the source and expands, then point at the 3 numbered actions
with owners and the "Tell guests" line.
**Say:** "Ultra decided what to search, at most four searches per issue, enforced in code. It found the real
I-35 night closures next to the hotel. These are labeled hypotheses with numbered sources; only URLs Tavily
returned can be cited. Then it gives three concrete actions with an owner."

### 5 · Second stories and escalation (1:35–1:55)
**Action:** scroll to the red **Escalate today · health & safety** box (bed bugs, laptop theft), then the two
secondary stories: "Breakfast buffet runs out by 8:30 daily" and the bed-bug story.
**Say:** "Severity-5 incidents are never averaged away. Breakfast ties back to festival and F1 weekends pushing
occupancy past static breakfast prep."

### 6 · Replies for approval (1:55–2:10)
**Action:** in **Correspondence**, click **Approve** on the bed-bug reply (the APPROVED stamp lands), then
**Edit** another reply, change a word, and click **Copy**.
**Say:** "Drafts for the worst reviews. Nothing is sent. The GM approves, edits, or discards."

### 7 · The bill, and why routing matters (2:10–2:35)
**Screen:** zoom on the **Guest Folio**: Extract $0.239, Trends $0.003, Investigate $0.075, Replies $0.0007,
Total **$0.318**, and the stamp **All-Ultra baseline $2.18 (measured on 20 reviews, extrapolated), saved 85%**.
Optional 3-second cut to `results/eval_summary.md`'s decision table.
**Say:** "Every call is metered. Running everything on Ultra with thinking would cost $2.18 for this briefing;
routing costs 32 cents. We chose each model by evaluation: Lightning without thinking missed too much,
Lightning with thinking took 66 seconds a review, and Super without thinking was the sweet spot."

### 8 · Live mode and close (2:35–2:45)
**Action:** click **Live** to show the upload panel and its limits, drop the sample CSV, and start it (show the
first seconds of the live ledger; you don't need to wait for it to finish).
**Say:** "Upload your own reviews and it runs live, rate-limited and spend-capped. Night Audit: the morning
briefing your reviews have been trying to write."

---

**Cut list if you run long:** shorten shot 5 to the escalation box only (−10 s); drop the eval-table cut in shot 7 (−3 s).

**Must stay visible somewhere in the video:** the SYNTHETIC DATA badge, at least one Tavily search in the
reconciliation ledger, the Nemotron model names in the folio, and the baseline stamp.
