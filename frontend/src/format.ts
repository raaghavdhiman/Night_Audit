export const usd = (v: number, digits?: number) => {
  const d = digits ?? (v < 0.01 ? 4 : v < 1 ? 3 : 2);
  return `$${v.toFixed(d)}`;
};

export const pct = (v: number, digits = 0) => `${(v * 100).toFixed(digits)}%`;

export const int = (v: number) => v.toLocaleString("en-US");

export const tokens = (v: number) => (v >= 1_000_000 ? `${(v / 1e6).toFixed(2)}M` : v >= 10_000 ? `${(v / 1000).toFixed(1)}k` : int(v));

export const secs = (v: number) => (v >= 90 ? `${Math.floor(v / 60)}m ${Math.round(v % 60)}s` : `${v.toFixed(v < 10 ? 1 : 0)}s`);

export function shortDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso + (iso.length === 10 ? "T12:00:00" : ""));
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function longDate(d: Date) {
  return d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

export function domain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function change(v: number | null, isNew: boolean) {
  if (isNew) return "new";
  if (v === null || v === undefined) return "—";
  const x = 1 + v;
  if (x >= 2) return `${x.toFixed(1)}×`;
  return `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`;
}

export const MODEL_LABELS: Record<string, string> = {
  lightning: "Nemotron 3.5 Lightning",
  super: "Nemotron 3 Super 120B",
  ultra: "Nemotron 3 Ultra 550B",
};

export const STAGE_DESC: Record<string, string> = {
  extract: "Extract",
  trends: "Trends",
  investigate: "Investigate",
  replies: "Replies",
};
