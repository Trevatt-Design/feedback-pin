/**
 * Dashboard API client. Extracted verbatim from the previous monolith
 * (dashboard/src/index.ts:161-175). Behaviour is unchanged.
 *
 * The API origin is baked at build time via `import.meta.env.VITE_API_URL`
 * (the build script passes `VITE_API_URL=$API_URL vite build`). No runtime
 * inline `<script>` injection — that's what enables the strict CSP on the
 * Worker-side HTML response.
 */

export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? "";
export const TOKEN_KEY = "fp_token";

export class UnauthorisedError extends Error {
  constructor() {
    super("Unauthorised");
    this.name = "UnauthorisedError";
  }
}

export interface ApiOptions extends RequestInit {
  headers?: Record<string, string>;
}

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY);
  const res = await fetch(API_URL + path, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      authorization: token ? "Bearer " + token : "",
    },
  });
  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    location.hash = "#/login";
    throw new UnauthorisedError();
  }
  if (!res.ok) {
    let m = "Request failed";
    try {
      const j = (await res.json()) as { error?: string };
      m = j.error || m;
    } catch {
      /* swallow */
    }
    throw new Error(m);
  }
  if (res.headers.get("content-type")?.includes("json")) {
    return (await res.json()) as T;
  }
  return res as unknown as T;
}

/** Pure helpers — sort/search/url. Extracted verbatim from the monolith. */
export type SortMode = "newest" | "oldest" | "unresolved";
export function readSortPref(): SortMode {
  try {
    const v = localStorage.getItem("fp_sort");
    if (v === "newest" || v === "oldest" || v === "unresolved") return v;
  } catch {
    /* swallow */
  }
  return "newest";
}
export function commentMatchesQuery(
  c: {
    change_text?: string | null;
    why_text?: string | null;
    url?: string | null;
  },
  qLower: string,
): boolean {
  return (
    (c.change_text || "").toLowerCase().includes(qLower) ||
    (c.why_text || "").toLowerCase().includes(qLower) ||
    (c.url || "").toLowerCase().includes(qLower)
  );
}
export function sortComments<T extends { created_at: number; status: string }>(items: T[], mode: SortMode): T[] {
  const copy = items.slice();
  if (mode === "oldest") {
    copy.sort((a, b) => a.created_at - b.created_at);
  } else if (mode === "unresolved") {
    // open + in-progress bucket before resolved + wont-fix; within each
    // group, newest first.
    copy.sort((a, b) => {
      const ao = a.status === "open" || a.status === "in-progress" ? 0 : 1;
      const bo = b.status === "open" || b.status === "in-progress" ? 0 : 1;
      if (ao !== bo) return ao - bo;
      return b.created_at - a.created_at;
    });
  } else {
    copy.sort((a, b) => b.created_at - a.created_at);
  }
  return copy;
}
export function urlPathname(u: string | null | undefined): string {
  if (!u) return "/";
  try {
    return new URL(u).pathname || "/";
  } catch {
    return u || "/";
  }
}
export function fmtTime(ts: number): string {
  const d = (Date.now() - ts) / 1000;
  if (d < 60) return "just now";
  if (d < 3600) return Math.round(d / 60) + "m ago";
  if (d < 86400) return Math.round(d / 3600) + "h ago";
  return new Date(ts).toLocaleString();
}

/** Status enum + display mapping. Mirror of widget/src/ui.ts STATUS_OPTIONS. */
export type CommentStatus = "open" | "in-progress" | "wont-fix" | "resolved";
export const STATUS_OPTIONS: ReadonlyArray<{ value: CommentStatus; label: string }> = [
  { value: "open", label: "Open" },
  { value: "in-progress", label: "In progress" },
  { value: "wont-fix", label: "Won't fix" },
  { value: "resolved", label: "Resolved" },
];
export function statusLabel(s: string): string {
  for (const o of STATUS_OPTIONS) if (o.value === s) return o.label;
  return s;
}
export function isClosedStatus(s: string): boolean {
  return s === "resolved" || s === "wont-fix";
}

/** Comment shape used across the dashboard. Subset of the API row. */
export interface Comment {
  id: string;
  url: string;
  change_text: string;
  why_text: string | null;
  what?: string | null;
  anon_id: string | null;
  site_wide: number | boolean;
  status: CommentStatus;
  created_at: number;
  resolved_at: number | null;
  screenshot_key: string | null;
  metadata: string | null;
}
export interface Reply {
  id: string;
  comment_id: string;
  author: string;
  body: string;
  created_at: number;
}
export interface Project {
  id?: string;
  name?: string;
  share_token?: string;
}
