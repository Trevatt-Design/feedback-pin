/**
 * feedback-pin API — Cloudflare Worker (v2)
 *
 * Routes (all under /v1 except /health):
 *   POST   /v1/comments                  create  (project token + optional anon_id)
 *   GET    /v1/comments                  list    (filters: status, url)
 *   GET    /v1/comments/:id              detail with replies
 *   PATCH  /v1/comments/:id              edit own (anon_id must match)
 *   DELETE /v1/comments/:id              delete own (anon_id must match)
 *   POST   /v1/comments/:id/replies      reply
 *   POST   /v1/comments/:id/resolve      resolve
 *   POST   /v1/comments/:id/reopen       reopen
 *   POST   /v1/screenshots               upload
 *   GET    /v1/screenshots/:key          serve
 *   GET    /v1/projects/me               project info
 *   GET    /v1/public/project?share=T    public read-only project info
 *   GET    /v1/public/comments?share=T   public read-only open comments
 *   GET    /v1/public/screenshots/:key?share=T
 *
 * Auth:
 *   - Project routes: `Authorization: Bearer <project_token>` or `?token=`
 *   - Anon-owned actions: also require `x-fp-uid: <anon_id>` header
 *   - Public routes: `?share=<share_token>` query
 */

export interface Env {
  DB: D1Database;
  SCREENSHOTS: R2Bucket;
  MAX_COMMENT_BYTES: string;
  MAX_SCREENSHOT_BYTES: string;
  /** Set via `wrangler secret put ANTHROPIC_API_KEY`. Optional — without it, /v1/inference returns 503. */
  ANTHROPIC_API_KEY?: string;
}

interface Project {
  id: string;
  name: string;
  token: string;
  origin: string | null;
  share_token: string | null;
  created_at: number;
}

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

const ALLOWED_STATUS = new Set(["open", "in-progress", "wont-fix", "resolved"]);

function corsHeaders(origin: string | null, allowed: string | null): Record<string, string> {
  const allow = allowed ? (origin === allowed ? origin : "") : (origin ?? "*");
  return {
    "access-control-allow-origin": allow || "null",
    "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "access-control-allow-headers": "authorization, content-type, x-fp-uid, x-fp-actor",
    "access-control-max-age": "86400",
    "vary": "origin",
  };
}

function json(data: unknown, init: ResponseInit = {}, extra: HeadersInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { ...JSON_HEADERS, ...(init.headers as Record<string, string> ?? {}), ...(extra as Record<string, string>) },
  });
}

function err(status: number, message: string, headers: HeadersInit = {}) {
  return json({ error: message }, { status }, headers);
}

const uuid = () => crypto.randomUUID();
const now = () => Date.now();

async function getProjectFromRequest(req: Request, env: Env): Promise<Project | null> {
  const auth = req.headers.get("authorization") || "";
  const url = new URL(req.url);
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : url.searchParams.get("token");
  if (!token) return null;
  return await env.DB.prepare("SELECT * FROM projects WHERE token = ?").bind(token).first<Project>() ?? null;
}

async function getProjectFromShare(req: Request, env: Env): Promise<Project | null> {
  const url = new URL(req.url);
  const share = url.searchParams.get("share");
  if (!share) return null;
  return await env.DB.prepare("SELECT * FROM projects WHERE share_token = ?").bind(share).first<Project>() ?? null;
}

interface CreateCommentBody {
  url?: string;
  selector?: string;
  dom_path?: string;
  x_pct?: number;
  y_pct?: number;
  viewport_w?: number;
  viewport_h?: number;
  screenshot_key?: string;
  what?: string;
  change_text?: string;
  why_text?: string;
  site_wide?: boolean;
  metadata?: unknown;
  anon_id?: string;
}

function validateCreate(b: unknown): { ok: true; value: CreateCommentBody } | { ok: false; error: string } {
  if (!b || typeof b !== "object") return { ok: false, error: "body required" };
  const o = b as Record<string, unknown>;
  if (typeof o.change_text !== "string" || o.change_text.trim().length === 0) return { ok: false, error: "change_text required" };
  if (o.change_text.length > 4000) return { ok: false, error: "change_text too long" };
  if (typeof o.why_text !== "string" || o.why_text.trim().length === 0) return { ok: false, error: "why_text required" };
  if (o.why_text.length > 4000) return { ok: false, error: "why_text too long" };
  if (typeof o.url !== "string" || o.url.length === 0 || o.url.length > 2000) return { ok: false, error: "url required" };
  return { ok: true, value: o as CreateCommentBody };
}

