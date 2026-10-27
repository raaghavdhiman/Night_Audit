import { useState } from "react";
import type { AuditResult } from "../types";
import { plural } from "../format";
import { RoutingNotes } from "./Chrome";
import { Folio } from "./Folio";
import { IconPlay } from "./Icons";
import { Replies, type ReplyStore } from "./Replies";
import { Escalations, LedgerTable } from "./Sections";
import { Story } from "./Story";

/** Everything behind the three cards: the cost ledger, every issue in full, all replies, the counts. */
export function BuildDetails({ r, live, folioNo, store, onToast, onReplay }: {
  r: AuditResult; live: boolean; folioNo: string; store: ReplyStore; onToast: (m: string) => void; onReplay?: () => void;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const toggle = (n: number) => setExpanded((s) => { const x = new Set(s); if (x.has(n)) x.delete(n); else x.add(n); return x; });
  const staleNote = r.meta.stale_note;
  return (
    <>
      <p className="how-intro">
        The morning briefing for the General Manager: every guest review, reconciled overnight — the three things to fix this week, and why.
      </p>
      <p className="mono faint how-meta">
        {plural(r.meta.n_reviews, "review")} reconciled{r.meta.period ? ` · ${r.meta.period}` : ""}
        {r.meta.truncated_to ? ` · only the most recent ${r.meta.truncated_to} reviews were analysed (live limit)` : ""}
      </p>
      {onReplay && (
        <p><button className="btn btn-sm" onClick={onReplay}><IconPlay /> Replay last night's audit</button></p>
      )}

      <section aria-labelledby="cost-title">
        <div className="section-head">
          <h2 id="cost-title">What it cost, and which model did what</h2>
          <span className="aside">list prices, measured per call</span>
        </div>
        <div className="how-cost">
          <Folio folio={r.folio} routing={r.routing} baseline={r.baseline} savingsPct={r.savings_pct}
            nReviews={r.meta.n_reviews} hotel={r.meta.hotel} folioNo={folioNo} live={live} />
          <RoutingNotes />
        </div>
      </section>

      <section aria-labelledby="issues-title">
        <div className="section-head">
          <h2 id="issues-title">Every issue in full</h2>
          <span className="aside">trends, severity, confidence and sources</span>
        </div>
        <Escalations items={r.escalations} />
        {r.issues.map((i) => (
          <Story key={i.rank} issue={i} expanded={expanded.has(i.rank)} onToggle={() => toggle(i.rank)} nReviews={r.meta.n_reviews} staleNote={staleNote} />
        ))}
      </section>

      <Replies replies={r.replies} store={store} onToast={onToast} />
      <LedgerTable aspects={r.aspects} issues={r.issues} />
    </>
  );
}
