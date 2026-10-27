import { IconMoon, IconSun } from "./Icons";
import { longDate } from "../format";

export type Route = "landing" | "issues" | "live" | "hood";

/** `short` is the label in the phone's bottom bar. */
export const ROUTES: { route: Route; hash: string; label: string; short: string }[] = [
  { route: "landing", hash: "#/", label: "Home", short: "Home" },
  { route: "issues", hash: "#/issues", label: "Sample briefing", short: "Briefing" },
  { route: "live", hash: "#/live", label: "Run your own", short: "Run it" },
  { route: "hood", hash: "#/under-the-hood", label: "Under the hood", short: "Under the hood" },
];

/**
 * Slim sticky bar on every page: wordmark, the four numbered section tabs (the current one filled), then the theme.
 * On a phone the tabs leave the bar for a fixed bar at the foot of the screen; the DOM order, and so the keyboard
 * order, stays wordmark, tabs, theme.
 */
export function Nav({ route, theme, toggleTheme }: { route: Route; theme: "paper" | "night"; toggleTheme: () => void }) {
  return (
    <nav className="topnav" aria-label="Pages">
      <div className="topnav-in">
        <a href="#/" className="wordmark">Night Audit</a>
        <div className="tabs">
          {ROUTES.map((t, i) => (
            <a key={t.route} href={t.hash} className="nav-btn tab" aria-current={route === t.route ? "page" : undefined}>
              <span className="nb-n" aria-hidden>{String(i + 1).padStart(2, "0")}</span>
              <span className="nb-l nb-long">{t.label}</span>
              <span className="nb-l nb-short">{t.short}</span>
              {route === t.route && <span className="nb-mark" aria-hidden />}
            </a>
          ))}
        </div>
        <span className="nav-sep" aria-hidden />
        <button className="nav-btn theme-btn" onClick={toggleTheme} aria-label={`Switch to ${theme === "paper" ? "night" : "paper"} theme`}>
          {theme === "paper" ? <IconMoon /> : <IconSun />}
          <span className="nb-l">{theme === "paper" ? "Night" : "Paper"}</span>
        </button>
      </div>
    </nav>
  );
}

export function Masthead({ title, city, edition, editionNote, live, synthetic, summary, orient, staleNote }: {
  title: string; city: string; edition: Date; editionNote?: string; live: boolean; synthetic: boolean;
  summary?: string | null; orient?: string | null; staleNote?: string | null;
}) {
  return (
    <header className="masthead">
      <h1 className="masthead-title">{title}</h1>
      {summary && <p className="masthead-sub">{summary}</p>}
      {summary && orient && <p className="masthead-orient">{orient}</p>}
      <hr className="rule-double" />
      <div className="dateline">
        <span className="dl-ed"><span className="badge-ed">{live ? "Live edition" : "Demo edition"}</span></span>
        <span className="dl-date" title={editionNote}>{longDate(edition)}</span>
        <span className="dl-city">
          {city}
          {synthetic && <span className="badge-synth" title="All demo reviews are synthetic; the hotel is fictional">Synthetic data</span>}
        </span>
      </div>
      <hr className="rule" />
      {staleNote && <p className="stale-line" role="note">{staleNote}</p>}
    </header>
  );
}

const REPO = import.meta.env.VITE_REPO_URL as string | undefined;

/** The honesty line and one plain link onward (to "Under the hood", or back to the front page from there). */
export function Footer({ synthetic, link }: { synthetic: boolean; link: "hood" | "issues" }) {
  return (
    <footer className="footer">
      <div className="footer-line">
        <p className="disclosure">
          {synthetic
            ? "Demo edition: every review is synthetic and the hotel is fictional; the city and the web sources are real. "
            : "Live edition: computed from the reviews you uploaded. "}
          Root causes are hypotheses, not findings.
        </p>
        {link === "hood" ? <a className="footer-link" href="#/under-the-hood">Under the hood</a> : <a className="footer-link" href="#/issues">Sample briefing</a>}
      </div>
    </footer>
  );
}

export function Colophon({ synthetic }: { synthetic: boolean }) {
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
          <p className="mono">
            Nebius × NVIDIA Global AI Hackathon · Best Apps &amp; Agents
          </p>
          <p>
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
      <ul className="limits limits-routing">
        <li><span>Extract → Super, no thinking</span><span>neg-issue F1 0.80 · $0.40/1k</span></li>
        <li><span>Lightning, no thinking</span><span>F1 0.75 · $0.09/1k</span></li>
        <li><span>Lightning, thinking</span><span>F1 0.89 · 66 s/review</span></li>
        <li><span>Trends → Super, thinking</span><span>3/3 planted issues</span></li>
        <li><span>Investigate → Ultra + Tavily</span><span>≤4 searches/issue</span></li>
        <li><span>Replies → Lightning</span><span>short drafts, cheap</span></li>
      </ul>
      <p className="routing-note">
        F1 vs. an Ultra-with-thinking reference on 100 real reviews; see results/eval_summary.md in the repo.
      </p>
    </section>
  );
}
