import { useState, type ReactNode } from "react";
import type { AuditResult, ServerConfig } from "../types";
import { int } from "../format";
import { IconChevron } from "./Icons";
import { IssuePreview } from "./IssueCard";
import { Collapse, Reveal } from "./Motion";

const REPO = (import.meta.env.VITE_REPO_URL as string | undefined) || "https://github.com/raaghavdhiman/Night_Audit";

/** "150 reviews", "1,000 KB": the live limits as the server reports them (/api/config). */
function limitsText(config: ServerConfig | null) {
  if (!config) return null;
  const l = config.limits;
  return {
    reviews: `${int(l.max_reviews)} reviews`,
    size: `${int(Math.round(l.max_upload_bytes / 1000))} KB`,
    perIp: l.per_ip_daily_runs,
    global: l.global_daily_runs,
  };
}

/**
 * Every answer here describes what the code does, and nothing more (see the FAQ notes in the PR).
 * Limits are read from the server's config, so they stay true when the deployment changes them.
 */
function faqs(config: ServerConfig | null): { q: string; a: ReactNode }[] {
  const L = limitsText(config);
  return [
    {
      q: "What is Night Audit?",
      a: <p>A briefing for hotel managers. It reads a batch of guest reviews, finds the issues that matter most this week (up to three) with their likely causes, and drafts replies to the guests involved.</p>,
    },
    {
      q: "What do I need to upload?",
      a: (
        <p>
          A CSV file with one review per row. It needs a column of review text; a date, a rating and a title are used when present.
          {L ? ` Between 10 and ${L.reviews} per upload (the most recent are kept when there are more), in a file up to ${L.size}.` : " At least 10 reviews; the upper limit is shown on Run your own."}
        </p>
      ),
    },
    {
      q: "Does it send replies to guests?",
      a: <p>No. Replies are drafts for you to edit and approve on this page; nothing in Night Audit sends anything to guests.</p>,
    },
    {
      q: "How accurate are the causes?",
      a: (
        <p>
          They are hypotheses with evidence, not findings. The counts and weekly trends are computed in code; the models interpret them,
          search the web for causes and draft. Causes cite the web sources they rest on, and a cause is marked low confidence when every source it cites is old or from another city.
        </p>
      ),
    },
    {
      q: "What happens to my reviews?",
      a: (
        <>
          <p>Night Audit's code reads your file in memory and does not save it. Specifically:</p>
          <ul className="faq-list">
            <li>To analyse them, the review text goes to NVIDIA Nemotron models on Nebius Token Factory: every review and its title, then short quotes for the trend and cause steps, and the full text of the reviews chosen for draft replies. Your hotel name and city go too.</li>
            <li>Tavily receives only web-search queries, at most 4 per issue. A model writes them and is asked to include your city; it can see your hotel name and guest quotes, and nothing in the code stops either from appearing in a query.</li>
            <li>The finished briefing, including your reviews, is streamed back to your browser; the server does not save it. Reply drafts you edit are kept in your browser's local storage.</li>
            <li>The server keeps a cache of search queries and their results (reused for 7 days), a daily run count per visitor stored under a hashed IP address, and a running spend total. Its own log lines record a failed run's error and that total; the web server's standard access log records each request's address and path.</li>
            <li>While receiving an upload larger than about 1 MB, the web framework may buffer it in a temporary file before the size check rejects it.</li>
          </ul>
          <p>What Nebius and Tavily keep is governed by their own terms.</p>
        </>
      ),
    },
    {
      q: "Is the demo real?",
      a: <p>The reviews are synthetic, written for a fictional hotel. The city and the web sources it cites are real.</p>,
    },
    {
      q: "What are the limits?",
      a: L ? (
        <p>
          Live mode is capped: {L.perIp} runs per visitor per day, {L.global} runs a day in total and up to {L.reviews} per upload.
          A shared spending cap covers the whole demo; once it is reached, live mode switches off. The sample briefing is always available.
        </p>
      ) : (
        <p>Live mode is capped by runs per visitor, runs per day, reviews per upload and a shared spending cap; the current limits are shown on Run your own. The sample briefing is always available.</p>
      ),
    },
    {
      q: "What is it built with?",
      a: <p>NVIDIA Nemotron models on Nebius Token Factory, plus Tavily for web search; <a href="#/under-the-hood">Under the hood</a> shows which model does what.</p>,
    },
  ];
}

