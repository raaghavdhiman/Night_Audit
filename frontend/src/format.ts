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

/** "Oct 15, 2026" for a full ISO date, "Oct 2026" for YYYY-MM. */
export function sourceDate(iso: string) {
  const d = new Date(`${iso.length === 7 ? `${iso}-01` : iso.slice(0, 10)}T12:00:00`);
  return d.toLocaleDateString("en-US", iso.length === 7 ? { month: "short", year: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
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

const MODEL_SHORT: Record<string, string> = { lightning: "Lightning 3.5", super: "Super 120B", ultra: "Ultra 550B" };

/** "Super 120B", "Lightning 3.5", "Ultra 550B" from a routing key, a display label or a model id. */
export function modelShort(m: string | undefined) {
  if (!m) return "";
  if (MODEL_SHORT[m]) return MODEL_SHORT[m];
  const key = Object.keys(MODEL_SHORT).find((k) => m.toLowerCase().includes(k));
  return key ? MODEL_SHORT[key] : m;
}

/** "1 call", "2 calls" */
export const plural = (n: number, word: string, many = `${word}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? word : many}`;

export const STAGE_DESC: Record<string, string> = {
  extract: "Extract",
  trends: "Trends",
  investigate: "Investigate",
  replies: "Replies",
};
