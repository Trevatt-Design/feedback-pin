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
    "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "access-control-allow-headers": "authorization, content-type, x-fp-uid",
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

async function routeProjectInfo(_req: Request, _env: Env, project: Project): Promise<Response> {
  return json({ id: project.id, name: project.name, origin: project.origin, share_token: project.share_token });
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
