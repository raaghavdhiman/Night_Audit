import { useState, type ReactNode } from "react";
import type { Investigation as Inv, Source } from "../types";
import { domain, plural, sourceDate } from "../format";
import { IconChevron, IconExternal, IconSearch } from "./Icons";

const KIND_LABEL: Partial<Record<Source["kind"], string>> = { reviews: "guest reviews" };

const excludedWhy = (s: Source) => (s.other_city ? `about ${s.other_city}, not the hotel's city` : s.older ? "older than 12 months" : "");

/** Turn "[3]" / "[3, 5]" (original source ids) in model text into citation links showing display numbers. */
export function withCitations(text: string, prefix: string, byId: Map<number, Source>, onCite: (s: Source) => void): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /\[(\d+(?:\s*,\s*\d+)*)\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    parts.push(text.slice(last, m.index));
    const srcs = m[1].split(",").map((x) => byId.get(parseInt(x.trim(), 10))).filter((s): s is Source => !!s);
    srcs.forEach((s) => parts.push(<CiteLink key={`${m!.index}-${s.id}`} s={s} prefix={prefix} onCite={onCite} />));
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return parts;
}

function CiteLink({ s, prefix, onCite }: { s: Source; prefix: string; onCite: (s: Source) => void }) {
  const why = excludedWhy(s);
  return (
    <a className={`cite${why ? " cite-excluded" : ""}`} href={`#${prefix}-${s.n}`} title={why ? `Not used as evidence: ${why}` : undefined}
      onClick={(e) => { e.preventDefault(); onCite(s); }} aria-label={`source ${s.n}${why ? `, not used as evidence: ${why}` : ""}`}>
      [{s.n}]
    </a>
  );
}

