import { useMemo, useState, type ReactNode } from "react";
import type { AuditResult } from "../types";
import { int, pct } from "../format";
import { MentionBars } from "./Charts";
import { IconAlert, IconChevron } from "./Icons";
import { IssueCard, IssueRow } from "./IssueCard";
import { Collapse, CountUp, Reveal, useMedia } from "./Motion";
import { useReplyStore } from "./Replies";
import { Escalations } from "./Sections";

export const replyKey = (r: AuditResult) => `na-replies-v2-${r.meta.hotel}-${r.meta.generated_at}`;

/** Below this width the front page is a short briefing: rows that open one at a time, the numbers behind a toggle. Matches the CSS. */
export const COMPACT = "(max-width: 899.98px)";

/** "A 60-second briefing from 600 guest reviews." Shown under the verdict on a phone. */
export const orientLine = (r: AuditResult) => `A 60-second briefing from ${int(r.meta.n_reviews)} guest reviews.`;

/** "At a glance": four big figures, each read straight from the result. A figure whose field is missing is left out. */
export function AtAGlance({ r, still }: { r: AuditResult; still?: boolean }) {
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
        <div className={`glance-cell g-${f.key}`} key={f.key}>
          <dt>{f.label}</dt>
          <dd>{still ? f.value : <CountUp id={`glance-${r.meta.generated_at}-${f.key}`} text={f.value} />}</dd>
        </div>
      ))}
    </dl>
  );
}

const safetyText = (n: number) => (n === 1 ? "1 guest-safety review needs a call today" : `${n} guest-safety reviews need a call today`);

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
      <span>{safetyText(n)}.</span>
      <span className="safety-go">See {n === 1 ? "it" : "them"} ↓</span>
    </button>
  );
}

/** On a phone the alert is one line that opens the guest-safety reviews in place. */
function SafetyFold({ r }: { r: AuditResult }) {
  const [open, setOpen] = useState(false);
  const n = r.escalations.length;
  if (!n) return null;
  return (
    <div className="safety-fold">
      <button className="safety-alert safety-line" aria-expanded={open} aria-controls="safety-panel" onClick={() => setOpen((v) => !v)}>
        <span className="pulse-dot" aria-hidden />
        <span>{safetyText(n)}</span>
        <span className="safety-chev" aria-hidden>›</span>
      </button>
      <Collapse open={open} id="safety-panel">
        <Escalations items={r.escalations} />
      </Collapse>
    </div>
  );
}

/**
 * The front-page body for a finished edition (the demo on "Sample briefing", a live run on "Run your own"):
 * the figures strip and the safety alert, then the lead story with a rail (mentions chart, guest-safety reviews)
 * and issues 2 and 3 below. On a phone it is a briefing instead: the masthead, verdict and alert fill the
 * first screen, the issues follow as rows, and the figures wait behind "See the numbers".
 * Remount it per result (key by replyKey) so the reply drafts load for that result.
 */
export function FrontBody({ r, head, after }: { r: AuditResult; head: ReactNode; after?: ReactNode }) {
  const store = useReplyStore(replyKey(r));
  const compact = useMedia(COMPACT);
  const top = r.issues.slice(0, 3);
  const featured = useMemo(() => new Map(r.issues.slice(0, 3).map((i) => [i.aspect, i.rank])), [r.issues]);
  const [openRows, setOpenRows] = useState<Set<number>>(() => new Set(top.slice(0, 1).map((i) => i.rank)));
  const [numbers, setNumbers] = useState(false);
  const labelled = !r.meta.synthetic; // live runs name the cause and the guest quote; the demo keeps its wording
  const replyText = (rank: number) => {
    const rep = r.replies.find((x) => x.issue_rank === rank);
    return rep ? store.get(rep).text : undefined;
  };
  const card = (k: number) => {
    const i = top[k];
    return <IssueCard key={i.rank} issue={i} lead={k === 0} index={k} replyText={replyText(i.rank)} labelled={labelled} />;
  };
  const toggleRow = (rank: number) => setOpenRows((s) => {
    const n = new Set(s);
    if (!n.delete(rank)) n.add(rank);
    return n;
  });

  if (compact) {
    return (
      <main id="main" className="front front-compact">
        <div className={`cover${r.escalations.length ? "" : " no-alert"}`}>
          {head}
          <SafetyFold r={r} />
        </div>
        {r.issues.length === 0 && <p className="muted">No issue stood out in these reviews.</p>}
        {top.length > 0 && (
          <section className="irows" aria-labelledby="k-issues">
            <div className="kicker" id="k-issues">{top.length > 1 ? "Fix in this order" : "Fix first"}</div>
            {top.map((i, k) => (
              <Reveal key={i.rank}>
                <IssueRow issue={i} lead={k === 0} replyText={replyText(i.rank)} open={openRows.has(i.rank)} onToggle={() => toggleRow(i.rank)} labelled={labelled} />
              </Reveal>
            ))}
          </section>
        )}
        <Reveal className="numbers">
          <button className="numbers-btn" aria-expanded={numbers} aria-controls="numbers-panel" onClick={() => setNumbers((v) => !v)}>
            {numbers ? "Hide the numbers" : "See the numbers"} <IconChevron />
          </button>
          <Collapse open={numbers} id="numbers-panel">
            <div className="numbers-in">
              <section className="glance-strip" aria-labelledby="k-front">
                <h2 className="sr-only" id="k-front">At a glance</h2>
                <AtAGlance r={r} still />
              </section>
              <MentionBars aspects={r.aspects} featured={featured} period={r.meta.period} />
            </div>
          </Collapse>
        </Reveal>
        {after}
      </main>
    );
  }

  return (
    <>
      {head}
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
    </>
  );
}
