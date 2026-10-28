import type { CSSProperties } from "react";
const paths = {
  dashboard: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  buyers: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  pipeline: "M3 4h5v16H3z M10 4h5v10h-5z M17 4h5v13h-5z",
  settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z",
  arrow: "M5 12h14 M13 6l6 6-6 6", chevron: "m9 5 7 7-7 7", back: "M19 12H5 M11 6l-6 6 6 6",
  search: "M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  sparkles: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z M21 2v4 M19 4h4",
  globe: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M3 12h18 M12 3c5 5 5 13 0 18-5-5-5-13 0-18",
  check: "m5 12 4 4L19 6", mail: "M3 5h18v14H3z m0 0 9 7 9-7",
  clock: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M12 7v5l3 2",
  trend: "m3 17 6-6 4 4 8-10 M15 5h6v6", plus: "M12 5v14 M5 12h14",
  external: "M14 3h7v7 M10 14 21 3 M10 3H3v18h18v-7",
  building: "M4 21V5l8-3 8 3v16 M2 21h20 M8 7h1 M15 7h1 M8 11h1 M15 11h1 M10 21v-5h4v5",
  shield: "m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6z m-5 10 3 3 6-6",
  close: "m6 6 12 12 M6 18 18 6", reset: "M3 11a9 9 0 1 1 2 7 M3 3v8h8",
  info: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M12 11v6 M12 7h.01",
} as const;
export type IconName = keyof typeof paths;
export function Icon({ name, size = 20, className, style }: { name: IconName; size?: number; className?: string; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} style={style}><path d={paths[name]} /></svg>;
}
