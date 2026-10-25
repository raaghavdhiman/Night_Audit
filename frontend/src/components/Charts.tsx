import type { WeekPoint } from "../types";
import { shortDate } from "../format";

/** Weekly negative mentions as a line + area, with an onset marker. Hand-built SVG. */
export function Sparkline({ weekly, onset, height = 92, labelled = true, title }: {
  weekly: WeekPoint[]; onset?: string | null; height?: number; labelled?: boolean; title: string;
}) {
  const W = 320;
  const H = height;
  const padT = 10, padB = labelled ? 18 : 4, padX = 4;
  const max = Math.max(1, ...weekly.map((w) => w.neg));
  const n = weekly.length;
  const x = (i: number) => padX + (n <= 1 ? (W - 2 * padX) / 2 : (i * (W - 2 * padX)) / (n - 1));
  const y = (v: number) => padT + (1 - v / max) * (H - padT - padB);
  const pts = weekly.map((w, i) => `${x(i).toFixed(1)},${y(w.neg).toFixed(1)}`);
  const line = `M${pts.join(" L")}`;
  const area = `${line} L${x(n - 1).toFixed(1)},${H - padB} L${x(0).toFixed(1)},${H - padB} Z`;
  const oi = onset ? weekly.findIndex((w) => w.week_start === onset) : -1;
  const last = weekly[n - 1];
  const desc = weekly.map((w) => `${shortDate(w.week_start)}: ${w.neg}`).join(", ");
  return (
    <svg className="spark spark-draw" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}. Negative mentions per week: ${desc}`}>
      <line className="base" x1={padX} x2={W - padX} y1={H - padB} y2={H - padB} />
      {oi >= 0 && (
        <g>
          <line className="onset" x1={x(oi)} x2={x(oi)} y1={padT - 6} y2={H - padB} />
          {labelled && <text x={x(oi) + 4} y={padT}>onset</text>}
        </g>
      )}
      <path className="area" d={area} />
      <path className="line" d={line} pathLength={600} />
      {last && <circle className="dot" cx={x(n - 1)} cy={y(last.neg)} r={3.2} />}
      {labelled && last && (
        <>
          <text x={padX} y={H - 4}>{shortDate(weekly[0].week_start)}</text>
          <text x={W - padX} y={H - 4} textAnchor="end">{shortDate(last.week_start)}</text>
          <text x={x(n - 1) - 6} y={Math.max(10, y(last.neg) - 6)} textAnchor="end" style={{ fill: "var(--oxblood-ink)", fontWeight: 600 }}>{last.neg}</text>
        </>
      )}
    </svg>
  );
}

/** Tiny weekly bars for the ledger table. */
export function WeekBars({ weekly, hot }: { weekly: WeekPoint[]; hot?: boolean }) {
  const W = 96, H = 22;
  const max = Math.max(1, ...weekly.map((w) => w.neg));
  const n = weekly.length || 1;
  const bw = W / n;
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden>
      {weekly.map((w, i) => {
        const h = Math.max(w.neg ? 1.5 : 0.5, (w.neg / max) * (H - 2));
        return <rect key={w.week_start} className={hot && i >= n - 2 ? "bar hot" : "bar"} x={i * bw + 1} y={H - h} width={bw - 2} height={h} />;
      })}
    </svg>
  );
}

export function Severity({ value, label = true }: { value: number; label?: boolean }) {
  const v = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <span className="sev" style={{ ["--sev-c" as string]: `var(--sev-${v})` }} title={`Severity ${v} of 5`}>
      <span className="sev-pip" aria-hidden>
        {[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= v ? "on" : ""} />)}
      </span>
      {label && <span>sev {v}{v === 5 ? " · health & safety" : ""}</span>}
    </span>
  );
}
