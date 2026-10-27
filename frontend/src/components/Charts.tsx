import { useLayoutEffect, useRef, useState } from "react";
import type { AspectSummary, WeekPoint } from "../types";
import { shortDate } from "../format";

/** The rendered width of an SVG, so charts draw at 1:1 and their text stays on the type scale at any size. */
function useWidth(fallback: number) {
  const ref = useRef<SVGSVGElement>(null);
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(120, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/**
 * Weekly negative mentions as a line + light area. Axis-free: the first and last weeks, the onset week,
 * the peak and the last value are labelled directly; the last point is ringed. Hand-built SVG.
 */
export function Sparkline({ weekly, onset, height = 92, labelled = true, title }: {
  weekly: WeekPoint[]; onset?: string | null; height?: number; labelled?: boolean; title: string;
}) {
  const [ref, W] = useWidth(320);
  const H = height;
  const padT = 16, padB = labelled ? 18 : 4, padL = 4, padR = labelled ? 4 : 26;
  const max = Math.max(1, ...weekly.map((w) => w.neg));
  const n = weekly.length;
  const x = (i: number) => padL + (n <= 1 ? (W - padL - padR) / 2 : (i * (W - padL - padR)) / (n - 1));
  const y = (v: number) => padT + (1 - v / max) * (H - padT - padB);
  const pts = weekly.map((w, i) => `${x(i).toFixed(1)},${y(w.neg).toFixed(1)}`);
  const line = `M${pts.join(" L")}`;
  const area = `${line} L${x(n - 1).toFixed(1)},${H - padB} L${x(0).toFixed(1)},${H - padB} Z`;
  const oi = onset ? weekly.findIndex((w) => w.week_start === onset) : -1;
  const last = weekly[n - 1];
  const desc = weekly.map((w) => `${shortDate(w.week_start)}: ${w.neg}`).join(", ");
  const label = `${title}. Negative mentions per week: ${desc}`;
  if (n < 3) {
    // two points make a straight line that reads as a trend; show the weeks as labelled bars instead
    if (n === 0) return null;
    const slot = (W - padL - padR) / n;
    const bw = Math.min(48, slot * 0.42);
    const yb = (v: number) => padT + (1 - v / max) * (H - padT - padB);
    return (
      <svg ref={ref} className="spark" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        <line className="base" x1={padL} x2={W - padR} y1={H - padB} y2={H - padB} />
        {weekly.map((w, i) => {
          const cx = padL + slot * (i + 0.5);
          return (
            <g key={w.week_start}>
              <rect className={i === n - 1 ? "bar hot" : "bar"} x={cx - bw / 2} y={yb(w.neg)} width={bw} height={Math.max(1, H - padB - yb(w.neg))} />
              <text className="val" x={cx} y={yb(w.neg) - 5} textAnchor="middle">{w.neg}</text>
              {labelled && <text x={cx} y={H - 4} textAnchor="middle">wk of {shortDate(w.week_start)}</text>}
            </g>
          );
        })}
      </svg>
    );
  }
  // the peak gets its own label only when it is not the last point and sits clear of it
  let pi = 0;
  weekly.forEach((w, i) => { if (w.neg > weekly[pi].neg) pi = i; });
  const showPeak = labelled && pi !== n - 1 && weekly[pi].neg > last.neg && x(n - 1) - x(pi) > 36;
  return (
    <svg ref={ref} className="spark spark-draw" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <line className="base" x1={padL} x2={W - padR} y1={H - padB} y2={H - padB} />
      {oi >= 0 && (
        <g>
          <line className="onset" x1={x(oi)} x2={x(oi)} y1={padT - 8} y2={H - padB} />
          {labelled && <text x={x(oi) + 4} y={padT - 2}>onset</text>}
        </g>
      )}
      <path className="area" d={area} />
      <path className="line" d={line} pathLength={600} />
      {showPeak && (
        <g>
          <circle className="peak" cx={x(pi)} cy={y(weekly[pi].neg)} r={2.5} />
          <text className="val muted-val" x={x(pi)} y={y(weekly[pi].neg) - 6} textAnchor="middle">{weekly[pi].neg}</text>
        </g>
      )}
      <circle className="halo" cx={x(n - 1)} cy={y(last.neg)} r={5.5} />
      <circle className="dot" cx={x(n - 1)} cy={y(last.neg)} r={3.5} />
      {labelled ? (
        <>
          <text x={padL} y={H - 4}>{shortDate(weekly[0].week_start)}</text>
          <text x={W - padR} y={H - 4} textAnchor="end">{shortDate(last.week_start)}</text>
          <text className="val" x={x(n - 1) - 8} y={Math.max(11, y(last.neg) - 7)} textAnchor="end">{last.neg}</text>
        </>
      ) : (
        <text className="val" x={x(n - 1) + 8} y={y(last.neg) + 4}>{last.neg}</text>
      )}
      {/* hover targets wider than the line: one column per week, with a native tooltip */}
      {weekly.map((w, i) => (
        <rect key={w.week_start} className="hit" x={x(i) - (W - padL - padR) / (2 * Math.max(1, n - 1))} y={0}
          width={(W - padL - padR) / Math.max(1, n - 1)} height={H}>
          <title>{`Week of ${shortDate(w.week_start)}: ${w.neg} negative`}</title>
        </rect>
      ))}
    </svg>
  );
}

/**
 * "Issues by guest mentions": negative mentions per aspect over the period, max 6 bars, values at the bar ends.
 * The featured issues are highlighted (accent, bold label and "No. rank") and always kept on the chart.
 */
export function MentionBars({ aspects, featured, period }: { aspects: AspectSummary[]; featured: Map<string, number>; period?: string }) {
  const [ref, W] = useWidth(360);
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
  const rowH = 30, rankW = 36, labelW = 168, valW = 34, barH = 10;
  const span = W - labelW - valW;
  const H = rows.length * rowH;
  return (
    <figure className="bars" aria-labelledby="bars-title">
      <h2 className="bars-title" id="bars-title">Issues by guest mentions</h2>
      <svg ref={ref} className="mbars" viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={`Negative mentions by topic: ${rows.map((a) => `${a.label} ${a.neg_total}${featured.has(a.aspect) ? `, issue ${featured.get(a.aspect)}` : ""}`).join("; ")}`}>
        {rows.map((a, i) => {
          const rank = featured.get(a.aspect);
          const w = Math.max(2, (a.neg_total / max) * span);
          const y = i * rowH + rowH / 2;
          return (
            <g key={a.aspect} className={rank ? "hot" : undefined} style={{ ["--i" as string]: i }}>
              <title>{`${a.label}: ${a.neg_total} negative mentions`}</title>
              {rank ? <text className="mb-rank" x={0} y={y + 4}>No.{rank}</text> : null}
              <text className="mb-label" x={rankW} y={y + 5}>{a.label}</text>
              <rect className="mb-bar" x={labelW} y={y - barH / 2} width={w} height={barH} />
              <text className="mb-val" x={labelW + w + 6} y={y + 4}>{a.neg_total}</text>
            </g>
          );
        })}
      </svg>
      <figcaption>Negative mentions{period ? `, ${period}` : ""}. Highlighted with No.: the issues to fix first, in their order.</figcaption>
    </figure>
  );
}

export interface HBarRow { label: string; note?: string; value: number; text: string; muted?: boolean }

/** Ledger-style bars in inline SVG: label (and note) left, value right on one line, the bar beneath from one baseline. Single series, so no legend. */
export function HBars({ rows, title }: { rows: HBarRow[]; title: string }) {
  const [ref, W] = useWidth(400);
  const rowH = 42, barH = 8;
  const max = Math.max(...rows.map((r) => r.value), 1e-9);
  const H = rows.length * rowH - 8;
  return (
    <svg ref={ref} className="hbars" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: ${rows.map((r) => `${r.label} ${r.text}`).join(", ")}`}>
      {rows.map((r, i) => {
        const y = i * rowH;
        const w = Math.max(2, (r.value / max) * W);
        return (
          <g key={r.label} style={{ ["--i" as string]: i }}>
            <title>{`${r.label}${r.note ? ` (${r.note})` : ""}: ${r.text}`}</title>
            <text className="hb-label" x={0} y={y + 13}>{r.label}{r.note ? <tspan className="hb-note" dx={8}>{r.note}</tspan> : null}</text>
            <text className="hb-val" x={W} y={y + 13} textAnchor="end">{r.text}</text>
            <rect className="hb-track" x={0} y={y + 21} width={W} height={barH} />
            <rect className={`hb-bar${r.muted ? " muted" : ""}`} x={0} y={y + 21} width={w} height={barH} />
          </g>
        );
      })}
    </svg>
  );
}

/** This run against the all-Ultra baseline on one scale; the part of the baseline this run did not spend is marked with the saving. */
export function SavingsChart({ run, runText, baseline, baselineText, baselineNote, saved }: {
  run: number; runText: string; baseline: number; baselineText: string; baselineNote: string; saved?: string;
}) {
  const [ref, W] = useWidth(400);
  const barH = 18;
  const max = Math.max(run, baseline, 1e-9);
  const wr = Math.max(2, (run / max) * W), wb = Math.max(2, (baseline / max) * W);
  const gap = wb - wr;
  return (
    <svg ref={ref} className="savings" viewBox={`0 0 ${W} 104`} role="img"
      aria-label={`This run ${runText}; all-Ultra baseline ${baselineText}${saved ? `; ${saved}` : ""}`}>
      <text className="hb-label" x={0} y={13}>This run<tspan className="hb-note" dx={8}>each stage on its own model</tspan></text>
      <text className="hb-val strong" x={W} y={13} textAnchor="end">{runText}</text>
      <rect className="hb-bar" x={0} y={22} width={wr} height={barH} />
      {gap > 60 && (
        <g className="gap">
          <rect x={wr + 0.5} y={22.5} width={gap - 1} height={barH - 1} />
          {saved && <text x={wr + gap / 2} y={35} textAnchor="middle">{saved}</text>}
        </g>
      )}
      <text className="hb-label" x={0} y={69}>All-Ultra<tspan className="hb-note" dx={8}>{baselineNote}</tspan></text>
      <text className="hb-val" x={W} y={69} textAnchor="end">{baselineText}</text>
      <rect className="hb-bar muted" x={0} y={78} width={wb} height={barH} />
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
