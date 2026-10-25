import type { Baseline, Folio as FolioT, RoutingEntry, StageName } from "../types";
import type { StageState } from "../run";
import { modelShort, plural, tokens, usd } from "../format";
import { useTween } from "../tween";

const secs = (v: number) => `${v < 10 ? v.toFixed(1) : Math.round(v)}s`;

function Amount({ value }: { value: number }) {
  const v = useTween(value);
  return <>{usd(v, 4)}</>;
}

const ORDER: StageName[] = ["extract", "trends", "investigate", "replies"];
const DESC: Record<StageName, string> = { extract: "Extract", trends: "Trends", investigate: "Investigate", replies: "Replies" };
const WHAT: Record<StageName, string> = {
  extract: "aspects from every review",
  trends: "ranks issues from pandas counts",
  investigate: "agent + web search, top 3",
  replies: "drafts for approval",
};

export function Folio({ folio, routing, baseline, savingsPct, stages, nReviews, hotel, folioNo, live, runningCost }: {
  folio: FolioT | null;
  routing: RoutingEntry[] | { stage: StageName; model: string; thinking: boolean }[];
  baseline?: Baseline | null;
  savingsPct?: number;
  stages?: Record<StageName, StageState>;
  nReviews: number;
  hotel: string;
  folioNo: string;
  live?: boolean;
  runningCost?: number;
}) {
  const by = new Map((folio?.stages || []).map((s) => [s.stage, s]));
  const route = new Map(routing.map((r) => [r.stage, r]));
  const billed = folio?.total.cost_usd ?? 0;
  const tavily = folio?.stages.find((s) => s.stage === "investigate");
  const allDone = stages ? ORDER.every((s) => stages[s].status === "done") : !!folio;
  // during a run the caller passes the running total, already tweened, so the header shows the same number
  const tweened = useTween(billed);
  const totalV = runningCost ?? tweened;

  return (
    <section className="folio" aria-labelledby="folio-title">
      <div className="folio-head">
        <div className="t" id="folio-title">GUEST FOLIO</div>
        <div className="s">{hotel} · Night Audit · Cost of tonight's briefing</div>
      </div>
      <div className="folio-meta">
        <span>Folio № {folioNo}</span>
        <span style={{ textAlign: "right" }}>{nReviews.toLocaleString()} reviews</span>
        <span>Rate: list price</span>
        <span style={{ textAlign: "right" }}>{live ? "Live run" : "Recorded run"}</span>
      </div>
      <table>
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col">Tokens</th>
            <th scope="col">Secs</th>
            <th scope="col">Amount</th>
          </tr>
        </thead>
        <tbody aria-live="polite">
          {ORDER.map((st) => {
            const row = by.get(st);
            const r = route.get(st);
            const s = stages?.[st];
            const status = s?.status ?? (row ? "done" : "pending");
            const model = r ? `${modelShort(r.model)} · ${r.thinking ? "thinking" : "no thinking"}` : "";
            return (
              <tr key={st} className={`${status}${row ? " enter" : ""}`}>
                <td>
                  <span className="desc">{DESC[st]}</span>
                  <span className="model">{model}</span>
                  <span className="model">{row ? plural(row.calls, "call") : WHAT[st]}</span>
                </td>
                <td>{row ? tokens(row.tokens_in + row.tokens_out) : "—"}{row && row.reasoning_tokens > 0 ? <span className="model">{tokens(row.reasoning_tokens)} think</span> : null}</td>
                <td>{row ? secs(row.wall_seconds) : status === "running" ? "…" : "—"}</td>
                <td>{row ? <Amount value={row.cost_usd} /> : status === "running" && runningCost ? usd(Math.max(0, runningCost - billed), 4) : "—"}</td>
              </tr>
            );
          })}
          <tr className={tavily?.tool_calls ? "" : "pending"}>
            <td>
              <span className="desc">Web search</span>
              <span className="model">Tavily · called by Ultra</span>
            </td>
            <td>{tavily?.tool_calls ? `${tavily.tool_calls} q` : "—"}</td>
            <td>—</td>
            <td>{tavily?.tool_calls ? `${tavily.tool_credits ?? 0} cr` : "—"}</td>
          </tr>
          <tr className="total">
            <td>Total</td>
            <td>{folio ? tokens(folio.total.tokens_in + folio.total.tokens_out) : "—"}</td>
            <td>{folio && allDone ? secs(folio.total.wall_seconds) : ""}</td>
            <td>{usd(totalV, 4)}</td>
          </tr>
        </tbody>
      </table>
      {baseline && allDone && (
        <div className="stamp in" role="note">
          All-Ultra baseline
          <b>{usd(baseline.extrapolated_cost_usd, 2)}</b>
          ({baseline.label}){typeof savingsPct === "number" ? <> — saved {Math.round(savingsPct)}%</> : null}
        </div>
      )}
      <p className="note">
        Estimates from Nebius Token Factory list prices (Lightning $0.06/$0.24, Super $0.30/$0.90, Ultra $1.00/$3.00 per 1M
        in/out). Reasoning tokens are billed as output (assumption). Tavily searches are counted in credits, not included in the total.
        Baseline = every stage on Ultra with thinking on.
      </p>
    </section>
  );
}
