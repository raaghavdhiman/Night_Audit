import type { AuditResult, PipelineEvent, ServerConfig } from "./types";

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function json<T>(r: Response): Promise<T> {
  if (!r.ok) {
    let body: { error?: string; code?: string } = {};
    try {
      body = await r.json();
    } catch {
      /* not json */
    }
    throw new ApiError(body.error || `Request failed (${r.status})`, body.code || "http", r.status);
  }
  return r.json() as Promise<T>;
}

export const getDemo = () => fetch("/api/demo").then((r) => json<AuditResult>(r));
export const getConfig = () => fetch("/api/config").then((r) => json<ServerConfig>(r));

/** POST the CSV and read the SSE stream (fetch, because EventSource cannot POST). */
export async function analyze(
  file: File,
  hotel: string,
  city: string,
  onEvent: (e: PipelineEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("hotel", hotel);
  fd.append("city", city);
  const r = await fetch("/api/analyze", { method: "POST", body: fd, signal });
  const type = r.headers.get("content-type") || "";
  if (!r.ok || !type.includes("text/event-stream")) {
    await json(r); // throws ApiError with the server's message
    throw new ApiError("Unexpected response from server", "http", r.status);
  }
  const reader = r.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) !== -1) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const data = chunk
        .split("\n")
        .filter((l) => l.startsWith("data: "))
        .map((l) => l.slice(6))
        .join("\n");
      if (data) onEvent(JSON.parse(data));
    }
  }
}
