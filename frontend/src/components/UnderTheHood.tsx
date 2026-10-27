import { useState } from "react";
import type { AuditResult, StageName } from "../types";
import { int, modelShort, plural, secs, tokens, usd } from "../format";
import { HBars, SavingsChart } from "./Charts";
import { Colophon, RoutingNotes } from "./Chrome";
import { Folio } from "./Folio";
import { replyKey } from "./FrontPage";
import { Replies, useReplyStore } from "./Replies";
import { LedgerTable } from "./Sections";
import { Story } from "./Story";

const STEPS: { stage: StageName; name: string; what: string }[] = [
  { stage: "extract", name: "Extract", what: "Reads every review and tags each complaint with a topic and a severity." },
  { stage: "trends", name: "Trends", what: "Counts mentions per week in code, then ranks what to fix first." },
  { stage: "investigate", name: "Investigate", what: "Searches the web for likely outside causes of the top issues." },
  { stage: "replies", name: "Replies", what: "Drafts replies to the worst reviews for a person to approve. Nothing is sent." },
];

/** Everything technical behind the front page, for one result. Remount per result (key by replyKey). */
export function UnderTheHood({ r, live, folioNo, onToast }: { r: AuditResult; live: boolean; folioNo: string; onToast: (m: string) => void }) {
  const store = useReplyStore(replyKey(r));
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const toggle = (n: number) => setExpanded((s) => { const x = new Set(s); if (x.has(n)) x.delete(n); else x.add(n); return x; });
  const route = new Map(r.routing.map((x) => [x.stage, x]));
  const by = new Map(r.folio.stages.map((s) => [s.stage, s]));
  const model = (st: StageName) => {
    const x = route.get(st);
    return x ? `${modelShort(x.model)} · ${x.thinking ? "thinking" : "no thinking"}` : "";
  };
  const m = r.meta;
  const provenance: [string, string][] = [
    ["Source", m.synthetic ? "Synthetic reviews (demo)" : "Your uploaded CSV"],
    ["Reviews analysed", int(m.n_reviews)],
    ["Period", m.period],
    ["Reviews that could not be read", int(m.n_extraction_failed)],
    ["Run recorded", new Date(m.generated_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })],
    ["Run time", `${Math.round(m.wall_seconds)}s`],
  ];
  if (m.truncated_to) provenance.push(["Live limit", `only the most recent ${m.truncated_to} reviews were analysed`]);
  if (m.stale_note) provenance.push(["Staleness", m.stale_note]);
  if (m.disclosure) provenance.push(["Disclosure", m.disclosure]);

  return (
    <main id="main" className="hood">
      <section aria-labelledby="k-how">
        <div className="kicker" id="k-how">How it works</div>
        <h2 className="hood-h">Four desks, one model each</h2>
        <ol className="pipeline" aria-label="The pipeline, in order">
          {STEPS.map((s, i) => {
            const x = route.get(s.stage);
            const row = by.get(s.stage);
            return (
              <li key={s.stage} className="station" style={{ ["--i" as string]: i }}>
                <span className="st-node" aria-hidden>{String(i + 1).padStart(2, "0")}</span>
                <h3>{s.name}</h3>
                {x && (
                  <p className="st-model">
                    <span className="st-family">Nemotron</span> {modelShort(x.model)}
                    <span className={`st-think${x.thinking ? " on" : ""}`}>{x.thinking ? "thinking" : "no thinking"}</span>
                  </p>
                )}
                <p className="st-what">{s.what}</p>
                {row && (
                  <dl className="st-stats">
                    <div><dt>calls</dt><dd>{int(row.calls)}</dd></div>
                    <div><dt>tokens</dt><dd>{tokens(row.tokens_in + row.tokens_out)}</dd></div>
                    <div><dt>time</dt><dd>{secs(row.wall_seconds)}</dd></div>
                    <div><dt>cost</dt><dd>{usd(row.cost_usd, 4)}</dd></div>
                  </dl>
                )}
                {s.stage === "investigate" && row?.tool_calls ? (
                  <p className="st-branch">+ Tavily web search · {plural(row.tool_calls, "query", "queries")}</p>
                ) : null}
              </li>
            );
          })}
        </ol>
      </section>

      <section aria-labelledby="k-bill">
        <div className="kicker" id="k-bill">The bill</div>
        <div className="bill">
          <div className="receipt">
            <Folio folio={r.folio} routing={r.routing} baseline={r.baseline} savingsPct={r.savings_pct}
              nReviews={m.n_reviews} hotel={m.hotel} folioNo={folioNo} live={live} />
          </div>
          <div className="bill-side">
            {r.baseline && (
              <figure className="box box-saved">
                <h3 className="box-title">Saved vs. an all-Ultra run</h3>
                {typeof r.savings_pct === "number" && <p className="saved-figure"><b>{Math.round(r.savings_pct)}%</b> saved</p>}
                <SavingsChart run={r.folio.total.cost_usd} runText={usd(r.folio.total.cost_usd, 4)}
                  baseline={r.baseline.extrapolated_cost_usd} baselineText={usd(r.baseline.extrapolated_cost_usd, 2)}
                  baselineNote="thinking on, estimated" />
                <figcaption>Baseline {r.baseline.label}.</figcaption>
              </figure>
            )}
            <figure className="box">
              <h3 className="box-title">Cost per stage</h3>
              <HBars title="Cost per stage" rows={STEPS.filter((s) => by.has(s.stage)).map((s) => {
                const row = by.get(s.stage)!;
                return { label: s.name, note: model(s.stage), value: row.cost_usd, text: usd(row.cost_usd, 4) };
              })} />
              <figcaption>
                {plural(r.folio.total.calls, "model call")} · {r.folio.stages.reduce((a, s) => a + (s.tool_calls ?? 0), 0)} web searches (Tavily credits, not in the total).
              </figcaption>
            </figure>
            <div className="box"><RoutingNotes /></div>
          </div>
        </div>
      </section>

      <section aria-labelledby="issues-title">
        <div className="section-head">
          <h2 id="issues-title">Every issue in full</h2>
          <span className="aside">trends, severity, confidence and sources</span>
        </div>
        {r.issues.map((i) => (
          <Story key={i.rank} issue={i} expanded={expanded.has(i.rank)} onToggle={() => toggle(i.rank)} nReviews={m.n_reviews} staleNote={m.stale_note} />
        ))}
      </section>

      <Replies replies={r.replies} store={store} onToast={onToast} />
      <LedgerTable aspects={r.aspects} issues={r.issues} />

      <section aria-labelledby="prov-title">
        <div className="section-head"><h2 id="prov-title">Where the data came from</h2></div>
        <dl className="provenance">
          {provenance.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
      </section>
      <Colophon synthetic={m.synthetic} />
    </main>
  );
}
