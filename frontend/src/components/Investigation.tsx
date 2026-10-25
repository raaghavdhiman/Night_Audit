import { useState, type ReactNode } from "react";
import type { Investigation as Inv } from "../types";
import { domain, shortDate } from "../format";
import { IconChevron, IconExternal, IconSearch } from "./Icons";

/** Turn "[3]" / "[3, 5]" in model text into superscript citation links. */
export function withCitations(text: string, prefix: string, valid: Set<number>, onCite: (n: number) => void): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /\[(\d+(?:\s*,\s*\d+)*)\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    parts.push(text.slice(last, m.index));
    const nums = m[1].split(",").map((x) => parseInt(x.trim(), 10)).filter((n) => valid.has(n));
    nums.forEach((n) =>
      parts.push(
        <a key={`${m!.index}-${n}`} className="cite" href={`#${prefix}-${n}`} onClick={(e) => { e.preventDefault(); onCite(n); }} aria-label={`source ${n}`}>
          [{n}]
        </a>,
      ),
    );
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return parts;
}

export function Investigation({ inv, rank, id }: { inv: Inv; rank: number; id: string }) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const prefix = `src-${rank}`;
  const valid = new Set(inv.sources.map((s) => s.id));
  const cited = new Set(inv.cited_source_ids);
  const toggle = (n: number) => setOpen((o) => { const x = new Set(o); if (x.has(n)) x.delete(n); else x.add(n); return x; });
  const cite = (n: number) => {
    setOpen((o) => new Set(o).add(n));
    if (!cited.has(n)) setShowAll(true);
    requestAnimationFrame(() => document.getElementById(`${prefix}-${n}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };
  // cited sources first, then the rest of the trail
  const sources = [...inv.sources].sort((a, b) => Number(cited.has(b.id)) - Number(cited.has(a.id)) || a.id - b.id);

  return (
    <div className="insert" id={id} role="region" aria-label={`Investigation for issue ${rank}`}>
      <div className="insert-head">
        <h3>The investigation</h3>
        <span className="mono faint" style={{ fontSize: 11.5 }}>
          Nemotron Ultra · {inv.searches_used}/{inv.max_searches} web searches{inv.mode !== "tool_calling" ? " · fallback mode" : " · tool calling"}
        </span>
      </div>
      {inv.summary && <p className="insert-summary">{withCitations(inv.summary, prefix, valid, cite)}</p>}
      <div className="insert-grid">
        <div>
          <h4>Root-cause hypotheses</h4>
          {inv.hypotheses.length === 0 && <p className="muted">No hypotheses returned.</p>}
          {inv.hypotheses.map((h, i) => (
            <div className="hyp" key={i}>
              <div className="hyp-label">
                <span className="tag tag-hyp">Hypothesis {i + 1}</span>
                <span className="tag tag-conf">{h.confidence} confidence</span>
                <span className={`tag ${h.type === "external" ? "tag-ext" : "tag-conf"}`}>{h.type}</span>
              </div>
              <div className="h">{h.hypothesis}</div>
              <p>{withCitations(h.reasoning, prefix, valid, cite)}
                {h.source_ids.length > 0 && !/\[\d/.test(h.reasoning) && h.source_ids.map((n) => (
                  <a key={n} className="cite" href={`#${prefix}-${n}`} onClick={(e) => { e.preventDefault(); cite(n); }}>[{n}]</a>
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
              <span className="faint">{t.error ? "failed" : `${t.results} results`}</span>
            </li>
          ))}
        </ol>
        {inv.sources.length > 0 && (
          <ul className="sources" aria-label="Sources">
            {sources.filter((s) => showAll || cited.has(s.id) || cited.size === 0).map((s) => {
              const isOpen = open.has(s.id);
              return (
                <li key={s.id} id={`${prefix}-${s.id}`}>
                  <button className={`source-row${cited.has(s.id) ? " cited" : ""}`} aria-expanded={isOpen}
                    aria-controls={`${prefix}-${s.id}-body`} onClick={() => toggle(s.id)}>
                    <span className="n">[{s.id}]</span>
                    <span className="t">{s.title || domain(s.url)}
                      <span className="d">{domain(s.url)}{s.published_date ? ` · ${shortDate(s.published_date.slice(0, 10))}` : ""}{cited.has(s.id) ? " · cited" : ""}</span>
                    </span>
                    <IconChevron />
                  </button>
                  {isOpen && (
                    <div className="source-body" id={`${prefix}-${s.id}-body`}>
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
        {cited.size > 0 && inv.sources.length > cited.size && (
          <button className="more-sources" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Show cited sources only" : `Show ${inv.sources.length - cited.size} other results the agent read`}
          </button>
        )}
        <p className="faint" style={{ fontSize: 12, marginTop: 10, fontFamily: "var(--font-ui)" }}>
          Hypotheses are the agent's reasoning over search results, not verified facts. ● marks sources cited above.
        </p>
      </div>
    </div>
  );
}
