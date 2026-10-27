import type { AuditResult } from "../types";
import { int, pct } from "../format";
import { IconAlert } from "./Icons";

/** "At a glance": 3-4 big figures, each read straight from the result. A figure whose field is missing is left out. */
export function AtAGlance({ r }: { r: AuditResult }) {
  const top = r.issues[0];
  const figures: { value: string; label: string }[] = [
    { value: int(r.meta.n_reviews), label: "reviews analysed" },
    { value: String(r.issues.length), label: r.issues.length === 1 ? "issue flagged" : "issues flagged" },
  ];
  if (top) figures.push({ value: pct(top.stats.recent_neg_rate), label: `of recent reviews cite ${top.label.toLowerCase()}` });
  if (typeof r.savings_pct === "number") figures.push({ value: `${Math.round(r.savings_pct)}%`, label: "cheaper than an all-Ultra run (est.)" });
  return (
    <dl className="glance" aria-label="At a glance">
      {figures.map((f) => (
        <div className="glance-cell" key={f.label}>
          <dt>{f.label}</dt>
          <dd>{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** One line above the cards when there are health & safety escalations; nothing otherwise. */
export function SafetyAlert({ n, onOpen }: { n: number; onOpen: () => void }) {
  if (!n) return null;
  return (
    <button className="safety-alert" onClick={onOpen}>
      <IconAlert />
      <span>{n === 1 ? "1 guest-safety review needs a call today." : `${n} guest-safety reviews need a call today.`}</span>
      <span className="safety-go">See {n === 1 ? "it" : "them"} →</span>
    </button>
  );
}
