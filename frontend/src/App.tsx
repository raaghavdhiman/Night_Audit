import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { analyze, ApiError, getConfig, getDemo } from "./api";
import type { AuditResult, PipelineEvent, ServerConfig } from "./types";
import { initialRun, reduce, type RunState } from "./run";
import { Footer, Masthead, RoutingNotes, type Mode } from "./components/Chrome";
import { BuildDetails } from "./components/BuildDetails";
import { Folio } from "./components/Folio";
import { IssueCard } from "./components/IssueCard";
import { Reconciliation } from "./components/Reconciliation";
import { useReplyStore } from "./components/Replies";
import { LivePanel } from "./components/LivePanel";
import { IconAlert } from "./components/Icons";
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

function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Setting the type">
      <div className="skeleton sk-line" style={{ width: 160 }} />
      <div className="skeleton sk-head" />
      <div className="skeleton sk-head" style={{ width: "55%" }} />
      {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton sk-line" style={{ width: `${92 - i * 7}%` }} />)}
      <p className="mono faint" style={{ fontSize: 12 }}>Setting the type…</p>
    </div>
  );
}

/** "3 things to fix this week, from 600 reviews." */
function summaryLine(r: AuditResult): string {
  const k = Math.min(3, r.issues.length);
  const things = k === 0 ? "Nothing stood out to fix this week" : `${k === 1 ? "1 thing" : `${k} things`} to fix this week`;
  return `${things}, from ${r.meta.truncated_to ? "the latest " : ""}${plural(r.meta.n_reviews, "review")}.`;
}

const replyKey = (r: AuditResult) => `na-replies-v2-${r.meta.hotel}-${r.meta.generated_at}`;

