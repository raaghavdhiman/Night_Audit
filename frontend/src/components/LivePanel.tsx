import { useRef, useState } from "react";
import type { ServerConfig } from "../types";
import { IconAlert, IconDownload, IconFile, IconUpload, IconX } from "./Icons";

const TEXT_HINTS = ["text", "review", "comment", "body", "content", "feedback"];

async function peekHeader(f: File): Promise<string[]> {
  const head = await f.slice(0, 4096).text();
  const line = head.replace(/^﻿/, "").split(/\r?\n/)[0] || "";
  return line.split(",").map((c) => c.replace(/^"|"$/g, "").trim()).filter(Boolean);
}

export function LivePanel({ config, onStart, onDemo, error }: {
  config: ServerConfig | null;
  onStart: (f: File, hotel: string, city: string) => void;
  onDemo: () => void;
  error?: string | null;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [cols, setCols] = useState<string[]>([]);
  const [hotel, setHotel] = useState("");
  const [city, setCity] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const max = config?.limits.max_upload_bytes ?? 1_000_000;
  const maxReviews = config?.limits.max_reviews ?? 150;

  const pick = async (f: File | undefined | null) => {
    setMsg(null);
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".csv")) return setMsg("That isn't a .csv file. Export your reviews as CSV and try again.");
    if (f.size > max) return setMsg(`That file is ${(f.size / 1e6).toFixed(1)} MB; the limit is ${Math.round(max / 1000)} KB (about ${maxReviews} reviews).`);
    if (f.size < 20) return setMsg("That file looks empty.");
    const header = await peekHeader(f);
    const hasText = header.some((c) => TEXT_HINTS.some((h) => c.toLowerCase().includes(h)));
    setCols(header);
    setFile(f);
    if (!hasText) setMsg("No column named like 'text' or 'review' was found. We'll use the longest text column; check the result.");
  };

  if (config && !config.live_available) {
    return (
      <section className="notice desk-closed" aria-live="polite">
        <IconAlert className="glyph" />
        <div>
          <h3>Live audits are closed for now.</h3>
          <p>{config.live_message}</p>
          <p className="notice-fine">
            Limits protect this free demo: {config.limits.per_ip_daily_runs} runs per visitor per day, {config.limits.global_daily_runs} in total, and a hard spending cap.
          </p>
          <div className="notice-actions">
            <button className="btn btn-primary" onClick={onDemo}>Read the demo edition</button>
            <a className="btn" href="/api/sample.csv" download><IconDownload /> Sample CSV</a>
          </div>
        </div>
      </section>
    );
  }

  const clear = () => { setFile(null); setCols([]); setMsg(null); if (input.current) input.current.value = ""; };
  return (
    <section className="live-panel" aria-labelledby="live-title">
      <header className="live-head">
        <div className="kicker">Run your own</div>
        <h2 id="live-title">Run the night audit on your own guest reviews.</h2>
        <p className="live-lede">
          Upload a CSV; get this week's top issues, likely causes and draft replies. Reviews are used for this run only.
        </p>
      </header>
      <div className="live-grid">
        <div className="live-step">
          <h3 className="step-h"><span className="step-no" aria-hidden>1</span> The reviews</h3>
          <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" id="csv-input"
            onChange={(e) => pick(e.target.files?.[0])} />
          <label htmlFor="csv-input" className={`drop${over ? " over" : ""}${file ? " has-file" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files?.[0]); }}
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.current?.click(); } }}>
            <IconUpload />
            <span className="big">{file ? "Choose a different file" : "Drop a CSV here, or choose a file"}</span>
            <span className="drop-hint">One review per row. Columns like date, rating, text. Up to {maxReviews} reviews.</span>
          </label>
          {file && (
            <div className="file-chip">
              <IconFile />
              <span className="file-name">{file.name}</span>
              <span className="file-size">{(file.size / 1000).toFixed(0)} KB</span>
              <button className="btn btn-sm btn-ghost" onClick={clear} aria-label="Remove file"><IconX /></button>
            </div>
          )}
          {cols.length > 0 && <p className="file-cols">columns: {cols.slice(0, 8).join(", ")}{cols.length > 8 ? "…" : ""}</p>}
          {(msg || error) && <p className="error-inline" role="alert"><IconAlert /> {msg || error}</p>}
          <p className="sample-line">
            <a href="/api/sample.csv" download className="btn btn-sm"><IconDownload /> Download a sample file</a>
            <span>120 synthetic reviews from the demo hotel</span>
          </p>
        </div>
        <div className="live-step">
          <h3 className="step-h"><span className="step-no" aria-hidden>2</span> The hotel</h3>
          <div className="field">
            <label htmlFor="hotel">Hotel name</label>
            <input id="hotel" value={hotel} maxLength={80} onChange={(e) => setHotel(e.target.value)} placeholder="e.g. The Larkspur" />
          </div>
          <div className="field">
            <label htmlFor="city">City</label>
            <input id="city" value={city} maxLength={80} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Austin, Texas" aria-describedby="city-hint" />
            <span className="hint" id="city-hint">Used for local web research (construction, events, suppliers).</span>
          </div>
          <div className="begin-row">
            <button className="btn btn-primary btn-lg" disabled={!file} onClick={() => file && onStart(file, hotel, city)} aria-describedby={file ? undefined : "begin-hint"}>
              Begin the audit
            </button>
            {!file && <span className="hint" id="begin-hint">Choose a CSV first.</span>}
          </div>
          <ul className="limits" aria-label="Live mode limits">
            <li><span>Reviews per upload</span><span>{maxReviews}</span></li>
            <li><span>Your runs left today</span><span>{config ? config.usage.ip_runs_left : "…"}</span></li>
          </ul>
        </div>
      </div>
    </section>
  );
}
