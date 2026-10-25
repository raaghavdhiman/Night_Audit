// A small, consistent 16px stroke icon set (1.5px strokes, square caps).
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { title?: string };

function Base({ title, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="square"
      className="icon" aria-hidden={title ? undefined : true} role={title ? "img" : undefined} {...rest}>
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export const IconSearch = (p: P) => <Base {...p}><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5 14 14" /></Base>;
export const IconExternal = (p: P) => <Base {...p}><path d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5M12 9.5v4H2.5V4h4" /></Base>;
export const IconCheck = (p: P) => <Base {...p}><path d="m3 8.5 3 3 7-7" /></Base>;
export const IconX = (p: P) => <Base {...p}><path d="m4 4 8 8M12 4l-8 8" /></Base>;
export const IconEdit = (p: P) => <Base {...p}><path d="M10.5 2.5 13.5 5.5 6 13H3v-3z" /></Base>;
export const IconCopy = (p: P) => <Base {...p}><rect x="5.5" y="5.5" width="8" height="8" /><path d="M10.5 2.5h-8v8" /></Base>;
export const IconUpload = (p: P) => <Base {...p}><path d="M8 11V2.5M4.5 6 8 2.5 11.5 6M2.5 10.5v3h11v-3" /></Base>;
export const IconDownload = (p: P) => <Base {...p}><path d="M8 2.5V11M4.5 7.5 8 11l3.5-3.5M2.5 10.5v3h11v-3" /></Base>;
export const IconChevron = (p: P) => <Base {...p} className="icon chev"><path d="m4 6 4 4 4-4" /></Base>;
export const IconAlert = (p: P) => <Base {...p}><path d="M8 2 14.5 13.5h-13zM8 6.5v3.5M8 11.5v.5" /></Base>;
export const IconMoon = (p: P) => <Base {...p}><path d="M13 9.5A5.5 5.5 0 0 1 6.5 3 5.5 5.5 0 1 0 13 9.5z" /></Base>;
export const IconSun = (p: P) => <Base {...p}><circle cx="8" cy="8" r="2.8" /><path d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3 3l1.1 1.1M11.9 11.9 13 13M3 13l1.1-1.1M11.9 4.1 13 3" /></Base>;
export const IconFile = (p: P) => <Base {...p}><path d="M3.5 1.5h6l3 3v10h-9zM9.5 1.5v3h3" /></Base>;
export const IconPlay = (p: P) => <Base {...p}><path d="M4.5 2.5v11l9-5.5z" /></Base>;
export const IconUndo = (p: P) => <Base {...p}><path d="M5 3 2 6l3 3M2 6h7.5a4 4 0 0 1 0 8H6" /></Base>;
export const IconLedger = (p: P) => <Base {...p}><path d="M2.5 1.5h11v13h-11zM5 4.5h6M5 7.5h6M5 10.5h3.5" /></Base>;
export const IconClock = (p: P) => <Base {...p}><circle cx="8" cy="8" r="6" /><path d="M8 4.5V8l2.5 1.5" /></Base>;

export function Stars({ value }: { value: number | null }) {
  const v = Math.round(value ?? 0);
  return (
    <span className="stars" role="img" aria-label={value === null ? "no rating" : `${v} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} viewBox="0 0 12 12" aria-hidden>
          <path d="M6 .8 7.6 4.2l3.6.4-2.7 2.5.8 3.6L6 8.9 2.7 10.7l.8-3.6L.8 4.6l3.6-.4z"
            fill={i <= v ? "currentColor" : "none"} stroke="currentColor" strokeWidth=".9" />
        </svg>
      ))}
    </span>
  );
}
