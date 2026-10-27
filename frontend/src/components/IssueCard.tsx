import { useState } from "react";
import type { Hypothesis, Issue, Investigation, Source } from "../types";
import { domain, pct, shortDate } from "../format";
import { Sparkline } from "./Charts";
import { IconChevron, IconExternal } from "./Icons";
import { Collapse } from "./Motion";
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

/** stats.direction (last week vs the week before, computed in code) in plain words. */
const TREND = {
  rising: { arrow: "↑", word: "Rising" },
  steady: { arrow: "→", word: "Flat" },
  easing: { arrow: "↓", word: "Falling" },
} as const;

/** The numbers first: mention count, share of recent reviews, the weekly series, and the direction. */
function Strip({ issue, lead }: { issue: Issue; lead?: boolean }) {
  const s = issue.stats;
  const t = s.direction ? TREND[s.direction] : undefined;
  const w = issue.weekly;
  return (
    <div className="card-strip">
      <div className="stat-pair">
        <div className="stat-big"><b>{s.neg_total}</b><span>negative mentions</span></div>
        <div className="stat-big"><b>{pct(s.recent_neg_rate)}</b><span>of recent reviews</span></div>
      </div>
      {w.length > 0 && (
        <figure className="card-spark">
          <Sparkline weekly={w} onset={s.onset_week} height={lead ? 112 : 64} labelled={lead} title={`Issue ${issue.rank}: ${issue.title}`} />
          {!lead && <figcaption>per week · {shortDate(w[0].week_start)} – {shortDate(w[w.length - 1].week_start)}</figcaption>}
        </figure>
      )}
      {t && (
        <p className={`trend trend-${s.direction}`}>
          <span className="arrow" aria-hidden>{t.arrow}</span> {t.word}
          {s.prev_week_neg !== null && <span className="trend-detail"> · {s.last_week_neg} last week, {s.prev_week_neg} the week before</span>}
        </p>
      )}
    </div>
  );
}

/** One issue at a glance: numbers and trend, its likely cause, one pull-quote and source, and the drafted reply behind a toggle. */
export function IssueCard({ issue, replyText, lead, index = 0 }: { issue: Issue; replyText?: string; lead?: boolean; index?: number }) {
  return (
    <article className={`card${lead ? " card-lead" : ""}`} aria-labelledby={`card-${issue.rank}`} style={{ ["--i" as string]: index }}>
      <header className="card-head">
        <span className="card-n" aria-hidden>{issue.rank}</span>
        <div>
          <span className="chip">{issue.department}</span>
          <h2 className="card-title" id={`card-${issue.rank}`}><span className="sr-only">Issue {issue.rank}: </span>{issue.title}</h2>
        </div>
      </header>
      <CardBody issue={issue} replyText={replyText} lead={lead} />
    </article>
  );
}

/**
 * The same issue as one compact row on a phone: rank, title, negative mentions and the direction.
 * The row is the button of an accordion; the panel is the card body, unchanged.
 */
export function IssueRow({ issue, replyText, lead, open, onToggle }: { issue: Issue; replyText?: string; lead?: boolean; open: boolean; onToggle: () => void }) {
  const s = issue.stats;
  const t = s.direction ? TREND[s.direction] : undefined;
  const panel = `row-panel-${issue.rank}`;
  return (
    <article className={`irow${open ? " open" : ""}`} aria-labelledby={`row-${issue.rank}`}>
      <h2 className="irow-h">
        <button className="irow-btn" id={`row-${issue.rank}`} aria-expanded={open} aria-controls={panel} onClick={onToggle}>
          <span className="irow-n" aria-hidden>{issue.rank}</span>
          <span className="irow-main">
            <span className="irow-title"><span className="sr-only">Issue {issue.rank}: </span>{issue.title}</span>
            <span className="irow-meta">
              <span className="irow-fig"><b>{s.neg_total}</b> negative mentions</span>
              {t && <span className={`irow-trend is-${s.direction}`}><span aria-hidden>{t.arrow}</span> {t.word}</span>}
            </span>
          </span>
          <IconChevron />
        </button>
      </h2>
      <Collapse open={open} id={panel}>
        <div className="irow-panel">
          <span className="chip">{issue.department}</span>
          <CardBody issue={issue} replyText={replyText} lead={lead} />
        </div>
      </Collapse>
    </article>
  );
}

function CardBody({ issue, replyText, lead }: { issue: Issue; replyText?: string; lead?: boolean }) {
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
  const inv = issue.investigation;
  const cause = inv?.hypotheses[0];
  const source = inv && cause ? bestSource(inv, cause) : undefined;
  const [q1, q2] = issue.quotes;
  const causeText = cause ? sentence(cause.hypothesis) : "";
  const canExpand = !!q2 || causeText.length > 90;
  const replyId = `card-reply-${issue.rank}`;
  const moreId = `card-more-${issue.rank}`;
  return (
    <div className="card-body">
      <Strip issue={issue} lead={lead} />
      <div className="card-text" id={moreId}>
        <p className={`card-cause${more ? "" : " clamp"}`}>
          {cause ? <><b>Likely cause:</b> {causeText}</> : "No likely cause was found; see how this was built."}
        </p>
        {q1 && (
          <blockquote className="pull">
            <span className="pull-mark" aria-hidden>“</span>
            {more ? q1.excerpt : shortQuote(q1.excerpt)}”
          </blockquote>
        )}
        {q2 && <Collapse open={more}><blockquote className="pull pull-2">“{q2.excerpt}”</blockquote></Collapse>}
        {canExpand && (
          <button className="read-more" aria-expanded={more} aria-controls={moreId} onClick={() => setMore((v) => !v)}>
            {more ? "Show less" : "Read more"}
          </button>
        )}
        {source && (
          <p className="card-source-line">
            <a className="card-source" href={source.url} target="_blank" rel="noopener noreferrer nofollow">
              <span className="site">{domain(source.url)}</span> · {source.title || domain(source.url)} <IconExternal />
            </a>
          </p>
        )}
        {replyText !== undefined && (
          <>
            <button className="expander" aria-expanded={open} aria-controls={replyId} onClick={() => setOpen((v) => !v)}>
              {open ? "Hide suggested reply" : "See suggested reply"} <IconChevron />
            </button>
            <Collapse open={open} id={replyId}>
              <div className="card-reply">
                <div className="card-draft">{replyText ? withPlaceholders(replyText) : "Draft failed to generate."}</div>
                <p className="card-note">Draft only · nothing is sent. Confirm the highlighted points before sending.</p>
              </div>
            </Collapse>
          </>
        )}
      </div>
    </div>
  );
}