async function routeCreateComment(req: Request, env: Env, project: Project): Promise<Response> {
  if (project.origin) {
    const origin = req.headers.get("origin");
    if (origin && origin !== project.origin) return err(403, "origin not allowed");
  }
  const max = parseInt(env.MAX_COMMENT_BYTES || "10000", 10);
  const text = await req.text();
  if (text.length > max) return err(413, "comment too large");
  if (text.includes('"website"')) return err(400, "spam guard");
  let body: unknown;
  try { body = JSON.parse(text); } catch { return err(400, "invalid json"); }
  const v = validateCreate(body);
  if (!v.ok) return err(400, v.error);
  const c = v.value;
  const anonId = (req.headers.get("x-fp-uid") || c.anon_id || "").slice(0, 64) || null;
  const id = uuid();
  const metaJson = c.metadata ? JSON.stringify(c.metadata).slice(0, 4000) : null;
  await env.DB.prepare(
    `INSERT INTO comments
      (id, project_id, url, selector, dom_path, x_pct, y_pct, viewport_w, viewport_h,
       screenshot_key, what, change_text, why_text, anon_id, site_wide, metadata,
       commenter_name, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'open', ?)`
  ).bind(
    id, project.id, c.url ?? "", c.selector ?? null, c.dom_path ?? null,
    c.x_pct ?? null, c.y_pct ?? null, c.viewport_w ?? null, c.viewport_h ?? null,
    c.screenshot_key ?? null, c.what ?? null, c.change_text!.trim(),
    c.why_text!.trim(), anonId, c.site_wide ? 1 : 0, metaJson, now()
  ).run();
  return json({ id, status: "open" }, { status: 201 });
}

async function routeListComments(_req: Request, env: Env, project: Project, url: URL): Promise<Response> {
  const status = url.searchParams.get("status");
  const pageUrl = url.searchParams.get("url");
  const conditions: string[] = ["project_id = ?"];
  const binds: (string | number)[] = [project.id];
  if (status && ALLOWED_STATUS.has(status)) { conditions.push("status = ?"); binds.push(status); }
  if (pageUrl) { conditions.push("url = ?"); binds.push(pageUrl); }
  const sql = `SELECT * FROM comments WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT 500`;
  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  return json({ comments: results });
}

async function routeGetComment(_req: Request, env: Env, project: Project, id: string): Promise<Response> {
  const c = await env.DB.prepare("SELECT * FROM comments WHERE id = ? AND project_id = ?").bind(id, project.id).first();
  if (!c) return err(404, "not found");
  const replies = await env.DB.prepare("SELECT * FROM replies WHERE comment_id = ? ORDER BY created_at ASC").bind(id).all();
  return json({ comment: c, replies: replies.results });
}

async function routePatchComment(req: Request, env: Env, project: Project, id: string): Promise<Response> {
  const anonId = req.headers.get("x-fp-uid");
  if (!anonId) return err(401, "uid required");
  const row = await env.DB.prepare("SELECT anon_id FROM comments WHERE id = ? AND project_id = ?").bind(id, project.id).first<{ anon_id: string }>();
  if (!row) return err(404, "not found");
  if (row.anon_id !== anonId) return err(403, "not the author");
  const body = await req.json().catch(() => null) as { change_text?: string; why_text?: string; site_wide?: boolean } | null;
  if (!body) return err(400, "body required");
  const sets: string[] = [];
  const binds: (string | number)[] = [];
  if (typeof body.change_text === "string" && body.change_text.trim()) { sets.push("change_text = ?"); binds.push(body.change_text.trim().slice(0, 4000)); }
  if (typeof body.why_text === "string" && body.why_text.trim()) { sets.push("why_text = ?"); binds.push(body.why_text.trim().slice(0, 4000)); }
  if (typeof body.site_wide === "boolean") { sets.push("site_wide = ?"); binds.push(body.site_wide ? 1 : 0); }
  if (!sets.length) return err(400, "nothing to update");
  sets.push("updated_at = ?"); binds.push(now());
  binds.push(id, project.id);
  await env.DB.prepare(`UPDATE comments SET ${sets.join(", ")} WHERE id = ? AND project_id = ?`).bind(...binds).run();
  return json({ ok: true });
}

async function routeDeleteComment(req: Request, env: Env, project: Project, id: string): Promise<Response> {
  const anonId = req.headers.get("x-fp-uid");
  if (!anonId) return err(401, "uid required");
  const row = await env.DB.prepare("SELECT anon_id FROM comments WHERE id = ? AND project_id = ?").bind(id, project.id).first<{ anon_id: string }>();
  if (!row) return err(404, "not found");
  // Designers (using project token but no matching anon_id) can also delete — they own the project.
  // Anonymous commenters can only delete their own.
  // We don't currently distinguish "designer client" from "browser client", so for v1 the rule is:
  // delete is allowed if anon_id matches the row OR there's no anon_id on the row (legacy).
  if (row.anon_id && row.anon_id !== anonId) return err(403, "not the author");
  await env.DB.prepare("DELETE FROM replies WHERE comment_id = ?").bind(id).run();
  await env.DB.prepare("DELETE FROM comments WHERE id = ? AND project_id = ?").bind(id, project.id).run();
  return json({ ok: true });
}