export function Investigation({ inv, rank, id, staleNote }: { inv: Inv; rank: number; id: string; staleNote?: string | null }) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const prefix = `src-${rank}`;
  const byId = new Map(inv.sources.map((s) => [s.id, s]));
  const nCited = inv.cited_source_ids.length;
  const toggle = (n: number) => setOpen((o) => { const x = new Set(o); if (x.has(n)) x.delete(n); else x.add(n); return x; });
  const cite = (s: Source) => {
    setOpen((o) => new Set(o).add(s.n));
    if (!s.cited) setShowAll(true);
    requestAnimationFrame(() => document.getElementById(`${prefix}-${s.n}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };
  // display order (cited 1..k by source type, then the rest) is computed server-side as `n`
  const sources = [...inv.sources].sort((a, b) => a.n - b.n);
  const hasReviewSites = inv.sources.some((s) => s.kind === "reviews");

  return (
    <div className="insert" id={id} role="region" aria-label={`Investigation for issue ${rank}`}>
      {staleNote && <p className="stale-note" role="note">{staleNote}</p>}
      <div className="insert-head">
        <h3>The investigation</h3>
        <span className="mono faint" style={{ fontSize: 11.5 }}>
          Nemotron Ultra · {inv.searches_used}/{inv.max_searches} web searches{inv.mode !== "tool_calling" ? " · fallback mode" : " · tool calling"}
        </span>
      </div>
      {inv.summary && <p className="insert-summary">{withCitations(inv.summary, prefix, byId, cite)}</p>}
      <div className="insert-grid">
        <div>
          <h4>Root-cause hypotheses</h4>
          {inv.hypotheses.length === 0 && <p className="muted">No hypotheses returned.</p>}
          {inv.hypotheses.map((h, i) => (
            <div className="hyp" key={i}>
              <div className="hyp-label">
                <span className="tag tag-hyp">Hypothesis {i + 1}</span>
                <span className={`tag tag-conf${h.confidence_note ? " tag-capped" : ""}`}
                  title={h.confidence_note && h.confidence_model !== h.confidence ? `The agent said ${h.confidence_model}; capped at low` : undefined}>
                  {h.confidence} confidence{h.confidence_note ? ` · ${h.confidence_note}` : ""}
                </span>
                <span className={`tag ${h.type === "external" ? "tag-ext" : "tag-conf"}`}>{h.type}</span>
              </div>
              <div className="h">{h.hypothesis}</div>
              <p>{withCitations(h.reasoning, prefix, byId, cite)}
                {!/\[\d/.test(h.reasoning) && h.evidence_ids.map((i) => byId.get(i)!).sort((a, b) => a.n - b.n).map((s) => (
                  <CiteLink key={s.id} s={s} prefix={prefix} onCite={cite} />
                ))}
              </p>
            </div>
          ))}
        </div>
        <div>
          <h4>What to do this week</h4>
          <ol className="actions">
            {inv.actions.map((a) => (
              <li key={a.priority}>
                <span className="what">{a.action}</span>
                <span className="meta">{a.department} · {a.timeframe}{a.expected_effect ? ` · ${a.expected_effect}` : ""}</span>
              </li>
            ))}
          </ol>
          {inv.guest_messaging && <p className="guest-msg"><strong>Tell guests:</strong> {inv.guest_messaging}</p>}
        </div>
      </div>

      <div className="trail">
        <h4>Evidence trail</h4>
        <ol aria-label="Searches the agent ran">
          {inv.search_trail.map((t, i) => (
            <li key={i}>
              <IconSearch />
              <span className="q">“{t.query}”</span>
              <span className="faint">{t.error ? "failed" : plural(t.results, "result")}</span>
            </li>
          ))}
        </ol>
        {inv.sources.length > 0 && (
          <ul className="sources" aria-label="Sources">
            {sources.filter((s) => showAll || s.cited || nCited === 0).map((s) => {
              const isOpen = open.has(s.n);
              const why = excludedWhy(s);
              return (
                <li key={s.id} id={`${prefix}-${s.n}`}>
                  <button className={`source-row${s.cited ? " cited" : ""}${why ? " excluded" : ""}`} aria-expanded={isOpen}
                    aria-controls={`${prefix}-${s.n}-body`} onClick={() => toggle(s.n)}>
                    <span className="n">[{s.n}]{s.cited && <span className="dot" role="img" aria-label="cited" />}</span>
                    <span className="t">{s.title || domain(s.url)}
                      <span className="d">
                        <span className={`kind kind-${s.kind}`}>{KIND_LABEL[s.kind] ?? s.kind}</span>
                        {domain(s.url)}
                        {s.date && <span title={s.date_from === "url" ? "Date taken from the URL" : "Published date"}> · {sourceDate(s.date)}</span>}
                        {s.older && <> · <span className="flag" title="Older than 12 months: not used as current evidence">older</span></>}
                        {s.other_city && <> · <span className="flag" title="About another city: not used as evidence">other city: {s.other_city}</span></>}
                        {s.cited ? " · cited" : ""}
                      </span>
                    </span>
                    <IconChevron />
                  </button>
                  {isOpen && (
                    <div className="source-body" id={`${prefix}-${s.n}-body`}>
                      <p>{s.snippet}</p>
                      <p className="q">found by: “{s.query}”</p>
                      <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="btn btn-sm">
                        Open source <IconExternal />
                      </a>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {nCited > 0 && inv.sources.length > nCited && (
          <button className="more-sources" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Show cited sources only" : `Show all ${inv.sources.length} searched`}
          </button>
        )}
        <p className="faint" style={{ fontSize: 12, marginTop: 10, fontFamily: "var(--font-ui)" }}>
          Hypotheses are the agent's reasoning over search results, not verified facts. ● marks sources cited above.
          Results older than 12 months or about another city are not used as evidence.
          {hasReviewSites && " Sources tagged guest reviews come from review and booking sites: they corroborate what guests report, but are not an independent outside cause."}
        </p>
      </div>
    </div>
  );
}
