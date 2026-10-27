import { useMemo, type ReactNode } from "react";
import type { AuditResult } from "../types";
import { int, pct } from "../format";
import { MentionBars } from "./Charts";
import { IconAlert } from "./Icons";
import { IssueCard } from "./IssueCard";
import { CountUp } from "./Motion";
import { useReplyStore } from "./Replies";
import { Escalations } from "./Sections";

export const replyKey = (r: AuditResult) => `na-replies-v2-${r.meta.hotel}-${r.meta.generated_at}`;

/** "At a glance": four big figures, each read straight from the result. A figure whose field is missing is left out. */
export function AtAGlance({ r }: { r: AuditResult }) {
  const top = r.issues[0];
  const figures: { value: string; label: string; key: string }[] = [
    { key: "reviews", value: int(r.meta.n_reviews), label: "reviews analysed" },
    { key: "issues", value: String(r.issues.length), label: r.issues.length === 1 ? "issue flagged" : "issues flagged" },
  ];
  if (top) figures.push({ key: "top", value: pct(top.stats.recent_neg_rate), label: `of recent reviews cite ${top.label.toLowerCase()}` });
  figures.push({ key: "safety", value: String(r.escalations.length), label: r.escalations.length === 1 ? "guest-safety flag" : "guest-safety flags" });
  return (
    <dl className="glance" aria-label="At a glance">
      {figures.map((f) => (
        <div className="glance-cell" key={f.key}>
          <dt>{f.label}</dt>
          <dd><CountUp id={`glance-${r.meta.generated_at}-${f.key}`} text={f.value} /></dd>
        </div>
      ))}
    </dl>
  );
}

/** One line above the cards when there are health & safety escalations; nothing otherwise. */
function SafetyAlert({ n }: { n: number }) {
  if (!n) return null;
  const go = () => {
    const el = document.getElementById("escalations");
    const smooth = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
    el?.focus({ preventScroll: true });
  };
  return (
    <button className="safety-alert" onClick={go}>
      <span className="pulse-dot" aria-hidden />
      <IconAlert />
      <span>{n === 1 ? "1 guest-safety review needs a call today." : `${n} guest-safety reviews need a call today.`}</span>
      <span className="safety-go">See {n === 1 ? "it" : "them"} ↓</span>
    </button>
  );
}

/**
 * The front-page body for a finished edition (the demo on "Tonight's Issues", a live run on "Run your own"):
 * figures and the mentions chart, the safety alert, up to three issue cards, then the escalations.
 * Remount it per result (key by replyKey) so the reply drafts load for that result.
 */
export function FrontBody({ r, after }: { r: AuditResult; after?: ReactNode }) {
  const store = useReplyStore(replyKey(r));
  const top = r.issues.slice(0, 3);
  const featured = useMemo(() => new Map(r.issues.slice(0, 3).map((i) => [i.aspect, i.rank])), [r.issues]);
  return (
    <main id="main" className="front">
      <div className="front-row">
        <section aria-labelledby="k-front">
          <div className="kicker" id="k-front">Front page</div>
          <AtAGlance r={r} />
        </section>
        <section aria-labelledby="k-numbers">
          <div className="kicker" id="k-numbers">By the numbers</div>
          <MentionBars aspects={r.aspects} featured={featured} period={r.meta.period} />
        </section>
      </div>
      <SafetyAlert n={r.escalations.length} />
      <div className="kicker">Fix first</div>
      {r.issues.length === 0 && <p className="muted">No issue stood out in these reviews.</p>}
      <div className="cards">
        {top.map((i, k) => {
          const rep = r.replies.find((x) => x.issue_rank === i.rank);
          return <IssueCard key={i.rank} issue={i} lead={k === 0} index={k} replyText={rep ? store.get(rep).text : undefined} />;
        })}
      </div>
      {r.escalations.length > 0 && (
        <section className="front-esc" aria-label="Guest-safety reviews">
          <div className="kicker">Call today</div>
          <Escalations items={r.escalations} />
        </section>
      )}
      {after}
    </main>
  );
}
