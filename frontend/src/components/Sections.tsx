import type { AspectSummary, Escalation, Issue } from "../types";
import { change, pct, shortDate } from "../format";
import { Severity, WeekBars } from "./Charts";
import { IconAlert } from "./Icons";

export function Escalations({ items }: { items: Escalation[] }) {
  if (!items.length) return null;
  return (
    <aside className="escalate" aria-labelledby="esc-title">
      <h3 id="esc-title"><IconAlert /> Escalate today · health &amp; safety</h3>
      <ul>
        {items.map((e) => (
          <li key={e.review_id}>
            <div className="m">
              <Severity value={e.severity} /> · {e.label} · {e.department} · {shortDate(e.date)}
            </div>
            <div className="x">“{e.excerpt}”</div>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export function LedgerTable({ aspects, issues }: { aspects: AspectSummary[]; issues: Issue[] }) {
  const top = new Set(issues.map((i) => i.aspect));
  const rows = [...aspects].sort((a, b) => b.neg_total - a.neg_total);
  return (
    <section aria-labelledby="ledger-title">
      <div className="section-head">
        <h2 id="ledger-title">The ledger: every department, reconciled</h2>
        <span className="aside">counted in pandas, not by a model</span>
      </div>
      <div className="ledger-wrap" tabIndex={0} aria-label="Aspect ledger table, scrollable">
        <table className="ledger">
          <caption className="sr-only">Negative mentions by aspect over the period</caption>
          <thead>
            <tr>
              <th scope="col">Aspect</th>
              <th scope="col">Owner</th>
              <th scope="col" className="n">Neg.</th>
              <th scope="col" className="n">Pos.</th>
              <th scope="col" className="n">Recent rate</th>
              <th scope="col" className="n">vs before</th>
              <th scope="col">Avg severity</th>
              <th scope="col">Weekly negatives</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const ch = change(a.change_vs_baseline, a.new_since_baseline);
              const up = a.new_since_baseline || (a.change_vs_baseline ?? 0) > 0.25;
              return (
                <tr key={a.aspect} className={top.has(a.aspect) ? "top" : ""}>
                  <td>{a.label}</td>
                  <td className="muted">{a.department}</td>
                  <td className="n">{a.neg_total}</td>
                  <td className="n muted">{a.pos_total}</td>
                  <td className="n">{pct(a.recent_neg_rate, 1)}</td>
                  <td className={`n ${up ? "up" : "down"}`}>{ch}</td>
                  <td>{a.neg_total ? <Severity value={a.mean_severity} label={false} /> : <span className="faint">—</span>}</td>
                  <td><WeekBars weekly={a.weekly} hot={top.has(a.aspect)} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
