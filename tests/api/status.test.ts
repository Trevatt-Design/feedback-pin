/**
 * API integration tests for Batch 7 (Triage statuses).
 *
 * Hits the locally running wrangler dev. Same shape as comments.test.ts —
 * skip the suite with a clear error if the API is not reachable.
 *
 * Protects (manifest invariants — to land in stage 7):
 *   - status-enum-allows-open-in-progress-wont-fix-resolved
 *   - status-route-accepts-all-four-and-rejects-others-with-400
 *   - legacy-resolve-reopen-routes-still-work-and-route-through-status-handler
 *   - share-routes-expose-open-and-in-progress-only
 *   - status-change-is-not-author-gated
 * Plus existing api-comments-crud invariants kept hot:
 *   - origin-allowlist-enforced-when-set (untouched)
 *   - patch-rejects-non-author-with-403  (untouched; sibling test confirms still
 *     true that PATCH is author-gated even though /status is NOT)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";

const API = "http://localhost:8787";
const TOKEN = "fpt_52c5dbdd0f66b5f9899706d4679d58cfa71f704e";

// We resolve the share token at suite start so the public-route tests can read
// only-open-and-in-progress without hard-coding it. If the API is reachable but
// returns no share_token (project unconfigured), the share tests will be
// skipped with a clear note.
let SHARE_TOKEN: string | null = null;

const createdIds: string[] = [];
const AUTHOR = "u_status_author_" + Math.random().toString(36).slice(2, 10);

async function apiOk(): Promise<boolean> {
  try {
    const r = await fetch(`${API}/health`);
    return r.ok;
  } catch { return false; }
}

async function createComment(opts: { url?: string; uid?: string; change?: string } = {}): Promise<string> {
  const r = await fetch(`${API}/v1/comments`, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${TOKEN}`,
      "content-type": "application/json",
      "x-fp-uid": opts.uid ?? AUTHOR,
    },
    body: JSON.stringify({
      url: opts.url ?? "http://test/status",
      change_text: opts.change ?? "status canary",
      why_text: "exercise the status route",
    }),
  });
  if (!r.ok) throw new Error(`create failed: ${r.status} ${await r.text()}`);
  const { id } = await r.json() as { id: string };
  createdIds.push(id);
  return id;
}

async function readStatus(id: string): Promise<{ status: string; resolved_at: number | null }> {
  const r = await fetch(`${API}/v1/comments/${id}`, { headers: { authorization: `Bearer ${TOKEN}` } });
  if (!r.ok) throw new Error(`get failed: ${r.status}`);
  const j = await r.json() as { comment: { status: string; resolved_at: number | null } };
  return { status: j.comment.status, resolved_at: j.comment.resolved_at };
}

async function setStatus(id: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`${API}/v1/comments/${id}/status`, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${TOKEN}`,
      "content-type": "application/json",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeAll(async () => {
  if (!(await apiOk())) {
    throw new Error(`API not reachable at ${API}. Start it with: cd api && npx wrangler dev --port 8787`);
  }
  // Fetch share token once (best-effort).
  try {
    const r = await fetch(`${API}/v1/projects/me`, { headers: { authorization: `Bearer ${TOKEN}` } });
    if (r.ok) {
      const j = await r.json() as { share_token: string | null };
      SHARE_TOKEN = j.share_token ?? null;
    }
  } catch {}
});

afterAll(async () => {
  // Best-effort cleanup so cross-test pollution doesn't accumulate in D1.
  for (const id of createdIds) {
    try {
      await fetch(`${API}/v1/comments/${id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${TOKEN}`, "x-fp-uid": AUTHOR },
      });
    } catch {}
  }
});

// -----------------------------------------------------------------------------
// (a) Each of the four statuses writes the column; resolved_at is set ONLY when
// status='resolved' and is cleared on every transition out of resolved.
// -----------------------------------------------------------------------------

describe("POST /v1/comments/:id/status — accepts the four states", () => {
  it("'in-progress' is accepted; row's status updates and resolved_at remains null", async () => {
    const id = await createComment();
    const r = await setStatus(id, { status: "in-progress" });
    expect(r.status).toBe(200);
    const row = await readStatus(id);
    expect(row.status).toBe("in-progress");
    expect(row.resolved_at).toBeNull();
  });

  it("'wont-fix' is accepted; row's status updates and resolved_at remains null", async () => {
    const id = await createComment();
    const r = await setStatus(id, { status: "wont-fix" });
    expect(r.status).toBe(200);
    const row = await readStatus(id);
    expect(row.status).toBe("wont-fix");
    expect(row.resolved_at).toBeNull();
  });

  it("'resolved' is accepted and stamps resolved_at to a positive number", async () => {
    const id = await createComment();
    const r = await setStatus(id, { status: "resolved" });
    expect(r.status).toBe(200);
    const row = await readStatus(id);
    expect(row.status).toBe("resolved");
    expect(typeof row.resolved_at).toBe("number");
    expect(row.resolved_at).toBeGreaterThan(0);
  });

  it("'open' clears resolved_at on transition out of resolved", async () => {
    const id = await createComment();
    // First transition through resolved so resolved_at is non-null...
    await setStatus(id, { status: "resolved" });
    const before = await readStatus(id);
    expect(before.resolved_at).not.toBeNull();
    // ...then back to open and confirm it's wiped.
    const r = await setStatus(id, { status: "open" });
    expect(r.status).toBe(200);
    const after = await readStatus(id);
    expect(after.status).toBe("open");
    expect(after.resolved_at).toBeNull();
  });
});

// -----------------------------------------------------------------------------
// (b) Reject malformed bodies / values not in the whitelist with 400.
// -----------------------------------------------------------------------------

describe("POST /v1/comments/:id/status — rejects bad bodies with 400", () => {
  it("rejects an empty object", async () => {
    const id = await createComment();
    const r = await setStatus(id, {});
    expect(r.status).toBe(400);
  });

  it("rejects { status: null }", async () => {
    const id = await createComment();
    const r = await setStatus(id, { status: null });
    expect(r.status).toBe(400);
  });

  it("rejects an arbitrary string outside the whitelist", async () => {
    const id = await createComment();
    const r = await setStatus(id, { status: "foo" });
    expect(r.status).toBe(400);
  });

  it("rejects status given as an array", async () => {
    const id = await createComment();
    const r = await setStatus(id, { status: [] });
    expect(r.status).toBe(400);
  });

  it("is case-sensitive on the wire (does NOT accept 'OPEN')", async () => {
    // status-route-accepts-all-four-and-rejects-others-with-400
    const id = await createComment();
    const r = await setStatus(id, { status: "OPEN" });
    expect(r.status).toBe(400);
  });

  it("rejects malformed JSON (text body)", async () => {
    const id = await createComment();
    const r = await setStatus(id, "not-json-at-all");
    expect(r.status).toBe(400);
  });
});

// -----------------------------------------------------------------------------
// (c) Wrong project token / nonexistent row → 404. Public path is not auth'd
// here (project token is required) so a missing or cross-tenant row returns
// 404, never reveals existence.
// -----------------------------------------------------------------------------

describe("POST /v1/comments/:id/status — auth + tenant isolation", () => {
  it("returns 401 when the bearer token is missing entirely", async () => {
    const id = await createComment();
    const r = await fetch(`${API}/v1/comments/${id}/status`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "in-progress" }),
    });
    expect(r.status).toBe(401);
  });

  it("returns 404 for a fabricated id under the right token", async () => {
    const r = await setStatus("nonexistent-id-12345", { status: "open" });
    expect(r.status).toBe(404);
  });
});

// -----------------------------------------------------------------------------
// (d) Legacy /resolve and /reopen still work and route through the same write
// path (status column + resolved_at semantics identical to /status).
// -----------------------------------------------------------------------------

describe("legacy /resolve and /reopen still work", () => {
  // legacy-resolve-reopen-routes-still-work-and-route-through-status-handler
  it("/resolve sets status='resolved' and stamps resolved_at", async () => {
    const id = await createComment();
    const r = await fetch(`${API}/v1/comments/${id}/resolve`, {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(r.status).toBe(200);
    const row = await readStatus(id);
    expect(row.status).toBe("resolved");
    expect(typeof row.resolved_at).toBe("number");
    expect(row.resolved_at).toBeGreaterThan(0);
  });

  it("/reopen sets status='open' and clears resolved_at", async () => {
    const id = await createComment();
    // First mark resolved to ensure resolved_at is non-null before reopen.
    await setStatus(id, { status: "resolved" });
    const r = await fetch(`${API}/v1/comments/${id}/reopen`, {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(r.status).toBe(200);
    const row = await readStatus(id);
    expect(row.status).toBe("open");
    expect(row.resolved_at).toBeNull();
  });
});

// -----------------------------------------------------------------------------
// (e) GET /v1/comments?status=in-progress filters precisely to that status.
// (f) Public list returns open AND in-progress; never wont-fix or resolved.
// -----------------------------------------------------------------------------

describe("GET /v1/comments — status query accepts all four", () => {
  it("?status=in-progress returns only rows whose wire status is 'in-progress'", async () => {
    // Seed two comments: one in-progress, one open. Use a unique URL so the
    // assertion isn't polluted by other rows in the project.
    const url = "http://test/status-query-" + Math.random().toString(36).slice(2, 8);
    const a = await createComment({ url });
    const b = await createComment({ url });
    await setStatus(a, { status: "in-progress" });

    const r = await fetch(`${API}/v1/comments?status=in-progress&url=${encodeURIComponent(url)}`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(r.status).toBe(200);
    const j = await r.json() as { comments: Array<{ id: string; status: string }> };
    const ids = j.comments.map(c => c.id);
    expect(ids).toContain(a);
    expect(ids).not.toContain(b);
    for (const c of j.comments) expect(c.status).toBe("in-progress");
  });

  it("?status=wont-fix returns only wont-fix rows", async () => {
    const url = "http://test/status-query-wf-" + Math.random().toString(36).slice(2, 8);
    const a = await createComment({ url });
    await setStatus(a, { status: "wont-fix" });
    const r = await fetch(`${API}/v1/comments?status=wont-fix&url=${encodeURIComponent(url)}`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(r.status).toBe(200);
    const j = await r.json() as { comments: Array<{ status: string }> };
    expect(j.comments.length).toBeGreaterThan(0);
    for (const c of j.comments) expect(c.status).toBe("wont-fix");
  });
});

describe("GET /v1/public/comments — share routes only expose open + in-progress", () => {
  // share-routes-expose-open-and-in-progress-only
  it("returns open AND in-progress; never wont-fix or resolved", async () => {
    if (!SHARE_TOKEN) {
      // No share token configured for the seeded project — skip rather than fail.
      console.warn("Skipping share-route test: no share_token on seeded project.");
      return;
    }
    // Seed a row in each of the four statuses on a unique URL.
    const url = "http://test/share-status-" + Math.random().toString(36).slice(2, 8);
    const open = await createComment({ url });
    const inprog = await createComment({ url });
    const wf = await createComment({ url });
    const res = await createComment({ url });
    await setStatus(inprog, { status: "in-progress" });
    await setStatus(wf, { status: "wont-fix" });
    await setStatus(res, { status: "resolved" });

    const r = await fetch(`${API}/v1/public/comments?share=${encodeURIComponent(SHARE_TOKEN)}&url=${encodeURIComponent(url)}`);
    expect(r.status).toBe(200);
    const j = await r.json() as { comments: Array<{ id: string; status: string }> };
    const ids = j.comments.map(c => c.id);
    expect(ids).toContain(open);
    expect(ids).toContain(inprog);
    expect(ids).not.toContain(wf);
    expect(ids).not.toContain(res);
    // And cross-check: every returned status is in the public-allowed set.
    for (const c of j.comments) {
      expect(["open", "in-progress"]).toContain(c.status);
    }
  });
});

// -----------------------------------------------------------------------------
// (g) Status changes are NOT author-gated. Any caller with the project token
// can transition any row, regardless of x-fp-uid. PATCH continues to be
// author-gated — that invariant is verified in comments.test.ts.
// -----------------------------------------------------------------------------

describe("POST /v1/comments/:id/status — not author-gated", () => {
  // status-change-is-not-author-gated
  it("a token-holder with a different x-fp-uid can still flip the status", async () => {
    const id = await createComment({ uid: AUTHOR });
    // Imposter sends the right project token but a wrong x-fp-uid.
    const IMPOSTER = "u_status_imposter_" + Math.random().toString(36).slice(2, 10);
    const r = await setStatus(id, { status: "wont-fix" }, { "x-fp-uid": IMPOSTER });
    expect(r.status).toBe(200);
    const row = await readStatus(id);
    expect(row.status).toBe("wont-fix");
  });

  it("status route does NOT require x-fp-uid at all (header optional)", async () => {
    const id = await createComment();
    // Explicitly omit x-fp-uid by constructing the request manually.
    const r = await fetch(`${API}/v1/comments/${id}/status`, {
      method: "POST",
      headers: {
        "authorization": `Bearer ${TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ status: "in-progress" }),
    });
    expect(r.status).toBe(200);
  });
});
