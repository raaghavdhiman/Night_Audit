// Run state built from pipeline events (live SSE or a recorded demo replay).
import type { Folio, PipelineEvent, StageName } from "./types";

export interface StageState {
  status: "pending" | "running" | "done";
  model?: string;
  model_label?: string;
  thinking?: boolean;
  seconds?: number;
  done?: number;
  total?: number;
  failed?: number;
}

export interface RunState {
  status: "idle" | "running" | "done" | "error";
  n_reviews: number;
  stages: Record<StageName, StageState>;
  searches: { issue_rank: number; query: string; results?: number; n?: number }[];
  issues: { rank: number; title: string; aspect: string }[];
  issueDone: number[];
  folio: Folio | null;
  liveCost: number;
  error?: string;
  errorCode?: string;
  truncatedTo?: number | null;
}

export const STAGES: StageName[] = ["extract", "trends", "investigate", "replies"];

export const initialRun = (): RunState => ({
  status: "idle",
  n_reviews: 0,
  stages: { extract: { status: "pending" }, trends: { status: "pending" }, investigate: { status: "pending" }, replies: { status: "pending" } },
  searches: [],
  issues: [],
  issueDone: [],
  folio: null,
  liveCost: 0,
});

export function reduce(s: RunState, e: PipelineEvent): RunState {
  const stage = e.stage as StageName | undefined;
  switch (e.type) {
    case "accepted":
      return { ...initialRun(), status: "running", n_reviews: e.n_reviews as number, truncatedTo: e.truncated_to as number | null };
    case "start": {
      const stages = { ...s.stages };
      for (const st of (e.stages as { stage: StageName; model: string; model_label: string; thinking: boolean }[]) || []) {
        stages[st.stage] = { status: "pending", model: st.model, model_label: st.model_label, thinking: st.thinking };
      }
      return { ...s, status: "running", n_reviews: e.n_reviews as number, stages };
    }
    case "stage": {
      if (!stage) return s;
      const prev = s.stages[stage];
      const next: StageState = e.status === "running"
        ? { ...prev, status: "running", model: (e.model as string) ?? prev.model, model_label: (e.model_label as string) ?? prev.model_label, thinking: (e.thinking as boolean) ?? prev.thinking }
        : { ...prev, status: "done", seconds: e.seconds as number, failed: e.failed as number | undefined };
      const folio = (e.folio as Folio) || s.folio;
      return {
        ...s,
        stages: { ...s.stages, [stage]: next },
        folio,
        liveCost: folio ? folio.total.cost_usd : s.liveCost,
        issues: (e.issues as RunState["issues"]) || s.issues,
      };
    }
    case "progress":
      if (!stage) return s;
      return {
        ...s,
        stages: { ...s.stages, [stage]: { ...s.stages[stage], done: e.done as number, total: e.total as number } },
        liveCost: Math.max(s.liveCost, (e.cost_usd as number) || 0),
      };
    case "search":
      return { ...s, searches: [...s.searches, { issue_rank: e.issue_rank as number, query: e.query as string, n: e.n as number }] };
    case "search_done": {
      const idx = s.searches.map((x) => x.query).lastIndexOf(e.query as string);
      if (idx < 0) return s;
      const searches = s.searches.slice();
      searches[idx] = { ...searches[idx], results: e.results as number };
      return { ...s, searches };
    }
    case "issue_done": {
      const folio = (e.folio as Folio) || s.folio;
      return { ...s, issueDone: [...s.issueDone, e.issue_rank as number], folio, liveCost: folio ? folio.total.cost_usd : s.liveCost };
    }
    case "error":
      return { ...s, status: "error", error: (e.message as string) || "The analysis failed.", errorCode: e.error as string, folio: (e.folio as Folio) || s.folio };
    case "result":
      return { ...s, status: "done" };
    default:
      return s;
  }
}
