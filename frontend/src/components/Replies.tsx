import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Reply } from "../types";
import { plural, shortDate } from "../format";
import { Severity } from "./Charts";
import { IconCheck, IconCopy, IconEdit, IconUndo, IconX, Stars } from "./Icons";

type St = { status: "pending" | "approved" | "discarded"; text: string; editing: boolean; at?: string };

const LABEL: Record<string, string> = {
  cleanliness: "cleanliness", room_condition: "room", noise: "noise", facilities: "facilities", front_desk: "front desk",
  housekeeping_service: "housekeeping", food_beverage: "food & beverage", staff_general: "staff", value_price: "price",
  location: "location", safety_security: "safety",
};

function load(key: string): Record<string, St> {
  try {
    return JSON.parse(localStorage.getItem(key) || "{}");
  } catch {
    return {};
  }
}

const PLACEHOLDER = /(\[GM to confirm:[^\]]*\])/g;

/** The draft with its "[GM to confirm: ...]" placeholders marked. */
function withPlaceholders(text: string): ReactNode[] {
  return text.split(PLACEHOLDER).map((part, i) => (i % 2 ? <mark key={i} className="confirm">{part}</mark> : part));
}

/** A textarea that grows with its content (no inner scrollbar). */
function AutoGrow(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`; // + borders
  }, [props.value]);
  return <textarea ref={ref} rows={3} {...props} />;
}

export function Replies({ replies, storeKey, onToast }: { replies: Reply[]; storeKey: string; onToast: (m: string) => void }) {
  const [st, setSt] = useState<Record<string, St>>(() => load(storeKey));
  useEffect(() => setSt(load(storeKey)), [storeKey]);
  useEffect(() => {
    try {
      localStorage.setItem(storeKey, JSON.stringify(st));
    } catch {
      /* storage unavailable: state just won't persist */
    }
  }, [st, storeKey]);

  const get = (r: Reply): St => st[r.review_id] ?? { status: "pending", text: r.draft, editing: false };
  const set = (r: Reply, patch: Partial<St>) => setSt((s) => ({ ...s, [r.review_id]: { ...get(r), ...patch } }));
  const approvedN = replies.filter((r) => get(r).status === "approved").length;

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      onToast("Reply copied to clipboard");
    } catch {
      onToast("Copy failed: select the text and copy manually");
    }
  };

  return (
    <section aria-labelledby="replies-title">
      <div className="section-head">
        <h2 id="replies-title">Correspondence: replies awaiting your signature</h2>
        <span className="aside mono">{approvedN}/{replies.length} approved · nothing is sent</span>
      </div>
      <p className="replies-note">Drafts may commit to actions. Confirm before sending.</p>
      {replies.length === 0 && <p className="muted">No negative reviews needed a reply this period.</p>}
      <div className="replies">
        {replies.map((r) => {
          const s = get(r);
          const id = `reply-${r.review_id}`;
          const toConfirm = s.text.match(PLACEHOLDER)?.length ?? 0;
          return (
            <article key={r.review_id} className={`reply ${s.status}`} aria-labelledby={`${id}-h`}>
              <div className="reply-meta" id={`${id}-h`}>
                <Stars value={r.rating} />
                <span>{shortDate(r.date)}</span>
                <Severity value={r.max_severity} />
                {r.issue_rank ? <span>re: issue #{r.issue_rank}</span> : null}
                <span>{r.aspects.map((a) => LABEL[a.aspect] ?? a.aspect).join(", ")}</span>
              </div>
              <blockquote>“{r.excerpt}”</blockquote>
              {s.status === "discarded" ? (
                <div className="reply-actions">
                  <span className="muted" style={{ fontSize: 13.5 }}>Draft discarded.</span>
                  <button className="btn btn-sm btn-ghost" onClick={() => set(r, { status: "pending" })}><IconUndo /> Undo</button>
                </div>
              ) : (
                <>
                  <div className="draft-label">
                    <label htmlFor={`${id}-t`}>{s.editing ? "Editing draft" : "Draft reply"} · Lightning 3.5</label>
                    {/* the stamp sits in the label row, never over the draft */}
                    {s.status === "approved" && <span className="reply-stamp">Approved{s.at ? ` ${s.at}` : ""}</span>}
                  </div>
                  {s.editing ? (
                    <AutoGrow id={`${id}-t`} value={s.text} onChange={(e) => set(r, { text: e.target.value })} autoFocus />
                  ) : (
                    <div className="draft" id={`${id}-t`}>{s.text ? withPlaceholders(s.text) : "Draft failed to generate."}</div>
                  )}
                  {toConfirm > 0 && <p className="to-confirm">{plural(toConfirm, "placeholder")} for the GM to confirm or delete</p>}
                  <div className="reply-actions">
                    {s.status !== "approved" ? (
                      <button className="btn btn-sm btn-primary" disabled={!s.text.trim()}
                        onClick={() => set(r, { status: "approved", editing: false, at: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) })}>
                        <IconCheck /> Approve
                      </button>
                    ) : (
                      <button className="btn btn-sm" onClick={() => set(r, { status: "pending" })}><IconUndo /> Unapprove</button>
                    )}
                    <button className="btn btn-sm" aria-pressed={s.editing} onClick={() => set(r, { editing: !s.editing, status: "pending" })}>
                      <IconEdit /> {s.editing ? "Done editing" : "Edit"}
                    </button>
                    <button className="btn btn-sm" onClick={() => copy(s.text)} disabled={!s.text.trim()}><IconCopy /> Copy</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => set(r, { status: "discarded", editing: false })}><IconX /> Discard</button>
                    {s.text !== r.draft && (
                      <button className="btn btn-sm btn-ghost" onClick={() => set(r, { text: r.draft })}>Reset</button>
                    )}
                  </div>
                </>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
