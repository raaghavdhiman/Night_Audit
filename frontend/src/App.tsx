import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { analyze, ApiError, getConfig, getDemo } from "./api";
import type { AuditResult, PipelineEvent, ServerConfig } from "./types";
import { initialRun, reduce, type RunState } from "./run";
import { Footer, Masthead, Nav, RoutingNotes, type Route } from "./components/Chrome";
import { Folio } from "./components/Folio";
import { FrontBody, orientLine, replyKey } from "./components/FrontPage";
import { Reconciliation } from "./components/Reconciliation";
import { UnderTheHood } from "./components/UnderTheHood";
import { LivePanel } from "./components/LivePanel";
import { Landing } from "./components/Landing";
import { IconAlert, IconPlay } from "./components/Icons";
import { plural } from "./format";
import { useTween } from "./tween";

type Theme = "paper" | "night";

function initialTheme(): Theme {
  try {
    const t = localStorage.getItem("na-theme");
    if (t === "paper" || t === "night") return t;
  } catch {
    /* ignore */
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "night" : "paper";
}

const HASH: Record<string, Route> = { "#/": "landing", "#/issues": "issues", "#/live": "live", "#/under-the-hood": "hood" };

/** The page for the current hash. "#live" (old links) becomes "#/live"; anything unknown falls back to "#/", the landing page. */
function readRoute(): Route {
  const h = location.hash || "#/";
  if (HASH[h]) return HASH[h];
  const fallback = h === "#live" ? "#/live" : "#/";
  history.replaceState(null, "", fallback);
  return HASH[fallback];
}

type RunAction = { type: "reset" } | { type: "event"; e: PipelineEvent };
const runReducer = (s: RunState, a: RunAction) => (a.type === "reset" ? initialRun() : reduce(s, a.e));

function editionDate(r: AuditResult | null): Date {
  if (r?.meta.synthetic && r.weeks.length) {
    const last = new Date(r.weeks[r.weeks.length - 1].week_start + "T12:00:00");
    last.setDate(last.getDate() + 7); // the Monday after the last week closed
    return last;
  }
  return new Date();
}

function editionNote(r: AuditResult | null): string | undefined {
  if (!r?.meta.synthetic) return undefined;
  const ran = new Date(r.meta.generated_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  return `A recorded run (${ran}). The demo keeps the date of the morning after its last week of reviews.`;
}

const folioNumber = (r: AuditResult | null) => `${r?.meta.generated_at?.slice(0, 10).replace(/-/g, "") ?? "pending"}-${r?.meta.n_reviews ?? 0}`;

function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Setting the type">
      <div className="skeleton sk-line" style={{ width: 160 }} />
      <div className="skeleton sk-head" />
      <div className="skeleton sk-head" style={{ width: "55%" }} />
      {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton sk-line" style={{ width: `${92 - i * 7}%` }} />)}
      <p className="sk-note">Setting the type…</p>
    </div>
  );
}

/** "3 things to fix this week, from 600 reviews." */
function summaryLine(r: AuditResult): string {
  const k = Math.min(3, r.issues.length);
  const things = k === 0 ? "Nothing stood out to fix this week" : `${k === 1 ? "1 thing" : `${k} things`} to fix this week`;
  return `${things}, from ${r.meta.truncated_to ? "the latest " : ""}${plural(r.meta.n_reviews, "review")}.`;
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [route, setRoute] = useState<Route>(readRoute);
  const [hoodLive, setHoodLive] = useState(false); // "Under the hood" shows the live run once there is one
  const [replayDone, setReplayDone] = useState(false);
  const [demo, setDemo] = useState<AuditResult | null>(null);
  const [demoErr, setDemoErr] = useState<string | null>(null);
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [live, setLive] = useState<AuditResult | null>(null);
  const [liveErr, setLiveErr] = useState<{ message: string; code: string } | null>(null);
  const [run, dispatch] = useReducer(runReducer, undefined, initialRun);
  const [replaying, setReplaying] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("na-theme", theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const loadDemo = useCallback(() => {
    setDemoErr(null);
    getDemo().then(setDemo).catch((e) => setDemoErr(e instanceof Error ? e.message : "Could not load the demo edition."));
  }, []);
  const refreshConfig = useCallback(() => {
    getConfig().then(setConfig).catch(() => setConfig(null));
  }, []);
  useEffect(() => {
    loadDemo();
    refreshConfig();
  }, [loadDemo, refreshConfig]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const stopReplay = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setReplaying(false);
  };

  useEffect(() => {
    const onHash = () => {
      const r = readRoute();
      setRoute(r);
      window.scrollTo(0, 0);
      if (r === "live") refreshConfig();
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [refreshConfig]);

  /** Replay the recorded event stream of the demo run, compressed to ~16 s. */
  const replay = () => {
    if (!demo?.replay?.length) return;
    stopReplay();
    dispatch({ type: "reset" });
    setReplaying(true);
    setReplayDone(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
    const evs = demo.replay;
    const total = evs[evs.length - 1].t || 1;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const scale = reduceMotion ? 0 : Math.min(1, 16 / total);
    evs.forEach((e) => {
      timers.current.push(window.setTimeout(() => dispatch({ type: "event", e }), (e.t || 0) * scale * 1000));
    });
    timers.current.push(window.setTimeout(() => { dispatch({ type: "event", e: { type: "result" } }); setReplaying(false); setReplayDone(true); }, total * scale * 1000 + 700));
  };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const startLive = async (file: File, hotel: string, city: string) => {
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    stopReplay();
    setReplayDone(false);
    setHoodLive(true);
    setLive(null);
    setLiveErr(null);
    dispatch({ type: "reset" });
    dispatch({ type: "event", e: { type: "accepted", n_reviews: 0 } });
    window.scrollTo({ top: 0, behavior: "smooth" });
    try {
      await analyze(file, hotel, city, (e) => {
        if (e.type === "result") setLive(e.result as AuditResult);
        if (e.type === "error") setLiveErr({ message: (e.message as string) || "The analysis failed.", code: (e.error as string) || "error" });
        dispatch({ type: "event", e });
      }, ctl.signal);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      const e = err instanceof ApiError ? err : new ApiError("Could not reach the server. Check your connection and try again.", "network", 0);
      setLiveErr({ message: e.message, code: e.code });
      dispatch({ type: "event", e: { type: "error", message: e.message, error: e.code } });
    } finally {
      refreshConfig();
    }
  };

  const running = run.status === "running";
  const inProgress = replaying || running;
  // one running total for the reconciliation header and the folio beside it
  const runActive = inProgress || (!live && !!run.folio);
  const runCost = useTween(Math.max(run.folio?.total.cost_usd ?? 0, run.liveCost));
  const notice = (title: string, msg: string, action: React.ReactNode) => (
    <section className="notice" role="alert">
      <IconAlert className="glyph" />
      <div>
        <h3>{title}</h3>
        <p>{msg}</p>
        {action}
      </div>
    </section>
  );

  let page: React.ReactNode;
  if (route === "landing") {
    page = <Landing demo={demo} config={config} />;
  } else if (route === "issues") {
    const mast = (
      <Masthead title={demo?.meta.hotel ?? "Hotel Wrenfield"} city={demo?.meta.city ?? "Austin, Texas"} edition={editionDate(demo)} editionNote={editionNote(demo)}
        live={false} synthetic summary={demo ? summaryLine(demo) : null} orient={demo ? orientLine(demo) : null} staleNote={demo?.meta.stale_note} />
    );
    page = (
      <>
        {demoErr ? <>{mast}<main id="main">{notice("The demo edition didn't arrive.", demoErr, <button className="btn" onClick={loadDemo}>Try again</button>)}</main></>
          : demo ? <FrontBody key={replyKey(demo)} r={demo} head={mast} />
          : <>{mast}<main id="main"><Skeleton /></main></>}
        <Footer synthetic link="hood" />
      </>
    );
  } else if (route === "live") {
    // a replay shows the demo run's progress; everything else here is the visitor's own run
    const shownHere = replaying ? demo : live;
    const showSide = inProgress || (!!liveErr && !!run.folio);
    let body: React.ReactNode;
    if (replaying) body = <><Reconciliation run={run} cost={runCost} replay title="Replaying last night's audit" /><div style={{ marginTop: 18 }}><Skeleton /></div></>;
    else if (running) body = <><Reconciliation run={run} cost={runCost} /><div style={{ marginTop: 18 }}><Skeleton /></div></>;
    else if (liveErr) {
      const limited = ["ip_limit", "global_limit", "busy", "spend_cap", "BudgetExceeded"].includes(liveErr.code);
      body = (
        <>
          {notice(limited ? "The night desk is closed to new audits." : "The audit couldn't be completed.", liveErr.message, (
            <div className="notice-actions">
              <a className="btn btn-primary" href="#/issues">Read the demo edition</a>
              {!limited && <button className="btn" onClick={() => { setLiveErr(null); dispatch({ type: "reset" }); }}>Try another file</button>}
            </div>
          ))}
          {run.folio && <Reconciliation run={run} cost={runCost} title="Audit stopped" />}
        </>
      );
    } else if (!live) {
      body = (
        <>
          {replayDone && <p className="replay-done">Replay finished. <a href="#/issues">Read the result in the sample briefing</a>.</p>}
          <LivePanel config={config} onStart={startLive} onDemo={() => { location.hash = "#/issues"; }} />
          {!!demo?.replay?.length && (
            <p className="replay-link"><button className="linkish" onClick={replay}><IconPlay /> Replay the demo run</button></p>
          )}
        </>
      );
    }
    const mast = (
      <Masthead title={shownHere?.meta.hotel ?? "Your hotel"} city={shownHere?.meta.city ?? ""} edition={editionDate(shownHere)} editionNote={editionNote(shownHere)}
        live={!replaying} synthetic={replaying} summary={live && !inProgress ? summaryLine(live) : null} orient={live ? orientLine(live) : null}
        staleNote={!inProgress ? live?.meta.stale_note : null} />
    );
    page = (
      <>
        {live && !inProgress && !liveErr ? (
          <FrontBody key={replyKey(live)} r={live} head={mast} after={
            <p className="brief-after"><button className="btn" onClick={() => { setLive(null); dispatch({ type: "reset" }); }}>Run another audit</button></p>
          } />
        ) : (
          <>{mast}
          <div className="sheet" style={showSide ? undefined : { gridTemplateColumns: "1fr" }}>
            <main id="main" className="col-main">{body}</main>
            {showSide && (
              <aside className="col-side" aria-label="Running cost of this audit">
                <div className="side-sticky" style={{ position: "sticky", top: 64 }}>
                  <Folio folio={run.folio} routing={(replaying ? demo?.routing : null) ?? config?.routing ?? demo?.routing ?? []}
                    stages={inProgress ? run.stages : undefined} baseline={null} nReviews={run.n_reviews}
                    hotel={shownHere?.meta.hotel ?? "Your hotel"} folioNo={folioNumber(replaying ? demo : null)} live={!replaying}
                    runningCost={runActive ? runCost : undefined} />
                  <RoutingNotes />
                </div>
              </aside>
            )}
          </div>
          </>
        )}
        <Footer synthetic={replaying} link="hood" />
      </>
    );
  } else {
    const r = hoodLive && live ? live : demo;
    page = (
      <>
        <Masthead title="Under the hood" city={r?.meta.hotel ?? ""} edition={editionDate(r)} editionNote={editionNote(r)} live={r === live && !!live}
          synthetic={!!r?.meta.synthetic} summary="How the edition was made: the steps, the models, the bill, and every source." staleNote={r?.meta.stale_note} />
        {live && (
          <div className="seg hood-switch" role="group" aria-label="Which run">
            <button aria-pressed={!hoodLive} onClick={() => setHoodLive(false)}>Demo run</button>
            <button aria-pressed={hoodLive} onClick={() => setHoodLive(true)}>Your live run</button>
          </div>
        )}
        {r ? <UnderTheHood key={replyKey(r)} r={r} live={r === live} folioNo={folioNumber(r)} onToast={setToast} />
          : demoErr ? <main id="main">{notice("The demo edition didn't arrive.", demoErr, <button className="btn" onClick={loadDemo}>Try again</button>)}</main>
          : <main id="main"><Skeleton /></main>}
        <Footer synthetic={!!r?.meta.synthetic} link="issues" />
      </>
    );
  }

  return (
    <>
      <a href="#main" className="skip" onClick={(e) => { e.preventDefault(); document.getElementById("main")?.focus(); document.getElementById("main")?.scrollIntoView(); }}>Skip to the page</a>
      <Nav route={route} theme={theme} toggleTheme={() => setTheme((t) => (t === "paper" ? "night" : "paper"))} />
      <div className="page">
        <div key={route} className="page-enter">{page}</div>
      </div>
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
