import type { Issue } from "../types";
import { change, pct, shortDate } from "../format";
import { Severity, Sparkline } from "./Charts";
import { IconChevron } from "./Icons";
import { Investigation } from "./Investigation";

export function Story({ issue, lead, expanded, onToggle, nReviews }: {
  issue: Issue; lead?: boolean; expanded: boolean; onToggle: () => void; nReviews: number;
}) {
  const s = issue.stats;
  const panelId = `inv-${issue.rank}`;
  const quote = issue.quotes[0];
  const figure = (
    <figure className="figure">
      <Sparkline weekly={issue.weekly} onset={s.onset_week} height={lead ? 120 : 84} title={`Issue ${issue.rank}: ${issue.title}`} />
      <figcaption>
        Fig. {issue.rank} — negative “{issue.label.toLowerCase()}” mentions per week ({issue.weekly.reduce((a, w) => a + w.neg, 0)} in {nReviews} reviews).
        {s.onset_week ? ` Dashed: onset week ${shortDate(s.onset_week)}, detected in code.` : ""}
      </figcaption>
    </figure>
  );
  return (
    <article className={lead ? "lead" : "second"} aria-labelledby={`h-${issue.rank}`}>
      <div className="kicker">Issue No. {issue.rank} · {issue.department}</div>
      <h2 className="headline" id={`h-${issue.rank}`}>{issue.title}</h2>
      {issue.why_now && <p className="deck">{issue.why_now}</p>}
      <div className={lead ? "lead-grid" : ""}>
        <div>
          <div className="stat-row" aria-label="Key numbers, computed in code">
            <span><span className="k">recent</span>{pct(s.recent_neg_rate)} of reviews</span>
            <span><span className="k">vs before</span>{change(s.change_vs_baseline, s.new_since_baseline)}</span>
            <span><span className="k">last wk</span>{s.last_week_neg}</span>
            <span><span className="k">avg</span><Severity value={s.mean_severity} label={false} /> {s.mean_severity.toFixed(1)}</span>
          </div>
          {!lead && figure}
          <div className="body-copy">
            <p className={lead ? "dropcap" : ""}>{issue.interpretation}</p>
          </div>
          {lead && quote && (
            <p className="deck" style={{ borderLeft: "3px solid var(--oxblood)", paddingLeft: 12, fontSize: 17 }}>
              “{quote.excerpt}” <span className="mono faint" style={{ fontStyle: "normal", fontSize: 11.5 }}>— guest, {shortDate(quote.date)}</span>
            </p>
          )}
        </div>
        {lead && <div>{figure}</div>}
      </div>
      {issue.investigation && (
        <>
          <button className="expander" aria-expanded={expanded} aria-controls={panelId} onClick={onToggle}>
            {expanded ? "Close the investigation" : `Open the investigation · ${issue.investigation.cited_source_ids.length} cited source${issue.investigation.cited_source_ids.length === 1 ? "" : "s"}`}
            <IconChevron />
          </button>
          {expanded && <Investigation inv={issue.investigation} rank={issue.rank} id={panelId} />}
        </>
      )}
    </article>
  );
}
