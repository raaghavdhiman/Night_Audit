import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { analyze, ApiError, getConfig, getDemo } from "./api";
import type { AuditResult, PipelineEvent, ServerConfig } from "./types";
import { initialRun, reduce, type RunState } from "./run";
import { Footer, Masthead, RoutingNotes, type Mode } from "./components/Chrome";
import { Story } from "./components/Story";
import { Folio } from "./components/Folio";
import { Reconciliation } from "./components/Reconciliation";
import { Replies } from "./components/Replies";
import { Escalations, LedgerTable } from "./components/Sections";
import { LivePanel } from "./components/LivePanel";
import { IconAlert } from "./components/Icons";
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

function Broadsheet({ r, expanded, toggle, onToast, staleNote }: {
  r: AuditResult; expanded: Set<number>; toggle: (n: number) => void; onToast: (m: string) => void; staleNote?: string | null;
}) {
  const [lead, ...rest] = r.issues;
  return (
    <>
      {lead && <Story issue={lead} lead expanded={expanded.has(lead.rank)} onToggle={() => toggle(lead.rank)} nReviews={r.meta.n_reviews} staleNote={staleNote} />}
      <Escalations items={r.escalations} />
      {rest.length > 0 && <hr className="rule" style={{ margin: "22px 0 14px" }} />}
      <div className="seconds">
        {rest.map((i) => (
          <Story key={i.rank} issue={i} expanded={expanded.has(i.rank)} onToggle={() => toggle(i.rank)} nReviews={r.meta.n_reviews} staleNote={staleNote} />
        ))}
      </div>
      <Replies replies={r.replies} storeKey={`na-replies-v2-${r.meta.hotel}-${r.meta.generated_at}`} onToast={onToast} />
      <LedgerTable aspects={r.aspects} issues={r.issues} />
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
  const [expanded, setExpanded] = useState<Set<number>>(new Set([1]));
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
    setExpanded(new Set([1]));
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

  const toggle = (n: number) => setExpanded((s) => { const x = new Set(s); if (x.has(n)) x.delete(n); else x.add(n); return x; });

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

  let main: React.ReactNode;
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
    else main = <Broadsheet r={demo} expanded={expanded} toggle={toggle} onToast={setToast} />;
  } else {
    if (running) main = <><Reconciliation run={run} cost={runCost} /><div style={{ marginTop: 18 }}><Skeleton /></div></>;
    else if (live) main = (
      <>
        {live.meta.truncated_to ? <p className="mono faint" style={{ fontSize: 12 }}>Only the most recent {live.meta.truncated_to} reviews were analysed (live limit).</p> : null}
        <Broadsheet r={live} expanded={expanded} toggle={toggle} onToast={setToast} staleNote={live.meta.stale_note} />
        <p style={{ marginTop: 24 }}><button className="btn" onClick={() => { setLive(null); dispatch({ type: "reset" }); }}>Run another audit</button></p>
      </>
    );
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
    } else main = <LivePanel config={config} onStart={startLive} onDemo={() => setMode("demo")} />;
  }

  const sideFolio = inProgress || (mode === "live" && run.folio && !live) ? run.folio : shown?.folio ?? null;
  const showSide = mode === "demo" ? !!demo : !!(live || running || run.folio);

  return (
    <>
      <a href="#main" className="skip">Skip to the briefing</a>
      <div className="page">
        <Masthead hotel={hotel} city={city} period={shown?.meta.period ?? ""} edition={editionDate(shown)} editionNote={editionNote(shown)} mode={mode} setMode={setMode}
          theme={theme} toggleTheme={() => setTheme((t) => (t === "paper" ? "night" : "paper"))}
          synthetic={mode === "demo"} nReviews={shown?.meta.n_reviews ?? run.n_reviews}
          canReplay={mode === "demo" && !!demo?.replay?.length} onReplay={replay} replaying={replaying} />
        <div className="sheet" style={showSide ? undefined : { gridTemplateColumns: "1fr" }}>
          <main id="main" className="col-main">{main}</main>
          {showSide && (
            <aside className="col-side" aria-label="Cost of this briefing">
              <div className="side-sticky" style={{ position: "sticky", top: 12 }}>
                <Folio folio={sideFolio} routing={routing} stages={inProgress ? run.stages : undefined}
                  baseline={inProgress ? null : shown?.baseline} savingsPct={shown?.savings_pct}
                  nReviews={inProgress ? run.n_reviews : shown?.meta.n_reviews ?? run.n_reviews} hotel={hotel} folioNo={folioNo} live={mode === "live"}
                  runningCost={runActive ? runCost : undefined} />
                <RoutingNotes />
              </div>
            </aside>
          )}
        </div>
        <Footer synthetic={mode === "demo"} />
      </div>
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
