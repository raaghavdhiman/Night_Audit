import { useState, type ReactNode } from "react";
import { IconChevron, IconMoon, IconSun } from "./Icons";
import { longDate } from "../format";

export type Mode = "demo" | "live";

export function Masthead({ hotel, city, edition, editionNote, mode, setMode, theme, toggleTheme, synthetic, summary, staleNote }: {
  hotel: string; city: string; edition: Date; editionNote?: string; mode: Mode; setMode: (m: Mode) => void;
  theme: "paper" | "night"; toggleTheme: () => void; synthetic: boolean; summary?: string | null; staleNote?: string | null;
}) {
  return (
    <header className="masthead">
      <nav className="toolbar" aria-label="Edition controls">
        <span className="wordmark">Night Audit</span>
        <div className="toolbar-controls">
          <div className="seg" role="group" aria-label="Mode">
            <button aria-pressed={mode === "demo"} onClick={() => setMode("demo")}>Demo edition</button>
            <button aria-pressed={mode === "live"} onClick={() => setMode("live")}>Live</button>
          </div>
          <button className="btn btn-sm btn-ghost" onClick={toggleTheme} aria-label={`Switch to ${theme === "paper" ? "night" : "paper"} theme`}>
            {theme === "paper" ? <IconMoon /> : <IconSun />} {theme === "paper" ? "Night" : "Paper"}
          </button>
        </div>
      </nav>
      <hr className="rule-double" />
      <h1 className="masthead-title">{hotel}</h1>
      <p className="dateline">
        <span title={editionNote}>{longDate(edition)}</span>
        {city ? <span> · {city}</span> : null}
        {synthetic ? (
          <span className="badge-synth" title="All demo reviews are synthetic; the hotel is fictional">Synthetic data</span>
        ) : mode === "live" ? (
          <span className="badge-live">Live edition</span>
        ) : null}
      </p>
      {summary && <p className="masthead-sub">{summary}</p>}
      {staleNote && <p className="stale-line" role="note">{staleNote}</p>}
    </header>
  );
}

const REPO = import.meta.env.VITE_REPO_URL as string | undefined;

/** The honesty line, then "How this was built": everything behind the three cards opens below it. */
export function Footer({ synthetic, children }: { synthetic: boolean; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <footer className="footer">
      <div className="footer-line">
        <p className="disclosure">
          {synthetic
            ? "Demo edition: every review is synthetic and the hotel is fictional; the city and the web sources are real. "
            : "Live edition: computed from the reviews you uploaded. "}
          Root causes are hypotheses, not findings.
        </p>
        <button className="how-toggle" aria-expanded={open} aria-controls="how" onClick={() => setOpen((v) => !v)}>
          How this was built <IconChevron />
        </button>
      </div>
      {open && (
        <div className="how" id="how" role="region" aria-label="How this was built">
          {children}
          <Colophon synthetic={synthetic} />
        </div>
      )}
    </footer>
  );
}

function Colophon({ synthetic }: { synthetic: boolean }) {
  return (
    <section aria-labelledby="colophon-title">
      <div className="section-head"><h2 id="colophon-title">Method and licenses</h2></div>
      <div className="colophon">
        <div>
          <p className="disclosure">
            {synthetic
              ? "Demo edition: every review of Hotel Wrenfield is synthetic, written by Nemotron Lightning from a planted scenario. The hotel is fictional; the city and the web sources are real."
              : "Live edition: computed from the reviews you uploaded. Root causes are hypotheses, not findings."}
          </p>
          <p>
            Built with NVIDIA Nemotron (Lightning, Super, Ultra) on Nebius Token Factory, and Tavily for runtime web search.
            Counts are computed in code; models interpret, investigate and draft. Replies are drafts for a human to approve — nothing is sent.
          </p>
        </div>
        <div>
          <p className="mono" style={{ fontSize: 12 }}>
            Nebius × NVIDIA Global AI Hackathon · Best Apps &amp; Agents
          </p>
          <p style={{ fontSize: 12.5 }}>
            Model evaluation used Datafiniti hotel reviews (CC BY-NC-SA 4.0) locally; that data is not redistributed or shown here.
          </p>
          {REPO && <p><a href={REPO} target="_blank" rel="noopener noreferrer">Source code (MIT)</a></p>}
        </div>
      </div>
    </section>
  );
}

export function RoutingNotes() {
  return (
    <section aria-labelledby="routing-title">
      <div className="kicker" id="routing-title">Why each desk gets its model</div>
      <ul className="limits" style={{ fontSize: 11.5 }}>
        <li><span>Extract → Super, no thinking</span><span>neg-issue F1 0.80 · $0.40/1k</span></li>
        <li><span>Lightning, no thinking</span><span>F1 0.75 · $0.09/1k</span></li>
        <li><span>Lightning, thinking</span><span>F1 0.89 · 66 s/review</span></li>
        <li><span>Trends → Super, thinking</span><span>3/3 planted issues</span></li>
        <li><span>Investigate → Ultra + Tavily</span><span>≤4 searches/issue</span></li>
        <li><span>Replies → Lightning</span><span>short drafts, cheap</span></li>
      </ul>
      <p className="faint" style={{ fontSize: 11.5, marginTop: 6 }}>
        F1 vs. an Ultra-with-thinking reference on 100 real reviews; see results/eval_summary.md in the repo.
      </p>
    </section>
  );
}
