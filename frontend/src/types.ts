export type StageName = "extract" | "trends" | "investigate" | "replies";

export interface WeekPoint {
  week_start: string;
  neg: number;
  pos: number;
  reviews: number;
  rate: number;
  mean_severity: number | null;
}

export interface AspectSummary {
  aspect: string;
  label: string;
  department: string;
  neg_total: number;
  pos_total: number;
  recent_neg_rate: number;
  baseline_neg_rate: number | null;
  change_vs_baseline: number | null;
  new_since_baseline: boolean;
  last_week_neg: number;
  prev_week_neg: number | null;
  wow_change: number | null;
  mean_severity: number;
  max_severity: number;
  severity5_count: number;
  onset_week: string | null;
  priority_hint: number;
  weekly: WeekPoint[];
}

export interface Source {
  id: number;
  title: string;
  url: string;
  snippet: string;
  published_date: string | null;
  query: string;
}

export interface Hypothesis {
  hypothesis: string;
  confidence: "high" | "medium" | "low";
  type: "external" | "internal";
  reasoning: string;
  source_ids: number[];
}

export interface Action {
  priority: number;
  action: string;
  department: string;
  timeframe: string;
  expected_effect: string;
}

export interface Investigation {
  summary: string;
  hypotheses: Hypothesis[];
  actions: Action[];
  owner_department: string;
  guest_messaging: string;
  sources: Source[];
  cited_source_ids: number[];
  mode: string;
  search_trail: { query: string; results: number; cached?: boolean; error?: string; source_ids?: number[] }[];
  searches_used: number;
  max_searches: number;
}

export interface Quote {
  review_id: string;
  severity: number;
  date: string | null;
  excerpt: string;
}

export interface Issue {
  rank: number;
  aspect: string;
  label: string;
  title: string;
  department: string;
  interpretation: string;
  why_now: string;
  search_hint: string;
  stats: Omit<AspectSummary, "weekly">;
  weekly: WeekPoint[];
  quotes: Quote[];
  investigation?: Investigation;
}

export interface Escalation {
  review_id: string;
  aspect: string;
  label: string;
  severity: number;
  department: string;
  week_start: string;
  date: string | null;
  excerpt: string;
}

export interface Reply {
  review_id: string;
  rating: number | null;
  date: string | null;
  excerpt: string;
  aspects: { aspect: string; severity: number }[];
  max_severity: number;
  issue_rank: number | null;
  draft: string;
  status: string;
}

export interface FolioStage {
  stage: string;
  models: string[];
  calls: number;
  failed_calls: number;
  tokens_in: number;
  tokens_out: number;
  reasoning_tokens: number;
  model_seconds: number;
  wall_seconds: number;
  cost_usd: number;
  thinking: boolean;
  tool_calls?: number;
  tool_credits?: number;
  tool_cached?: number;
}

export interface Folio {
  stages: FolioStage[];
  total: { calls: number; tokens_in: number; tokens_out: number; reasoning_tokens: number; cost_usd: number; tool_calls: number; wall_seconds: number };
}

export interface Baseline {
  measured_on_reviews: number;
  measured_cost_usd: number;
  extrapolated_to_reviews: number;
  extrapolated_cost_usd: number;
  extrapolated_by_stage: Record<string, number>;
  label: string;
}

export interface RoutingEntry {
  stage: StageName;
  label: string;
  model: string;
  model_label: string;
  model_id: string;
  thinking: boolean;
}

export interface ReviewRow {
  review_id: string;
  date: string | null;
  rating: number | null;
  text: string;
  aspects: { aspect: string; sentiment: "p" | "n"; severity: number; department: string }[];
}

export interface AuditResult {
  meta: {
    hotel: string;
    city: string;
    period: string;
    n_reviews: number;
    n_extraction_failed: number;
    generated_at: string;
    synthetic: boolean;
    source: string;
    has_dates: boolean;
    truncated_to: number | null;
    wall_seconds: number;
    disclosure?: string;
  };
  routing: RoutingEntry[];
  issues: Issue[];
  escalations: Escalation[];
  weeks: { week_start: string; reviews: number; avg_rating: number | null }[];
  aspects: AspectSummary[];
  replies: Reply[];
  folio: Folio;
  baseline?: Baseline | null;
  savings_pct?: number;
  reviews?: ReviewRow[];
  replay?: PipelineEvent[];
  validation?: Record<string, unknown>;
}

export interface PipelineEvent {
  type: string;
  t?: number;
  stage?: StageName;
  status?: "running" | "done";
  [k: string]: unknown;
}

export interface ServerConfig {
  live_available: boolean;
  live_reason: string | null;
  live_message: string | null;
  limits: { max_reviews: number; per_ip_daily_runs: number; global_daily_runs: number; max_upload_bytes: number; max_searches_per_issue: number; issues_investigated: number };
  usage: { ip_runs_left: number; global_runs_left: number; spend_cap_usd: number; spend_used_pct: number | null };
  routing: { stage: StageName; label: string; model: string; model_id: string; thinking: boolean }[];
}