async function routeReply(req: Request, env: Env, project: Project, id: string): Promise<Response> {
  const c = await env.DB.prepare("SELECT id FROM comments WHERE id = ? AND project_id = ?").bind(id, project.id).first();
  if (!c) return err(404, "not found");
  const body = await req.json().catch(() => null) as { author?: string; body?: string } | null;
  if (!body || typeof body.body !== "string" || body.body.trim().length === 0) return err(400, "body required");
  if (body.body.length > 4000) return err(400, "body too long");
  const author = (body.author === "designer" || body.author === "client") ? body.author : "client";
  const anonId = req.headers.get("x-fp-uid")?.slice(0, 64) || null;
  const replyId = uuid();
  await env.DB.prepare(
    `INSERT INTO replies (id, comment_id, author, body, anon_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(replyId, id, author, body.body.trim(), anonId, now()).run();
  return json({ id: replyId }, { status: 201 });
}

/**
 * Shared write path for status mutations. Used by /resolve, /reopen, and the
 * generic /status action. resolved_at is stamped only when transitioning into
 * "resolved"; any other status clears it.
 */
async function setStatusOnRow(env: Env, project: Project, id: string, status: string): Promise<{ changed: boolean }> {
  const res = await env.DB.prepare(
    `UPDATE comments SET status = ?, resolved_at = ? WHERE id = ? AND project_id = ?`
  ).bind(status, status === "resolved" ? now() : null, id, project.id).run();
  return { changed: !!res.meta.changes };
}

async function routeResolve(_req: Request, env: Env, project: Project, id: string, resolved: boolean): Promise<Response> {
  const { changed } = await setStatusOnRow(env, project, id, resolved ? "resolved" : "open");
  if (!changed) return err(404, "not found");
  return json({ ok: true });
}

async function routeStatus(req: Request, env: Env, project: Project, id: string): Promise<Response> {
  const body = await req.json().catch(() => null) as { status?: unknown } | null;
  if (!body || typeof body.status !== "string" || !ALLOWED_STATUS.has(body.status)) {
    return err(400, "invalid status");
  }
  const { changed } = await setStatusOnRow(env, project, id, body.status);
  if (!changed) return err(404, "not found");
  return json({ ok: true });
}

async function routeUploadScreenshot(req: Request, env: Env, project: Project): Promise<Response> {
  const max = parseInt(env.MAX_SCREENSHOT_BYTES || "2000000", 10);
  const ct = req.headers.get("content-type") || "";
  if (!ct.startsWith("image/")) return err(415, "image required");
  const buf = await req.arrayBuffer();
  if (buf.byteLength > max) return err(413, "screenshot too large");
  const ext = ct.includes("png") ? "png" : ct.includes("webp") ? "webp" : "jpg";
  const key = `${project.id}/${uuid()}.${ext}`;
  await env.SCREENSHOTS.put(key, buf, { httpMetadata: { contentType: ct } });
  return json({ key }, { status: 201 });
}

async function routeServeScreenshot(_req: Request, env: Env, project: Project, key: string): Promise<Response> {
  if (!key.startsWith(project.id + "/")) return err(403, "forbidden");
  const obj = await env.SCREENSHOTS.get(key);
  if (!obj) return err(404, "not found");
  return new Response(obj.body, {
    headers: {
      "content-type": obj.httpMetadata?.contentType ?? "application/octet-stream",
      "cache-control": "private, max-age=3600",
    },
  });
}

async function routeProjectInfo(_req: Request, env: Env, project: Project): Promise<Response> {
  // `waiting` = review items needing a decision; drives the dashboard nav badge.
  const w = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM items WHERE project_id = ? AND stage IN ('awaiting-decision','discuss')"
  ).bind(project.id).first<{ n: number }>().catch(() => null);
  return json({ id: project.id, name: project.name, origin: project.origin, share_token: project.share_token, approvers: approversOf(project as Project & { approvers?: string | null }), waiting: w?.n ?? 0 });
}

// ─── Review items (api-review-items) ─────────────────────────────────────────
//
// An item is one thing to act on, made by triage from one or more comments.
// Outcomes say what the check found; stages say where the item is in the loop:
//
//   answered, built-right          -> closed straight away (reply only)
//   build-fix                      -> ready-to-build -> built -> closed
//   missing, conflict              -> awaiting-decision
//        approve -> approved -> in-figma -> ready-to-build -> built -> closed
//        decline -> closed
//        discuss -> discuss (decide again later)
//
// Decisions and the Figma sign-off (in-figma -> ready-to-build) need an actor
// on the project's approver list. Every change is written to item_events.

const ITEM_KINDS = new Set(["question", "command"]);
const ITEM_OUTCOMES = new Set(["answered", "built-right", "build-fix", "missing", "conflict"]);
const ITEM_STAGES = new Set([
  "awaiting-decision", "discuss", "approved", "in-figma", "ready-to-build", "built", "closed",
]);
const DECISIONS: Record<string, string> = { approve: "approved", decline: "closed", discuss: "discuss" };
/** stage -> stages it may move to through /stage (decisions use /decision). */
const STAGE_MOVES: Record<string, { to: string[]; approverOnly: boolean }> = {
  "approved": { to: ["in-figma"], approverOnly: false },
  "in-figma": { to: ["ready-to-build"], approverOnly: true },
  "ready-to-build": { to: ["built"], approverOnly: false },
  "built": { to: ["closed", "ready-to-build"], approverOnly: false },
};
const OUTCOME_LABEL: Record<string, string> = {
  "answered": "Answered",
  "built-right": "Already built as designed",
  "build-fix": "Build fix",
  "missing": "Missing from the design",
  "conflict": "Conflicts with the design",
};

function initialStage(outcome: string): string {
  if (outcome === "answered" || outcome === "built-right") return "closed";
  if (outcome === "build-fix") return "ready-to-build";
  return "awaiting-decision";
}

function actorOf(req: Request): string | null {
  const a = req.headers.get("cf-access-authenticated-user-email") || req.headers.get("x-fp-actor") || "";
  const t = a.trim().slice(0, 120);
  return t || null;
}

function approversOf(project: Project & { approvers?: string | null }): string[] {
  try {
    const v = JSON.parse(project.approvers || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch { return []; }
}

function isApprover(project: Project, actor: string | null): boolean {
  if (!actor) return false;
  const list = approversOf(project as Project & { approvers?: string | null });
  if (!list.length) return true; // no list set: any named actor may decide (local use)
  return list.some((a) => a.toLowerCase() === actor.toLowerCase());
}

async function logEvent(env: Env, itemId: string, actor: string | null, action: string, value: string | null, note: string | null) {
  await env.DB.prepare(
    `INSERT INTO item_events (id, item_id, actor, action, value, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(uuid(), itemId, actor, action, value, note, now()).run();
}

function jsonField(v: unknown, max = 8000): string | null {
  if (v === undefined || v === null) return null;
  const s = JSON.stringify(v);
  if (s.length > max) throw new Error("field too large");
  return s;
}

async function nextRef(env: Env, project: Project): Promise<string> {
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM items WHERE project_id = ?").bind(project.id).first<{ n: number }>();
  return "FB-" + String((row?.n ?? 0) + 1).padStart(3, "0");
}

interface CreateItemBody {
  comment_ids?: unknown;
  round?: unknown;
  title?: unknown;
  kind?: unknown;
  outcome?: unknown;
  verdict?: unknown;
  design?: unknown;
  proposal?: unknown;
  reply?: unknown;
}

async function routeCreateItem(req: Request, env: Env, project: Project): Promise<Response> {
  const b = await req.json().catch(() => null) as CreateItemBody | null;
  if (!b) return err(400, "body required");
  if (!Array.isArray(b.comment_ids) || !b.comment_ids.length || !b.comment_ids.every((x) => typeof x === "string")) return err(400, "comment_ids required");
  if (typeof b.title !== "string" || !b.title.trim() || b.title.length > 200) return err(400, "title required");
  if (typeof b.kind !== "string" || !ITEM_KINDS.has(b.kind)) return err(400, "invalid kind");
  if (typeof b.outcome !== "string" || !ITEM_OUTCOMES.has(b.outcome)) return err(400, "invalid outcome");
  if (b.kind === "question" && b.outcome !== "answered") return err(400, "a question can only be answered");
  if (b.verdict !== undefined && (typeof b.verdict !== "string" || b.verdict.length > 4000)) return err(400, "invalid verdict");
  const ids = b.comment_ids as string[];
  for (const cid of ids) {
    const c = await env.DB.prepare("SELECT id FROM comments WHERE id = ? AND project_id = ?").bind(cid, project.id).first();
    if (!c) return err(404, "comment not found: " + cid);
  }
  let design: string | null, proposal: string | null;
  try { design = jsonField(b.design); proposal = jsonField(b.proposal); } catch { return err(413, "design or proposal too large"); }
  const id = uuid();
  const ref = await nextRef(env, project);
  const stage = initialStage(b.outcome);
  const t = now();
  const round = typeof b.round === "string" && b.round.trim() ? b.round.trim().slice(0, 40) : new Date(t).toISOString().slice(0, 10);
  await env.DB.prepare(
    `INSERT INTO items (id, project_id, ref, round, title, kind, outcome, verdict, design, proposal, stage, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, project.id, ref, round, b.title.trim(), b.kind, b.outcome, (b.verdict as string | undefined)?.trim() ?? null, design, proposal, stage, t, t).run();
  for (const cid of ids) {
    await env.DB.prepare("INSERT OR IGNORE INTO item_comments (item_id, comment_id) VALUES (?, ?)").bind(id, cid).run();
  }
  const actor = actorOf(req) ?? "triage";
  await logEvent(env, id, actor, "created", stage, null);
  // Reply where the comment was left, so the commenter sees the outcome.
  const replyText = typeof b.reply === "string" && b.reply.trim()
    ? b.reply.trim().slice(0, 4000)
    : `${ref} · ${OUTCOME_LABEL[b.outcome]}${b.verdict ? ": " + (b.verdict as string).trim() : ""}`.slice(0, 4000);
  for (const cid of ids) {
    await env.DB.prepare(`INSERT INTO replies (id, comment_id, author, body, anon_id, created_at) VALUES (?, ?, 'designer', ?, NULL, ?)`)
      .bind(uuid(), cid, replyText, t).run();
    await syncCommentStatus(env, project, cid);
  }
  return json({ id, ref, stage }, { status: 201 });
}

/** A comment is resolved once every item made from it is closed, in progress otherwise. */
async function syncCommentStatus(env: Env, project: Project, commentId: string) {
  const r = await env.DB.prepare(
    `SELECT COUNT(*) AS total, SUM(CASE WHEN i.stage = 'closed' THEN 1 ELSE 0 END) AS closed
     FROM item_comments ic JOIN items i ON i.id = ic.item_id WHERE ic.comment_id = ? AND i.project_id = ?`
  ).bind(commentId, project.id).first<{ total: number; closed: number }>();
  if (!r || !r.total) return;
  await setStatusOnRow(env, project, commentId, r.closed === r.total ? "resolved" : "in-progress");
}

async function syncItemComments(env: Env, project: Project, itemId: string) {
  const { results } = await env.DB.prepare("SELECT comment_id FROM item_comments WHERE item_id = ?").bind(itemId).all<{ comment_id: string }>();
  for (const r of results) await syncCommentStatus(env, project, r.comment_id);
}

async function routeListItems(_req: Request, env: Env, project: Project, url: URL): Promise<Response> {
  const conditions = ["i.project_id = ?"];
  const binds: (string | number)[] = [project.id];
  const round = url.searchParams.get("round");
  const stage = url.searchParams.get("stage");
  if (round) { conditions.push("i.round = ?"); binds.push(round); }
  if (stage && ITEM_STAGES.has(stage)) { conditions.push("i.stage = ?"); binds.push(stage); }
  const { results } = await env.DB.prepare(
    `SELECT i.*, (SELECT GROUP_CONCAT(comment_id) FROM item_comments WHERE item_id = i.id) AS comment_ids
     FROM items i WHERE ${conditions.join(" AND ")} ORDER BY i.ref ASC LIMIT 500`
  ).bind(...binds).all();
  const rounds = await env.DB.prepare(
    `SELECT round, COUNT(*) AS items, SUM(CASE WHEN stage IN ('awaiting-decision','discuss') THEN 1 ELSE 0 END) AS waiting
     FROM items WHERE project_id = ? GROUP BY round ORDER BY round DESC`
  ).bind(project.id).all();
  return json({ items: results, rounds: rounds.results });
}

async function routeGetItem(_req: Request, env: Env, project: Project, id: string): Promise<Response> {
  const item = await env.DB.prepare("SELECT * FROM items WHERE id = ? AND project_id = ?").bind(id, project.id).first();
  if (!item) return err(404, "not found");
  const comments = await env.DB.prepare(
    `SELECT c.* FROM comments c JOIN item_comments ic ON ic.comment_id = c.id WHERE ic.item_id = ? ORDER BY c.created_at ASC`
  ).bind(id).all();
  const events = await env.DB.prepare("SELECT * FROM item_events WHERE item_id = ? ORDER BY created_at ASC").bind(id).all();
  return json({ item, comments: comments.results, events: events.results, approvers: approversOf(project as Project & { approvers?: string | null }) });
}

async function routePatchItem(req: Request, env: Env, project: Project, id: string): Promise<Response> {
  const item = await env.DB.prepare("SELECT * FROM items WHERE id = ? AND project_id = ?").bind(id, project.id).first<{ stage: string }>();
  if (!item) return err(404, "not found");
  const b = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!b) return err(400, "body required");
  const sets: string[] = [];
  const binds: (string | number | null)[] = [];
  if (typeof b.title === "string" && b.title.trim()) { sets.push("title = ?"); binds.push(b.title.trim().slice(0, 200)); }
  if (typeof b.verdict === "string") { sets.push("verdict = ?"); binds.push(b.verdict.trim().slice(0, 4000)); }
  if (typeof b.round === "string" && b.round.trim()) { sets.push("round = ?"); binds.push(b.round.trim().slice(0, 40)); }
  try {
    if ("design" in b) { sets.push("design = ?"); binds.push(jsonField(b.design)); }
    if ("proposal" in b) { sets.push("proposal = ?"); binds.push(jsonField(b.proposal)); }
  } catch { return err(413, "design or proposal too large"); }
  if (Array.isArray(b.add_comment_ids)) {
    for (const cid of b.add_comment_ids) {
      if (typeof cid !== "string") continue;
      const c = await env.DB.prepare("SELECT id FROM comments WHERE id = ? AND project_id = ?").bind(cid, project.id).first();
      if (!c) return err(404, "comment not found: " + cid);
      await env.DB.prepare("INSERT OR IGNORE INTO item_comments (item_id, comment_id) VALUES (?, ?)").bind(id, cid).run();
    }
    await syncItemComments(env, project, id);
  }
  if (!sets.length && !Array.isArray(b.add_comment_ids)) return err(400, "nothing to update");
  if (sets.length) {
    sets.push("updated_at = ?"); binds.push(now());
    binds.push(id, project.id);
    await env.DB.prepare(`UPDATE items SET ${sets.join(", ")} WHERE id = ? AND project_id = ?`).bind(...binds).run();
  }
  await logEvent(env, id, actorOf(req) ?? "triage", "triaged", null, null);
  return json({ ok: true });
}

async function routeDecision(req: Request, env: Env, project: Project, id: string): Promise<Response> {
  const actor = actorOf(req);
  if (!actor) return err(401, "actor required");
  if (!isApprover(project, actor)) return err(403, "not an approver");
  const b = await req.json().catch(() => null) as { decision?: unknown; note?: unknown } | null;
  if (!b || typeof b.decision !== "string" || !(b.decision in DECISIONS)) return err(400, "invalid decision");
  const note = typeof b.note === "string" ? b.note.trim().slice(0, 4000) : "";
  if (b.decision !== "approve" && !note) return err(400, "a note is required to decline or discuss");
  const item = await env.DB.prepare("SELECT stage FROM items WHERE id = ? AND project_id = ?").bind(id, project.id).first<{ stage: string }>();
  if (!item) return err(404, "not found");
  if (item.stage !== "awaiting-decision" && item.stage !== "discuss") return err(409, "item is not waiting for a decision");
  const stage = DECISIONS[b.decision];
  const t = now();
  await env.DB.prepare(
    `UPDATE items SET decision = ?, decided_by = ?, decided_at = ?, stage = ?, updated_at = ? WHERE id = ? AND project_id = ?`
  ).bind(b.decision, actor, t, stage, t, id, project.id).run();
  await logEvent(env, id, actor, "decision", b.decision, note || null);
  await syncItemComments(env, project, id);
  return json({ ok: true, stage });
}

async function routeItemStage(req: Request, env: Env, project: Project, id: string): Promise<Response> {
  const actor = actorOf(req);
  if (!actor) return err(401, "actor required");
  const b = await req.json().catch(() => null) as { stage?: unknown; note?: unknown } | null;
  if (!b || typeof b.stage !== "string" || !ITEM_STAGES.has(b.stage)) return err(400, "invalid stage");
  const item = await env.DB.prepare("SELECT stage FROM items WHERE id = ? AND project_id = ?").bind(id, project.id).first<{ stage: string }>();
  if (!item) return err(404, "not found");
  const move = STAGE_MOVES[item.stage];
  if (!move || !move.to.includes(b.stage)) return err(409, `cannot move from ${item.stage} to ${b.stage}`);
  if (move.approverOnly && !isApprover(project, actor)) return err(403, "not an approver");
  await env.DB.prepare("UPDATE items SET stage = ?, updated_at = ? WHERE id = ? AND project_id = ?").bind(b.stage, now(), id, project.id).run();
  await logEvent(env, id, actor, "stage", b.stage, typeof b.note === "string" ? b.note.trim().slice(0, 4000) || null : null);
  await syncItemComments(env, project, id);
  return json({ ok: true, stage: b.stage });
}

/** Comments with no item yet: the triage queue. */
async function routeTriageQueue(_req: Request, env: Env, project: Project): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT c.* FROM comments c WHERE c.project_id = ? AND c.status IN ('open','in-progress')
     AND NOT EXISTS (SELECT 1 FROM item_comments ic WHERE ic.comment_id = c.id) ORDER BY c.created_at ASC LIMIT 500`
  ).bind(project.id).all();
  return json({ comments: results });
}

async function routeSetApprovers(req: Request, env: Env, project: Project): Promise<Response> {
  const b = await req.json().catch(() => null) as { approvers?: unknown } | null;
  if (!b || !Array.isArray(b.approvers) || !b.approvers.every((x) => typeof x === "string" && x.trim())) return err(400, "approvers must be a list of names");
  const current = approversOf(project as Project & { approvers?: string | null });
  const actor = actorOf(req);
  if (current.length && !isApprover(project, actor)) return err(403, "not an approver");
  const list = (b.approvers as string[]).map((x) => x.trim().slice(0, 120)).slice(0, 20);
  await env.DB.prepare("UPDATE projects SET approvers = ? WHERE id = ?").bind(JSON.stringify(list), project.id).run();
  return json({ approvers: list });
}

// ─── AI inference (api-inference-endpoint) ────────────────────────────────────

interface InferenceInput {
  comment?: string;
  why?: string;
  target?: { tag?: string; classes?: string[]; text?: string; description?: string };
  cohortCount?: number;
  isStyleAnchor?: boolean;
  surroundingContext?: string;
}

interface InferenceOutput {
  refined_target?: string;
  scope: "single" | "cohort" | "global";
  confidence: number;
  clarification?: { question: string; options: string[] };
}

const INFERENCE_SYSTEM_PROMPT = `You are an intent-disambiguation classifier for a website feedback tool. The user has clicked an element and typed a comment about a desired change. Your job is to figure out what they actually meant: which element they're referring to, and how broadly the change should apply (just this one, the cohort of similar elements visible on this page, or globally site-wide).

Output STRICT JSON matching:
{
  "refined_target": "<one-line description of the element you think they actually meant, or omit if same as input>",
  "scope": "single" | "cohort" | "global",
  "confidence": 0.0 to 1.0,
  "clarification": { "question": "...", "options": ["...", "..."] }   // include only if confidence < 0.7
}

Rules:
- "single" — change just this one instance.
- "cohort" — apply to the visible peers of the same kind on this page.
- "global" — apply across the whole site as a token/style change.
- Heading tags (h1-h6) and primary buttons usually imply "global" because they represent design tokens.
- Pronouns like "this", "it", "they" referring to children of a wrapper element should resolve to the most prominent style anchor child.
- If the comment is genuinely ambiguous, set confidence below 0.7 and include a clarification with two or three concise options.
- Never return prose outside the JSON. No code fences. No commentary.`;

async function callAnthropic(apiKey: string, input: InferenceInput): Promise<InferenceOutput> {
  const userMessage = JSON.stringify({
    comment: input.comment ?? "",
    why: input.why ?? "",
    target: input.target ?? {},
    cohortCount: input.cohortCount ?? 1,
    isStyleAnchor: !!input.isStyleAnchor,
    surroundingContext: input.surroundingContext ?? "",
  });

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 400,
      system: INFERENCE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    }),
  });
  if (!r.ok) throw new Error(`anthropic ${r.status}: ${await r.text().catch(() => "")}`);
  const j = await r.json() as { content: Array<{ type: string; text: string }> };
  const text = j.content?.find(c => c.type === "text")?.text ?? "";
  // Defensive parse: model is told to return strict JSON; be lenient about fences anyway.
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  let parsed: InferenceOutput;
  try { parsed = JSON.parse(cleaned); }
  catch { throw new Error("anthropic returned non-JSON: " + text.slice(0, 200)); }
  if (parsed.scope !== "single" && parsed.scope !== "cohort" && parsed.scope !== "global") {
    parsed.scope = "single";
  }
  if (typeof parsed.confidence !== "number") parsed.confidence = 0.5;
  return parsed;
}