function Faq({ config }: { config: ServerConfig | null }) {
  const [open, setOpen] = useState<Set<number>>(() => new Set());
  const toggle = (i: number) => setOpen((s) => {
    const n = new Set(s);
    if (!n.delete(i)) n.add(i);
    return n;
  });
  return (
    <div className="faq">
      {faqs(config).map((f, i) => (
        <div className="faq-item" key={f.q}>
          <h3 className="faq-q">
            <button id={`faq-${i}`} aria-expanded={open.has(i)} aria-controls={`faq-a-${i}`} onClick={() => toggle(i)}>
              <span>{f.q}</span> <IconChevron />
            </button>
          </h3>
          <Collapse open={open.has(i)} id={`faq-a-${i}`}>
            <div className="faq-a" role="region" aria-labelledby={`faq-${i}`}>{f.a}</div>
          </Collapse>
        </div>
      ))}
    </div>
  );
}

const STEPS = [
  { t: "Reads every review", d: "Each review is read and tagged with what the guest liked and what went wrong." },
  { t: "Finds what keeps coming up, and why", d: "Complaints are counted week by week, the issues that matter most are picked, and the web is searched for a likely cause." },
  { t: "Drafts replies for you to approve", d: "Replies to the most critical reviews, at least one per issue, are drafted for you to edit and approve. Nothing is sent." },
];

/** The front door: what Night Audit is, how it works, one issue from the sample briefing, and plain answers. */
export function Landing({ demo, config }: { demo: AuditResult | null; config: ServerConfig | null }) {
  const lead = demo?.issues[0];
  return (
    <>
      <header className="hero">
        <h1 className="masthead-title hero-title">Night Audit</h1>
        <hr className="rule-double hero-rule" />
        <p className="hero-promise">Guest reviews, read overnight. The three things to fix, on your desk by morning.</p>
        <div className="hero-actions">
          <a className="btn btn-primary btn-lg" href="#/issues">See a sample briefing</a>
          <a className="btn btn-lg" href="#/live">Run it on your reviews</a>
        </div>
        <p className="hero-note">Demo uses synthetic data for a fictional hotel.</p>
      </header>
      <main id="main" className="landing" tabIndex={-1}>
        <Reveal>
          <section className="l-section" aria-labelledby="l-what">
            <div className="kicker">What it does</div>
            <h2 className="l-h" id="l-what">Three steps, done for you</h2>
            <ol className="l-steps">
              {STEPS.map((s, i) => (
                <li key={s.t}>
                  <span className="l-step-n" aria-hidden>{i + 1}</span>
                  <div>
                    <h3>{s.t}</h3>
                    <p>{s.d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </Reveal>
        <Reveal>
          <section className="l-section" aria-labelledby="l-get">
            <div className="kicker">What you get</div>
            <h2 className="l-h" id="l-get">Each issue, at a glance</h2>
            <figure className="l-preview">
              {lead ? <IssuePreview issue={lead} /> : <div className="skeleton sk-line" style={{ width: "70%", margin: "18px 0" }} />}
              <figcaption>From the sample briefing · <a href="#/issues">Read it in full</a></figcaption>
            </figure>
          </section>
        </Reveal>
        <Reveal>
          <section className="l-section" aria-labelledby="l-faq">
            <div className="kicker">Questions</div>
            <h2 className="l-h" id="l-faq">Plain answers</h2>
            <Faq config={config} />
          </section>
        </Reveal>
      </main>
      <footer className="footer l-footer">
        <p className="disclosure">Root causes are hypotheses, not findings.</p>
        <p className="l-credits">
          <span>Built for the Nebius × NVIDIA Global AI Hackathon</span>
          <span>Built with NVIDIA Nemotron on Nebius</span>
        </p>
        <p className="l-links">
          <a className="footer-link" href={REPO} target="_blank" rel="noopener noreferrer">GitHub</a>
          <a className="footer-link" href={`${REPO}/blob/main/LICENSE`} target="_blank" rel="noopener noreferrer">MIT licence</a>
        </p>
      </footer>
    </>
  );
}
