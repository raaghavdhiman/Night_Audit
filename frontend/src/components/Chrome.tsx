import { IconMoon, IconPlay, IconSun } from "./Icons";
import { longDate, plural } from "../format";

export type Mode = "demo" | "live";

export function Masthead({ hotel, city, period, edition, editionNote, mode, setMode, theme, toggleTheme, synthetic, nReviews, onReplay, replaying, canReplay }: {
  hotel: string; city: string; period: string; edition: Date; editionNote?: string; mode: Mode; setMode: (m: Mode) => void;
  theme: "paper" | "night"; toggleTheme: () => void; synthetic: boolean; nReviews: number;
  onReplay?: () => void; replaying?: boolean; canReplay?: boolean;
}) {
  return (
    <header className="masthead">
      <div className="masthead-top">
        <span>The morning briefing for the General Manager</span>
        <span className="mono">{nReviews ? `${plural(nReviews, "review")} reconciled` : "awaiting reviews"}</span>
      </div>
      <hr className="rule-double" />
      <h1 className="masthead-title">Night Audit</h1>
      <p className="masthead-sub">Every guest review, reconciled overnight — the three things to fix this week, and why.</p>
      <hr className="rule" />
      <div className="dateline">
        <span>{hotel}{city ? ` · ${city}` : ""}</span>
        <span title={editionNote}>Edition of {longDate(edition)}</span>
        <span>
          {synthetic ? (
            <span className="badge-synth" title="All demo reviews are synthetic; the hotel is fictional">Synthetic data</span>
          ) : mode === "live" ? (
            <span className="badge-live">Live edition</span>
          ) : null}
          {period ? <span className="mono faint" style={{ fontSize: 11.5, marginLeft: 8 }}>{period}</span> : null}
        </span>
      </div>
      <hr className="rule" />
      <nav className="toolbar" aria-label="Edition controls">
        <div className="seg" role="group" aria-label="Mode">
          <button aria-pressed={mode === "demo"} onClick={() => setMode("demo")}>Demo edition</button>
          <button aria-pressed={mode === "live"} onClick={() => setMode("live")}>Live</button>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {canReplay && (
            <button className="btn btn-sm" onClick={onReplay} disabled={replaying}>
              <IconPlay /> {replaying ? "Replaying the audit…" : "Replay last night's audit"}
            </button>
          )}
          <button className="btn btn-sm btn-ghost" onClick={toggleTheme} aria-label={`Switch to ${theme === "paper" ? "night" : "paper"} theme`}>
            {theme === "paper" ? <IconMoon /> : <IconSun />} {theme === "paper" ? "Night" : "Paper"}
          </button>
        </div>
      </nav>
    </header>
  );
}

const REPO = import.meta.env.VITE_REPO_URL as string | undefined;

export function Footer({ synthetic }: { synthetic: boolean }) {
  return (
    <footer className="footer">
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
    </footer>
  );
}

export function RoutingNotes() {
  return (
    <section style={{ marginTop: 22 }} aria-labelledby="routing-title">
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