/** The results page: at most three issue cards, then the footer that opens everything else. Keyed by replyKey. */
function Results({ r, live, folioNo, onToast, onReplay, after }: {
  r: AuditResult; live: boolean; folioNo: string; onToast: (m: string) => void; onReplay?: () => void; after?: React.ReactNode;
}) {
  const store = useReplyStore(replyKey(r));
  const reply = (rank: number) => r.replies.find((x) => x.issue_rank === rank);
  return (
    <>
      <main id="main" className="brief">
        {r.issues.length === 0 && <p className="muted">No issue stood out in these reviews.</p>}
        {r.issues.slice(0, 3).map((i) => {
          const rep = reply(i.rank);
          return <IssueCard key={i.rank} issue={i} replyText={rep ? store.get(rep).text : undefined} />;
        })}
        {after}
      </main>
      <Footer synthetic={!live}>
        <BuildDetails r={r} live={live} folioNo={folioNo} store={store} onToast={onToast} onReplay={onReplay} />
      </Footer>
    </>
  );
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [mode, setModeState] = useState<Mode>(() => (location.hash === "#live" ? "live" : "demo"));
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

  const setMode = (m: Mode) => {
    if (m === mode) return;
    stopReplay();
    if (m === "live" && run.status === "running") return setModeState(m);
    if (run.status !== "running") dispatch({ type: "reset" });
    history.replaceState(null, "", m === "live" ? "#live" : "#");
    setModeState(m);
    if (m === "live") refreshConfig();
  };

  /** Replay the recorded event stream of the demo run, compressed to ~16 s. */
  const replay = () => {
    if (!demo?.replay?.length) return;
    stopReplay();
    dispatch({ type: "reset" });
    setReplaying(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
    const evs = demo.replay;
    const total = evs[evs.length - 1].t || 1;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const scale = reduceMotion ? 0 : Math.min(1, 16 / total);
    evs.forEach((e) => {
      timers.current.push(window.setTimeout(() => dispatch({ type: "event", e }), (e.t || 0) * scale * 1000));
    });
    timers.current.push(window.setTimeout(() => { dispatch({ type: "event", e: { type: "result" } }); setReplaying(false); }, total * scale * 1000 + 700));
  };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const startLive = async (file: File, hotel: string, city: string) => {
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
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


  const shown: AuditResult | null = mode === "demo" ? demo : live;
  const running = run.status === "running";
  const inProgress = (mode === "demo" && replaying) || (mode === "live" && running);
  // one running total for the reconciliation header and the folio beside it
  const runActive = inProgress || (mode === "live" && !!run.folio && !live);
  const runCost = useTween(Math.max(run.folio?.total.cost_usd ?? 0, run.liveCost));
  const folioNo = useMemo(() => {
    const g = shown?.meta.generated_at?.slice(0, 10).replace(/-/g, "") ?? "pending";
    return `${g}-${shown?.meta.n_reviews ?? 0}`;
  }, [shown]);

  const hotel = mode === "demo" ? demo?.meta.hotel ?? "Hotel Wrenfield" : live?.meta.hotel ?? "Your hotel";
  const city = mode === "demo" ? demo?.meta.city ?? "Austin, Texas" : live?.meta.city ?? "";
  const routing = shown?.routing ?? config?.routing ?? demo?.routing ?? [];
  // the finished edition, once there is one and no run is replacing it
  const result = inProgress || (mode === "demo" && demoErr) ? null : shown;

  let main: React.ReactNode = null;
  if (mode === "demo") {
    if (demoErr) {
      main = (
        <section className="notice warn" role="alert">
          <IconAlert className="glyph" />
          <div>
            <h3>The demo edition didn't arrive.</h3>
            <p>{demoErr}</p>
            <button className="btn" onClick={loadDemo}>Try again</button>
          </div>
        </section>
      );
    } else if (!demo) main = <Skeleton />;
    else if (replaying) main = <><Reconciliation run={run} cost={runCost} replay title="Replaying last night's audit" /><div style={{ marginTop: 18 }}><Skeleton /></div></>;
  } else {
    if (running) main = <><Reconciliation run={run} cost={runCost} /><div style={{ marginTop: 18 }}><Skeleton /></div></>;
    else if (liveErr) {
      const limited = ["ip_limit", "global_limit", "busy", "spend_cap", "BudgetExceeded"].includes(liveErr.code);
      main = (
        <>
          <section className="notice warn" role="alert">
            <IconAlert className="glyph" />
            <div>
              <h3>{limited ? "The night desk is closed to new audits." : "The audit couldn't be completed."}</h3>
              <p>{liveErr.message}</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn btn-primary" onClick={() => setMode("demo")}>Read the demo edition</button>
                {!limited && <button className="btn" onClick={() => { setLiveErr(null); dispatch({ type: "reset" }); }}>Try another file</button>}
              </div>
            </div>
          </section>
          {run.folio && <Reconciliation run={run} cost={runCost} title="Audit stopped" />}
        </>
      );
    } else if (!live) main = <LivePanel config={config} onStart={startLive} onDemo={() => setMode("demo")} />;
  }

  // the running folio sits beside the progress ledger; a finished edition keeps it under "How this was built"
  const showSide = inProgress || (mode === "live" && !live && !!run.folio);

  return (
    <>
      <a href="#main" className="skip">Skip to the briefing</a>
      <div className="page">
        <Masthead hotel={hotel} city={city} edition={editionDate(shown)} editionNote={editionNote(shown)} mode={mode} setMode={setMode}
          theme={theme} toggleTheme={() => setTheme((t) => (t === "paper" ? "night" : "paper"))} synthetic={mode === "demo"}
          summary={result ? summaryLine(result) : null} staleNote={result?.meta.stale_note} />
        {result ? (
          <Results key={replyKey(result)} r={result} live={mode === "live"} folioNo={folioNo} onToast={setToast}
            onReplay={mode === "demo" && demo?.replay?.length ? replay : undefined}
            after={mode === "live" && (
              <p className="brief-after"><button className="btn" onClick={() => { setLive(null); dispatch({ type: "reset" }); }}>Run another audit</button></p>
            )} />
        ) : (
          <>
            <div className="sheet" style={showSide ? undefined : { gridTemplateColumns: "1fr" }}>
              <main id="main" className="col-main">{main}</main>
              {showSide && (
                <aside className="col-side" aria-label="Cost of this briefing">
                  <div className="side-sticky" style={{ position: "sticky", top: 12 }}>
                    <Folio folio={run.folio} routing={routing} stages={inProgress ? run.stages : undefined} baseline={null}
                      nReviews={run.n_reviews} hotel={hotel} folioNo={folioNo} live={mode === "live"}
                      runningCost={runActive ? runCost : undefined} />
                    <RoutingNotes />
                  </div>
                </aside>
              )}
            </div>
            <Footer synthetic={mode === "demo"}>{!showSide && <RoutingNotes />}</Footer>
          </>
        )}
      </div>
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
