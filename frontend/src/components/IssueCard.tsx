import { useState } from "react";
import type { Hypothesis, Issue, Investigation, Source } from "../types";
import { domain } from "../format";
import { IconChevron, IconExternal } from "./Icons";
import { withPlaceholders } from "./Replies";

/** Cut a guest excerpt at a sentence end (or a word) near `max` characters. */
function shortQuote(text: string, max = 150) {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (end > max * 0.6) return cut.slice(0, end + 1); // an early sentence end would drop the substance
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[\s,;:—–-]+$/, "")}…`;
}

/** The hypothesis as one sentence: citation markers removed, a full stop at the end. */
const sentence = (h: string) => {
  const t = h.replace(/\s*\[\d+(?:\s*,\s*\d+)*\]/g, "").trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
};

/** The best web source behind this hypothesis: lowest display number among its usable evidence, review sites last resort. */
function bestSource(inv: Investigation, h: Hypothesis): Source | undefined {
  const byId = new Map(inv.sources.map((s) => [s.id, s]));
  const pick = (ids: number[]) => ids.map((i) => byId.get(i)).filter((s): s is Source => !!s && s.kind !== "reviews").sort((a, b) => a.n - b.n)[0];
  return pick(h.evidence_ids) ?? pick(inv.cited_source_ids);
}

/** One issue at a glance: what it is, its likely cause, the evidence, and the drafted reply behind a toggle. */
export function IssueCard({ issue, replyText }: { issue: Issue; replyText?: string }) {
  const [open, setOpen] = useState(false);
  const inv = issue.investigation;
  const cause = inv?.hypotheses[0];
  const source = inv && cause ? bestSource(inv, cause) : undefined;
  const quotes = issue.quotes.slice(0, 2);
  const replyId = `card-reply-${issue.rank}`;
  return (
    <article className="card" aria-labelledby={`card-${issue.rank}`}>
      <h2 className="card-title" id={`card-${issue.rank}`}>
        <span className="card-n" aria-hidden>{issue.rank}</span>
        <span>{issue.title}</span>
      </h2>
      <p className="card-cause">
        {cause ? <><b>Likely cause:</b> {sentence(cause.hypothesis)}</> : "No likely cause was found; see how this was built."}
      </p>
      {(quotes.length > 0 || source) && (
        <div className="card-evidence">
          {quotes.map((q) => <blockquote key={q.review_id}>“{shortQuote(q.excerpt)}”</blockquote>)}
          {source && (
            <a className="card-source" href={source.url} target="_blank" rel="noopener noreferrer nofollow">
              <span className="site">{domain(source.url)}</span> · {source.title || domain(source.url)} <IconExternal />
            </a>
          )}
        </div>
      )}
      {replyText !== undefined && (
        <>
          <button className="expander" aria-expanded={open} aria-controls={replyId} onClick={() => setOpen((v) => !v)}>
            {open ? "Hide suggested reply" : "See suggested reply"} <IconChevron />
          </button>
          {open && (
            <div className="card-reply" id={replyId}>
              <div className="card-draft">{replyText ? withPlaceholders(replyText) : "Draft failed to generate."}</div>
              <p className="card-note">Draft only · nothing is sent. Confirm the highlighted points before sending.</p>
            </div>
          )}
        </>
      )}
    </article>
  );
}
