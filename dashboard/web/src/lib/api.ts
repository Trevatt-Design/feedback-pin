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
export const ACTOR_KEY = "fp_actor";

/** The reviewer's name, sent as x-fp-actor so decisions are attributed. */
export function readActor(): string {
  try {
    return localStorage.getItem(ACTOR_KEY) || "";
  } catch {
    return "";
  }
}
export function writeActor(name: string): void {
  try {
    if (name.trim()) localStorage.setItem(ACTOR_KEY, name.trim());
    else localStorage.removeItem(ACTOR_KEY);
  } catch {
    /* swallow */
  }
}

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
  const actor = readActor();
  const res = await fetch(API_URL + path, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      ...(actor ? { "x-fp-actor": actor } : {}),
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
export { fmtShort as fmtTime } from "./format";

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
  commenter_name?: string | null;
  x_pct?: number | null;
  y_pct?: number | null;
  viewport_w?: number | null;
  viewport_h?: number | null;
  selector?: string | null;
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
  approvers?: string[];
  /** Review items waiting for a decision. */
  waiting?: number;
}

export function screenshotUrl(key: string): string {
  const token = localStorage.getItem(TOKEN_KEY) || "";
  return (
    API_URL +
    "/v1/screenshots/" +
    key.split("/").map(encodeURIComponent).join("/") +
    "?token=" +
    encodeURIComponent(token)
  );
}

/* ─── Review items (dashboard-review) ─────────────────────────────────── */

export type ItemKind = "question" | "command";
export type ItemOutcome = "answered" | "built-right" | "build-fix" | "missing" | "conflict";
export type ItemStage =
  | "awaiting-decision"
  | "discuss"
  | "approved"
  | "in-figma"
  | "ready-to-build"
  | "built"
  | "closed";

export interface NotionRef {
  label: string;
  url: string;
  quote?: string;
}
export interface ItemDesign {
  figma_url?: string;
  figma_node?: string;
  /** Screenshot key (same bucket as build screenshots) of the designed screen. */
  image_key?: string;
  screen_key?: string;
  notion?: NotionRef[];
}
export interface ItemProposal {
  summary?: string;
  figma_url?: string;
  image_key?: string;
  effects?: string[] | string;
}
export interface ItemRow {
  id: string;
  ref: string;
  round: string | null;
  title: string;
  kind: ItemKind;
  outcome: ItemOutcome;
  verdict: string | null;
  design: string | null;
  proposal: string | null;
  stage: ItemStage;
  decision: string | null;
  decided_by: string | null;
  decided_at: number | null;
  created_at: number;
  updated_at: number;
  comment_ids?: string | null;
}
export interface ItemEvent {
  id: string;
  item_id: string;
  actor: string | null;
  action: string;
  value: string | null;
  note: string | null;
  created_at: number;
}
export interface RoundSummary {
  round: string;
  items: number;
  waiting: number;
}

export function parseJson<T>(s: string | null | undefined): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

export const OUTCOME_LABEL: Record<ItemOutcome, string> = {
  answered: "Answered",
  "built-right": "Already built as designed",
  "build-fix": "Build fix",
  missing: "Missing from the design",
  conflict: "Conflicts with the design",
};
export const STAGE_LABEL: Record<ItemStage, string> = {
  "awaiting-decision": "Needs your decision",
  discuss: "To discuss",
  approved: "Approved, update Figma",
  "in-figma": "In Figma, needs sign-off",
  "ready-to-build": "Ready to build",
  built: "Built, check it",
  closed: "Closed",
};
/** Next stage actions the reviewer can take from each stage (mirrors API STAGE_MOVES). */
export const STAGE_ACTIONS: Partial<Record<ItemStage, Array<{ to: ItemStage; label: string }>>> = {
  approved: [{ to: "in-figma", label: "Updated in Figma" }],
  "in-figma": [{ to: "ready-to-build", label: "Sign off design" }],
  "ready-to-build": [{ to: "built", label: "Mark built" }],
  built: [
    { to: "closed", label: "Close" },
    { to: "ready-to-build", label: "Send back to build" },
  ],
};
export type ReviewFilter = "decide" | "moving" | "closed" | "all";
export function stageInFilter(stage: ItemStage, f: ReviewFilter): boolean {
  if (f === "all") return true;
  if (f === "decide") return stage === "awaiting-decision" || stage === "discuss";
  if (f === "closed") return stage === "closed";
  return stage !== "closed" && stage !== "awaiting-decision" && stage !== "discuss";
}
