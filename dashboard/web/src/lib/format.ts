/**
 * Display helpers shared by every dashboard route: British dates, author
 * names, device summaries and pin positions. Pure functions, no DOM.
 */

const GB = "en-GB";

/** Short relative time for lists: "Just now", "5m", "3h", "Yesterday", "Mon", "20 Oct", "20 Oct 2025". */
export function fmtShort(ts: number, now = Date.now()): string {
  const d = Math.max(0, (now - ts) / 1000);
  if (d < 60) return "Just now";
  if (d < 3600) return Math.floor(d / 60) + "m ago";
  if (d < 86400) return Math.floor(d / 3600) + "h ago";
  const date = new Date(ts);
  const today = new Date(now);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const days = Math.floor((startOfToday - new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()) / 86400000);
  if (days <= 1) return "Yesterday";
  if (days < 7) return date.toLocaleDateString(GB, { weekday: "short" });
  if (date.getFullYear() === today.getFullYear())
    return date.toLocaleDateString(GB, { day: "numeric", month: "short" });
  return date.toLocaleDateString(GB, { day: "numeric", month: "short", year: "numeric" });
}

/** Full timestamp for tooltips and detail fields: "Tue 20 Oct 2026, 11:14". */
export function fmtFull(ts: number): string {
  const d = new Date(ts);
  const day = d.toLocaleDateString(GB, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString(GB, { hour: "2-digit", minute: "2-digit" });
  return `${day}, ${time}`;
}

export interface CommentMeta {
  source?: string;
  platform?: string;
  osVersion?: string;
  appearance?: string;
  pathname?: string;
  userAgent?: string;
  ua?: string;
  viewport?: { w?: number; h?: number };
  [k: string]: unknown;
}

export function parseMeta(s: string | null | undefined): CommentMeta | null {
  if (!s) return null;
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" ? (v as CommentMeta) : null;
  } catch {
    return null;
  }
}

/** Where the comment came from, in plain words: "iOS app", "Android app", "Web". */
export function sourceLabel(meta: CommentMeta | null, url: string | null | undefined): string {
  const p = (meta?.platform || "").toLowerCase();
  if (p === "ios") return "iOS app";
  if (p === "android") return "Android app";
  if (meta?.source && /app/i.test(String(meta.source))) return "App";
  if (url && /^https?:/i.test(url)) return "Web";
  return "App";
}

/** A readable author name. Real names win; anonymous ids become "Guest d48c". */
export function authorName(c: {
  commenter_name?: string | null;
  anon_id?: string | null;
  metadata?: string | null;
  url?: string | null;
}): string {
  const n = (c.commenter_name || "").trim();
  if (n) return n;
  if (c.anon_id) {
    const tail = c.anon_id.replace(/^u_/, "").slice(-4);
    return "Guest " + tail;
  }
  return sourceLabel(parseMeta(c.metadata), c.url) + " tester";
}

/** One or two letters for an avatar. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Device line for the detail panel: "iOS 26.5 · Dark · 402×874". */
export function deviceLine(
  meta: CommentMeta | null,
  vw?: number | null,
  vh?: number | null,
): string {
  const bits: string[] = [];
  if (meta?.platform) {
    const p = String(meta.platform);
    const name = p.toLowerCase() === "ios" ? "iOS" : p[0].toUpperCase() + p.slice(1);
    bits.push(meta.osVersion ? `${name} ${meta.osVersion}` : name);
  } else {
    const ua = String(meta?.userAgent || meta?.ua || "");
    if (ua) bits.push(browserFromUa(ua));
  }
  if (meta?.appearance) bits.push(String(meta.appearance)[0].toUpperCase() + String(meta.appearance).slice(1));
  if (vw && vh) bits.push(`${vw}×${vh}`);
  return bits.filter(Boolean).join(" · ");
}

function browserFromUa(ua: string): string {
  const os = /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : "";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  return os ? `${br} on ${os}` : br;
}

/** Pin position as 0..1 fractions; the API stores either fractions or percentages. */
export function pinFraction(v: number | string | null | undefined): number | null {
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (n == null || !isFinite(n)) return null;
  const f = n > 1 ? n / 100 : n;
  return Math.min(1, Math.max(0, f));
}

/** Treat placeholder dashes and blanks as no text. */
export function meaningful(s: string | null | undefined): string {
  const t = (s || "").trim();
  if (!t || /^[-–—.]+$/.test(t)) return "";
  return t;
}

/** Path to show for a page URL, including custom schemes like orbit-dev://product/x. */
export function displayPath(u: string | null | undefined): string {
  if (!u) return "/";
  try {
    const url = new URL(u);
    if (/^https?:$/.test(url.protocol)) return (url.pathname || "/") + (url.search || "");
    // custom scheme: host is the first segment
    return "/" + [url.host, url.pathname.replace(/^\/+/, "")].filter(Boolean).join("/");
  } catch {
    return u;
  }
}

export function isWebUrl(u: string | null | undefined): boolean {
  return !!u && /^https?:\/\//i.test(u);
}
