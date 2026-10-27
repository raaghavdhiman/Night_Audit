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
        <div className={`glance-cell g-${f.key}${f.key === "safety" && r.escalations.length ? " g-alert" : ""}`} key={f.key}>
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
 * the figures strip and the safety alert, then the lead story with a rail (mentions chart, guest-safety reviews)
 * and issues 2 and 3 below. Remount it per result (key by replyKey) so the reply drafts load for that result.
 */
export function FrontBody({ r, after }: { r: AuditResult; after?: ReactNode }) {
  const store = useReplyStore(replyKey(r));
  const top = r.issues.slice(0, 3);
  const featured = useMemo(() => new Map(r.issues.slice(0, 3).map((i) => [i.aspect, i.rank])), [r.issues]);
  const card = (k: number) => {
    const i = top[k];
    const rep = r.replies.find((x) => x.issue_rank === i.rank);
    return <IssueCard key={i.rank} issue={i} lead={k === 0} index={k} replyText={rep ? store.get(rep).text : undefined} />;
  };
  return (
    <main id="main" className="front">
      <section className="glance-strip" aria-labelledby="k-front">
        <h2 className="sr-only" id="k-front">At a glance</h2>
        <AtAGlance r={r} />
      </section>
      <SafetyAlert n={r.escalations.length} />
      {r.issues.length === 0 && <p className="muted">No issue stood out in these reviews.</p>}
      <div className={`front-grid${r.escalations.length ? "" : " no-esc"}`}>
        {top.length > 0 && (
          <div className="fg-lead">
            <div className="kicker">Fix first</div>
            {card(0)}
          </div>
        )}
        <section className="fg-chart" aria-labelledby="k-numbers">
          <div className="kicker" id="k-numbers">By the numbers</div>
          <MentionBars aspects={r.aspects} featured={featured} period={r.meta.period} />
        </section>
        {r.escalations.length > 0 && (
          <section className="fg-esc front-esc" aria-label="Guest-safety reviews">
            <div className="kicker kicker-alert">Call today</div>
            <Escalations items={r.escalations} />
          </section>
        )}
        {top.length > 1 && (
          <div className="fg-rest">
            <div className="kicker">Then</div>
            <div className="cards">{top.slice(1).map((_, k) => card(k + 1))}</div>
          </div>
        )}
      </div>
      {after}
    </main>
  );
}