async function routeInference(req: Request, env: Env, _project: Project): Promise<Response> {
  // Validate input first so a malformed call returns 400 even when AI is unconfigured.
  const body = await req.json().catch(() => null) as InferenceInput | null;
  if (!body || typeof body.comment !== "string" || !body.comment.trim()) {
    return err(400, "comment required");
  }
  if (body.comment.length > 2000) return err(413, "comment too long for inference");
  if (!env.ANTHROPIC_API_KEY) return err(503, "ai_unavailable");
  try {
    const out = await callAnthropic(env.ANTHROPIC_API_KEY, body);
    return json(out);
  } catch (e) {
    return err(502, "inference failed: " + (e as Error).message);
  }
}

// ----- Public (share-token) routes -----

async function routePublicProject(_req: Request, _env: Env, project: Project): Promise<Response> {
  return json({ id: project.id, name: project.name });
}

async function routePublicListComments(_req: Request, env: Env, project: Project, url: URL): Promise<Response> {
  const pageUrl = url.searchParams.get("url");
  const conditions: string[] = ["project_id = ?", "status IN ('open','in-progress')"];
  const binds: (string | number)[] = [project.id];
  if (pageUrl) { conditions.push("url = ?"); binds.push(pageUrl); }
  const sql = `SELECT id, url, selector, dom_path, x_pct, y_pct, viewport_w, viewport_h, screenshot_key, what, change_text, why_text, site_wide, status, created_at FROM comments WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT 500`;
  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  return json({ comments: results });
}

