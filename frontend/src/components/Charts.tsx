import type { AspectSummary, WeekPoint } from "../types";
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
  if (n < 3) {
    // two points make a straight line that reads as a trend; show the weeks as labelled bars instead
    if (n === 0) return null;
    const slot = (W - 2 * padX) / n;
    const bw = Math.min(56, slot * 0.5);
    const yb = (v: number) => padT + 6 + (1 - v / max) * (H - padT - 6 - padB);
    return (
      <svg className="spark" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}. Negative mentions per week: ${desc}`}>
        <line className="base" x1={padX} x2={W - padX} y1={H - padB} y2={H - padB} />
        {weekly.map((w, i) => {
          const cx = padX + slot * (i + 0.5);
          return (
            <g key={w.week_start}>
              <rect className={i === n - 1 ? "bar hot" : "bar"} x={cx - bw / 2} y={yb(w.neg)} width={bw} height={Math.max(1, H - padB - yb(w.neg))} />
              <text x={cx} y={yb(w.neg) - 4} textAnchor="middle" style={{ fill: "var(--ink)", fontWeight: 600 }}>{w.neg}</text>
              {labelled && <text x={cx} y={H - 4} textAnchor="middle">wk of {shortDate(w.week_start)}</text>}
            </g>
          );
        })}
      </svg>
    );
  }
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
      {last && <circle className="dot" cx={x(n - 1)} cy={y(last.neg)} r={4} />}
      {labelled && last && (
        <>
          <text x={padX} y={H - 4}>{shortDate(weekly[0].week_start)}</text>
          <text x={W - padX} y={H - 4} textAnchor="end">{shortDate(last.week_start)}</text>
          <text className="last" x={x(n - 1) - 6} y={Math.max(10, y(last.neg) - 6)} textAnchor="end">{last.neg}</text>
        </>
      )}
      {/* hover targets wider than the line: one column per week, with a native tooltip */}
      {weekly.map((w, i) => (
        <rect key={w.week_start} className="hit" x={x(i) - (W - 2 * padX) / (2 * Math.max(1, n - 1))} y={0}
          width={(W - 2 * padX) / Math.max(1, n - 1)} height={H}>
          <title>{`Week of ${shortDate(w.week_start)}: ${w.neg} negative`}</title>
        </rect>
      ))}
    </svg>
  );
}

/**
 * "Issues by guest mentions": negative mentions per aspect over the period, max 6 bars, direct labels.
 * The featured issues are highlighted (accent + "#rank" text) and always kept on the chart.
 */
export function MentionBars({ aspects, featured, period }: { aspects: AspectSummary[]; featured: Map<string, number>; period?: string }) {
  const sorted = [...aspects].filter((a) => a.neg_total > 0).sort((a, b) => b.neg_total - a.neg_total);
  const rows = sorted.slice(0, 6);
  for (const a of sorted.slice(6)) {
    if (!featured.has(a.aspect)) continue;
    const drop = rows.map((r) => featured.has(r.aspect)).lastIndexOf(false);
    if (drop < 0) break;
    rows.splice(drop, 1);
    rows.push(a); // smaller than everything kept, so the order holds
  }
  if (!rows.length) return null;
  const max = rows[0].neg_total;
  return (
    <figure className="bars" aria-labelledby="bars-title">
      <h2 className="bars-title" id="bars-title">Issues by guest mentions</h2>
      <ol className="bars-list">
        {rows.map((a) => {
          const rank = featured.get(a.aspect);
          return (
            <li key={a.aspect} className={rank ? "hot" : undefined} title={`${a.label}: ${a.neg_total} negative mentions`}>
              <span className="bar-label">{a.label}{rank ? <span className="bar-rank"> #{rank}</span> : null}</span>
              <span className="bar-track" aria-hidden><i style={{ width: `${(100 * a.neg_total) / max}%` }} /></span>
              <span className="bar-val">{a.neg_total}</span>
            </li>
          );
        })}
      </ol>
      <figcaption>Negative mentions{period ? `, ${period}` : ""}. Highlighted with #: the issues to fix first, in their order.</figcaption>
    </figure>
  );
}

export interface HBarRow { label: string; note?: string; value: number; text: string; muted?: boolean }

/** Small horizontal bars in inline SVG: label (and note) left, bar from one baseline, value right. Single series, so no legend. */
export function HBars({ rows, title }: { rows: HBarRow[]; title: string }) {
  const W = 400, rowH = 36, labelW = 150, valW = 64, barH = 12;
  const max = Math.max(...rows.map((r) => r.value), 1e-9);
  const span = W - labelW - valW - 8;
  const H = rows.length * rowH;
  return (
    <svg className="hbars" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: ${rows.map((r) => `${r.label} ${r.text}`).join(", ")}`}>
      {rows.map((r, i) => {
        const y = i * rowH + 6;
        const w = Math.max(2, (r.value / max) * span);
        const rx = Math.min(4, w / 2);
        // square at the baseline, 4px rounded at the data end
        const d = `M${labelW},${y} h${w - rx} a${rx},${rx} 0 0 1 ${rx},${rx} v${barH - 2 * rx} a${rx},${rx} 0 0 1 ${-rx},${rx} h${-(w - rx)} z`;
        return (
          <g key={r.label}>
            <title>{`${r.label}${r.note ? ` (${r.note})` : ""}: ${r.text}`}</title>
            <text className="hb-label" x={0} y={y + 10}>{r.label}</text>
            {r.note && <text className="hb-note" x={0} y={y + 24}>{r.note}</text>}
            <path className={`hb-bar${r.muted ? " muted" : ""}`} d={d} />
            <text className="hb-val" x={W} y={y + 10} textAnchor="end">{r.text}</text>
          </g>
        );
      })}
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
