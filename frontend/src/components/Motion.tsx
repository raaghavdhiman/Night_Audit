import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useTween } from "../tween";

const reduced = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const counted = new Set<string>(); // count each figure up once per visit, not on every page switch

/**
 * A figure like "600" or "28%" that counts up from 0 the first time it scrolls into view.
 * Screen readers get the true value at once, and the visible text ends as exactly `text`.
 */
export function CountUp({ text, id }: { text: string; id: string }) {
  const m = /^(\d[\d,]*)(.*)$/.exec(text);
  const target = m ? Number(m[1].replace(/,/g, "")) : 0;
  const ref = useRef<HTMLSpanElement>(null);
  const [go, setGo] = useState(() => !m || reduced() || counted.has(id) || typeof IntersectionObserver === "undefined");
  const v = useTween(go ? target : 0, 900);
  useEffect(() => {
    if (go || !ref.current) return;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      counted.add(id);
      setGo(true);
      io.disconnect();
    }, { threshold: 0.3 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [go, id]);
  if (!m) return <>{text}</>;
  const shown = v === target ? text : `${Math.round(v).toLocaleString("en-US")}${m[2]}`;
  return (
    <span ref={ref}>
      <span aria-hidden>{shown}</span>
      <span className="sr-only">{text}</span>
    </span>
  );
}

/** Height + opacity expand. Content stays in the DOM (inert while closed) so the transition has something to grow to. */
export function Collapse({ open, id, children }: { open: boolean; id?: string; children: ReactNode }) {
  return (
    <div className="collapse" data-open={open} id={id} inert={!open} aria-hidden={!open}>
      <div className="collapse-in">{children}</div>
    </div>
  );
}

/** True while `query` matches; follows the viewport as it changes. */
export function useMedia(query: string) {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia?.(query);
      m?.addEventListener("change", cb);
      return () => m?.removeEventListener("change", cb);
    },
    () => !!window.matchMedia?.(query).matches,
  );
}

/** A short fade and slide the first time the block enters the viewport; shown at once without IntersectionObserver or with reduced motion. */
export function Reveal({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(() => reduced() || typeof IntersectionObserver === "undefined");
  useEffect(() => {
    if (shown || !ref.current) return;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      setShown(true);
      io.disconnect();
    });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [shown]);
  return <div ref={ref} className={`reveal${shown ? " in" : ""}${className ? ` ${className}` : ""}`}>{children}</div>;
}
