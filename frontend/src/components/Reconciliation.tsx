import type { RunState } from "../run";
import { STAGES } from "../run";
import { modelShort, plural, secs, usd } from "../format";
import { IconCheck, IconSearch } from "./Icons";

const NAMES = { extract: "Extract", trends: "Trends", investigate: "Investigate", replies: "Replies" } as const;

/** The night-audit reconciliation sequence: stages tick off in the ledger as events arrive. */
/** `cost` is the same (tweened) running total the folio shows beside it. */
export function Reconciliation({ run, cost, title = "Reconciling tonight's reviews", replay }: { run: RunState; cost: number; title?: string; replay?: boolean }) {
  return (
    <section className="recon" aria-label="Audit progress">
      <div className="recon-head">
        <span className="t">{title}</span>
        <span className="mono" aria-live="polite">
          {run.n_reviews.toLocaleString()} reviews · running total {usd(cost, 4)}
          {replay ? " · replay" : ""}
        </span>
      </div>
      <ol>
        {STAGES.map((st, i) => {
          const s = run.stages[st];
          const pctDone = s.total ? Math.round((100 * (s.done ?? 0)) / s.total) : 0;
          let state: string;
          if (s.status === "done") state = `${secs(s.seconds ?? 0)}`;
          else if (s.status === "running") {
            if (st === "extract" && s.total) state = `${s.done}/${s.total}`;
            else if (st === "investigate") state = `${run.issueDone.length}/3 issues`;
            else state = "in progress";
          } else state = "waiting";
          return (
            <li className={`stage ${s.status}`} key={st}>
              <span className="idx" aria-hidden>{String(i + 1).padStart(2, "0")}</span>
              <span className="leader">
                <span className="name">{NAMES[st]}</span>
                <span className="dots" aria-hidden />
                <span className="model">{s.model ? `Nemotron ${modelShort(s.model)} · ${s.thinking ? "thinking" : "no thinking"}` : ""}</span>
              </span>
              <span className={`state ${s.status}`}>
                {s.status === "done" ? <span className="tick"><IconCheck title="done" /> </span> : null}
                {state}
              </span>
              {st === "extract" && s.status === "running" && s.total ? (
                <div className="sub" aria-hidden>
                  <div className="meter"><i style={{ width: `${pctDone}%` }} /></div>
                </div>
              ) : null}
              {st === "trends" && run.issues.length > 0 ? (
                <ol className="sub">
                  {run.issues.map((x) => <li key={x.rank}><span>#{x.rank}</span><span>{x.title}</span></li>)}
                </ol>
              ) : null}
              {st === "investigate" && run.searches.length > 0 ? (
                <ol className="sub">
                  {run.searches.map((q, j) => (
                    <li key={j}>
                      <IconSearch />
                      <span>#{q.issue_rank}.{q.n ?? ""} “{q.query}”{typeof q.results === "number" ? ` — ${plural(q.results, "result")}` : " …"}</span>
                    </li>
                  ))}
                </ol>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
