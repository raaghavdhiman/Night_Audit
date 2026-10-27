import type { Issue } from "../types";
import { change, pct, shortDate } from "../format";
import { Severity, Sparkline } from "./Charts";
import { IconChevron } from "./Icons";
import { Investigation } from "./Investigation";

/** One issue in full: numbers, trend, interpretation and the investigation. Lives in "How this was built". */
export function Story({ issue, expanded, onToggle, nReviews, staleNote }: {
  issue: Issue; expanded: boolean; onToggle: () => void; nReviews: number; staleNote?: string | null;
}) {
  const s = issue.stats;
  const panelId = `inv-${issue.rank}`;
  const quote = issue.quotes[0];
  const easing = s.direction === "easing";
  return (
    <article className="story" aria-labelledby={`h-${issue.rank}`}>
      <div className="kicker">Issue No. {issue.rank} · {issue.department}</div>
      <h3 className="headline" id={`h-${issue.rank}`}>{issue.title}</h3>
      {(issue.why_now || easing) && (
        <p className="deck">
          {easing && <><span className="trend-easing">Easing</span> down to {s.last_week_neg} last week from {s.prev_week_neg}. </>}
          {issue.why_now}
        </p>
      )}
      <div className="story-grid">
        <div>
          <div className="stat-row" aria-label="Key numbers, computed in code">
            <span><span className="k">recent</span>{pct(s.recent_neg_rate)} of reviews</span>
            <span><span className="k">vs before</span>{change(s.change_vs_baseline, s.new_since_baseline)}</span>
            <span><span className="k">last wk</span>{s.last_week_neg}</span>
            <span><span className="k">avg</span><Severity value={s.mean_severity} label={false} /> {s.mean_severity.toFixed(1)}</span>
          </div>
          <div className="body-copy"><p>{issue.interpretation}</p></div>
          {quote && (
            <p className="story-quote">
              “{quote.excerpt}” <span className="mono faint">— guest, {shortDate(quote.date)}</span>
            </p>
          )}
        </div>
        <figure className="figure">
          <Sparkline weekly={issue.weekly} onset={s.onset_week} height={110} title={`Issue ${issue.rank}: ${issue.title}`} />
          <figcaption>
            Fig. {issue.rank} — negative “{issue.label.toLowerCase()}” mentions per week ({issue.weekly.reduce((a, w) => a + w.neg, 0)} in {nReviews} reviews).
            {s.onset_week ? ` Dashed: onset week ${shortDate(s.onset_week)}, detected in code.` : ""}
          </figcaption>
        </figure>
      </div>
      {issue.investigation && (
        <>
          <button className="expander" aria-expanded={expanded} aria-controls={panelId} onClick={onToggle}>
            {expanded ? "Close the investigation" : `Open the investigation · ${issue.investigation.cited_source_ids.length} cited source${issue.investigation.cited_source_ids.length === 1 ? "" : "s"}`}
            <IconChevron />
          </button>
          {expanded && <Investigation inv={issue.investigation} rank={issue.rank} id={panelId} staleNote={staleNote} />}
        </>
      )}
    </article>
  );
}