async function routePublicScreenshot(_req: Request, env: Env, project: Project, key: string): Promise<Response> {
  if (!key.startsWith(project.id + "/")) return err(403, "forbidden");
  const obj = await env.SCREENSHOTS.get(key);
  if (!obj) return err(404, "not found");
  return new Response(obj.body, {
    headers: {
      "content-type": obj.httpMetadata?.contentType ?? "application/octet-stream",
      "cache-control": "public, max-age=3600",
    },
  });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const reqOrigin = req.headers.get("origin");

    if (url.pathname === "/" || url.pathname === "/health") {
      return json({ ok: true, service: "feedback-pin-api", version: 2 });
    }

    // Public share routes (auth via ?share=)
    if (url.pathname.startsWith("/v1/public/")) {
      const project = await getProjectFromShare(req, env);
      const cors = corsHeaders(reqOrigin, null);
      if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
      if (!project) return err(401, "invalid share token", cors);
      try {
        if (url.pathname === "/v1/public/project" && req.method === "GET") return withCors(await routePublicProject(req, env, project), cors);
        if (url.pathname === "/v1/public/comments" && req.method === "GET") return withCors(await routePublicListComments(req, env, project, url), cors);
        const sm = url.pathname.match(/^\/v1\/public\/screenshots\/(.+)$/);
        if (sm && req.method === "GET") return withCors(await routePublicScreenshot(req, env, project, decodeURIComponent(sm[1])), cors);
        return err(404, "not found", cors);
      } catch (e) { return err(500, (e as Error).message || "internal error", cors); }
    }

    // Project-token routes
    let project = await getProjectFromRequest(req, env);
    let cors: Record<string, string> = corsHeaders(reqOrigin, project?.origin ?? null);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (!project) return err(401, "invalid or missing token", cors);

    try {
      if (url.pathname === "/v1/projects/me" && req.method === "GET") return withCors(await routeProjectInfo(req, env, project), cors);
      if (url.pathname === "/v1/inference" && req.method === "POST") return withCors(await routeInference(req, env, project), cors);
      if (url.pathname === "/v1/comments" && req.method === "POST") return withCors(await routeCreateComment(req, env, project), cors);
      if (url.pathname === "/v1/comments" && req.method === "GET") return withCors(await routeListComments(req, env, project, url), cors);
      const cm = url.pathname.match(/^\/v1\/comments\/([a-zA-Z0-9-]+)(\/(replies|resolve|reopen|status))?$/);
      if (cm) {
        const id = cm[1];
        const action = cm[3];
        if (!action && req.method === "GET") return withCors(await routeGetComment(req, env, project, id), cors);
        if (!action && req.method === "PATCH") return withCors(await routePatchComment(req, env, project, id), cors);
        if (!action && req.method === "DELETE") return withCors(await routeDeleteComment(req, env, project, id), cors);
        if (action === "replies" && req.method === "POST") return withCors(await routeReply(req, env, project, id), cors);
        if (action === "resolve" && req.method === "POST") return withCors(await routeResolve(req, env, project, id, true), cors);
        if (action === "reopen" && req.method === "POST") return withCors(await routeResolve(req, env, project, id, false), cors);
        if (action === "status" && req.method === "POST") return withCors(await routeStatus(req, env, project, id), cors);
      }
      if (url.pathname === "/v1/projects/me/approvers" && req.method === "PUT") return withCors(await routeSetApprovers(req, env, project), cors);
      if (url.pathname === "/v1/triage/queue" && req.method === "GET") return withCors(await routeTriageQueue(req, env, project), cors);
      if (url.pathname === "/v1/items" && req.method === "POST") return withCors(await routeCreateItem(req, env, project), cors);
      if (url.pathname === "/v1/items" && req.method === "GET") return withCors(await routeListItems(req, env, project, url), cors);
      const im = url.pathname.match(/^\/v1\/items\/([a-zA-Z0-9-]+)(\/(decision|stage))?$/);
      if (im) {
        const iid = im[1];
        const action = im[3];
        if (!action && req.method === "GET") return withCors(await routeGetItem(req, env, project, iid), cors);
        if (!action && req.method === "PATCH") return withCors(await routePatchItem(req, env, project, iid), cors);
        if (action === "decision" && req.method === "POST") return withCors(await routeDecision(req, env, project, iid), cors);
        if (action === "stage" && req.method === "POST") return withCors(await routeItemStage(req, env, project, iid), cors);
      }
      if (url.pathname === "/v1/screenshots" && req.method === "POST") return withCors(await routeUploadScreenshot(req, env, project), cors);
      const sm = url.pathname.match(/^\/v1\/screenshots\/(.+)$/);
      if (sm && req.method === "GET") return withCors(await routeServeScreenshot(req, env, project, decodeURIComponent(sm[1])), cors);
      return err(404, "not found", cors);
    } catch (e) { return err(500, (e as Error).message || "internal error", cors); }
  },
};

function withCors(res: Response, cors: Record<string, string>): Response {
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(cors)) h.set(k, v);
  return new Response(res.body, { status: res.status, headers: h });
}
