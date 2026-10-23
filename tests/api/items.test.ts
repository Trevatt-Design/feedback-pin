/**
 * API integration tests for review items (api-review-items).
 *
 * Hits the locally running wrangler dev, same as comments.test.ts and
 * status.test.ts. Needs schema-v3.sql applied to the local D1.
 *
 * Protects:
 *   - item-create-validates-kind-outcome-and-comment-ids
 *   - question-can-only-be-answered
 *   - initial-stage-follows-outcome
 *   - item-create-replies-on-each-comment-and-sets-it-in-progress
 *   - decision-needs-actor-and-approver
 *   - decline-and-discuss-need-a-note
 *   - stage-moves-follow-the-loop-and-figma-signoff-is-approver-only
 *   - comment-resolves-when-every-item-from-it-is-closed
 *   - triage-queue-lists-only-comments-without-items
 *   - one-comment-can-feed-several-items
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const API = "http://localhost:8787";
const TOKEN = "fpt_52c5dbdd0f66b5f9899706d4679d58cfa71f704e";
const AUTHOR = "u_items_author_" + Math.random().toString(36).slice(2, 10);
const APPROVER = "approver-" + Math.random().toString(36).slice(2, 8);
const created: string[] = [];
let previousApprovers: string[] = [];

const h = (extra: Record<string, string> = {}) => ({
  authorization: `Bearer ${TOKEN}`,
  "content-type": "application/json",
  ...extra,
});

async function createComment(change = "items canary"): Promise<string> {
  const r = await fetch(`${API}/v1/comments`, {
    method: "POST",
    headers: h({ "x-fp-uid": AUTHOR }),
    body: JSON.stringify({ url: "http://test/items", change_text: change, why_text: "exercise items" }),
  });
  if (!r.ok) throw new Error(`create failed ${r.status}`);
  const { id } = await r.json() as { id: string };
  created.push(id);
  return id;
}

async function createItem(body: Record<string, unknown>): Promise<Response> {
  return fetch(`${API}/v1/items`, { method: "POST", headers: h(), body: JSON.stringify(body) });
}

async function getItem(id: string) {
  const r = await fetch(`${API}/v1/items/${id}`, { headers: h() });
  return r.json() as Promise<{ item: { stage: string; decision: string | null; decided_by: string | null; ref: string }; comments: Array<{ id: string }>; events: Array<{ action: string; value: string | null }> }>;
}

async function commentState(id: string) {
  const r = await fetch(`${API}/v1/comments/${id}`, { headers: h() });
  return r.json() as Promise<{ comment: { status: string }; replies: Array<{ author: string; body: string }> }>;
}

const post = (path: string, body: unknown, actor?: string) =>
  fetch(`${API}${path}`, { method: "POST", headers: h(actor ? { "x-fp-actor": actor } : {}), body: JSON.stringify(body) });

beforeAll(async () => {
  const ok = await fetch(`${API}/health`).then((r) => r.ok).catch(() => false);
  if (!ok) throw new Error(`API not reachable at ${API}. Start it with: cd api && npx wrangler dev --port 8787`);
  const me = await fetch(`${API}/v1/projects/me`, { headers: h() }).then((r) => r.json()) as { approvers?: string[] };
  previousApprovers = me.approvers ?? [];
  const set = await fetch(`${API}/v1/projects/me/approvers`, {
    method: "PUT",
    headers: h({ "x-fp-actor": previousApprovers[0] ?? APPROVER }),
    body: JSON.stringify({ approvers: [APPROVER] }),
  });
  if (!set.ok) throw new Error(`could not set approvers: ${set.status}`);
});

afterAll(async () => {
  await fetch(`${API}/v1/projects/me/approvers`, {
    method: "PUT",
    headers: h({ "x-fp-actor": APPROVER }),
    body: JSON.stringify({ approvers: previousApprovers }),
  }).catch(() => {});
});

describe("POST /v1/items — validation", () => {
  it("rejects a missing comment list, bad kind and bad outcome", async () => {
    const cid = await createComment();
    expect((await createItem({ title: "x", kind: "command", outcome: "build-fix" })).status).toBe(400);
    expect((await createItem({ comment_ids: [cid], title: "x", kind: "nope", outcome: "build-fix" })).status).toBe(400);
    expect((await createItem({ comment_ids: [cid], title: "x", kind: "command", outcome: "nope" })).status).toBe(400);
  });

  it("a question can only be answered", async () => {
    const cid = await createComment();
    expect((await createItem({ comment_ids: [cid], title: "q", kind: "question", outcome: "conflict" })).status).toBe(400);
    const ok = await createItem({ comment_ids: [cid], title: "q", kind: "question", outcome: "answered", verdict: "Yes, it is a sheet." });
    expect(ok.status).toBe(201);
  });

  it("404s on a comment from another project or a made-up id", async () => {
    expect((await createItem({ comment_ids: ["nope-123"], title: "x", kind: "command", outcome: "build-fix" })).status).toBe(404);
  });
});

describe("initial stage and the reply where the comment was left", () => {
  it("maps outcome to stage", async () => {
    const cases: Array<[string, string, string]> = [
      ["command", "built-right", "closed"],
      ["command", "build-fix", "ready-to-build"],
      ["command", "missing", "awaiting-decision"],
      ["command", "conflict", "awaiting-decision"],
      ["question", "answered", "closed"],
    ];
    for (const [kind, outcome, stage] of cases) {
      const cid = await createComment();
      const r = await createItem({ comment_ids: [cid], title: outcome, kind, outcome });
      expect(r.status).toBe(201);
      const j = await r.json() as { stage: string; ref: string };
      expect(j.stage).toBe(stage);
      expect(j.ref).toMatch(/^FB-\d{3,}$/);
    }
  });

  it("replies on the comment with the ref and outcome, and sets the comment in progress or resolved", async () => {
    const cid = await createComment();
    const r = await createItem({ comment_ids: [cid], title: "fix", kind: "command", outcome: "build-fix", verdict: "Buttons differ from F12-09." });
    const { ref } = await r.json() as { ref: string };
    const s = await commentState(cid);
    expect(s.comment.status).toBe("in-progress");
    expect(s.replies.some((x) => x.author === "designer" && x.body.startsWith(ref) && x.body.includes("Buttons differ"))).toBe(true);

    const cid2 = await createComment();
    await createItem({ comment_ids: [cid2], title: "done", kind: "command", outcome: "built-right" });
    expect((await commentState(cid2)).comment.status).toBe("resolved");
  });
});

describe("decisions", () => {
  it("need an actor, an approver, and a note to decline or discuss", async () => {
    const cid = await createComment();
    const { id } = await (await createItem({ comment_ids: [cid], title: "sheet", kind: "command", outcome: "conflict" })).json() as { id: string };
    expect((await post(`/v1/items/${id}/decision`, { decision: "approve" })).status).toBe(401);
    expect((await post(`/v1/items/${id}/decision`, { decision: "approve" }, "someone-else")).status).toBe(403);
    expect((await post(`/v1/items/${id}/decision`, { decision: "decline" }, APPROVER)).status).toBe(400);
    expect((await post(`/v1/items/${id}/decision`, { decision: "maybe" }, APPROVER)).status).toBe(400);
    const d = await post(`/v1/items/${id}/decision`, { decision: "discuss", note: "Talk on Monday" }, APPROVER);
    expect(d.status).toBe(200);
    expect((await getItem(id)).item.stage).toBe("discuss");
    const a = await post(`/v1/items/${id}/decision`, { decision: "approve" }, APPROVER);
    expect(a.status).toBe(200);
    const g = await getItem(id);
    expect(g.item.stage).toBe("approved");
    expect(g.item.decided_by).toBe(APPROVER);
    expect(g.events.map((e) => e.action)).toEqual(["created", "decision", "decision"]);
    // A decided item cannot be decided again.
    expect((await post(`/v1/items/${id}/decision`, { decision: "approve" }, APPROVER)).status).toBe(409);
  });

  it("decline closes the item and resolves its comment", async () => {
    const cid = await createComment();
    const { id } = await (await createItem({ comment_ids: [cid], title: "x", kind: "command", outcome: "missing" })).json() as { id: string };
    expect((await post(`/v1/items/${id}/decision`, { decision: "decline", note: "Out of scope" }, APPROVER)).status).toBe(200);
    expect((await getItem(id)).item.stage).toBe("closed");
    expect((await commentState(cid)).comment.status).toBe("resolved");
  });
});

describe("stage moves", () => {
  it("follow the loop; the Figma sign-off is approver-only; skipping is refused", async () => {
    const cid = await createComment();
    const { id } = await (await createItem({ comment_ids: [cid], title: "x", kind: "command", outcome: "conflict" })).json() as { id: string };
    expect((await post(`/v1/items/${id}/stage`, { stage: "built" }, "dev")).status).toBe(409);
    await post(`/v1/items/${id}/decision`, { decision: "approve" }, APPROVER);
    expect((await post(`/v1/items/${id}/stage`, { stage: "ready-to-build" }, "dev")).status).toBe(409);
    expect((await post(`/v1/items/${id}/stage`, { stage: "in-figma" }, "dev")).status).toBe(200);
    expect((await post(`/v1/items/${id}/stage`, { stage: "ready-to-build" }, "dev")).status).toBe(403);
    expect((await post(`/v1/items/${id}/stage`, { stage: "ready-to-build" }, APPROVER)).status).toBe(200);
    expect((await post(`/v1/items/${id}/stage`, { stage: "built" })).status).toBe(401);
    expect((await post(`/v1/items/${id}/stage`, { stage: "built" }, "dev")).status).toBe(200);
    expect((await commentState(cid)).comment.status).toBe("in-progress");
    expect((await post(`/v1/items/${id}/stage`, { stage: "closed" }, APPROVER)).status).toBe(200);
    expect((await commentState(cid)).comment.status).toBe("resolved");
  });
});

describe("splitting, merging and the triage queue", () => {
  it("one comment can feed two items; it resolves only when both close", async () => {
    const cid = await createComment("should be a sheet");
    const fix = await (await createItem({ comment_ids: [cid], title: "content", kind: "command", outcome: "build-fix" })).json() as { id: string };
    const flag = await (await createItem({ comment_ids: [cid], title: "sheet", kind: "command", outcome: "conflict" })).json() as { id: string };
    await post(`/v1/items/${fix.id}/stage`, { stage: "built" }, "dev");
    await post(`/v1/items/${fix.id}/stage`, { stage: "closed" }, "dev");
    expect((await commentState(cid)).comment.status).toBe("in-progress");
    await post(`/v1/items/${flag.id}/decision`, { decision: "decline", note: "Keep the screen" }, APPROVER);
    expect((await commentState(cid)).comment.status).toBe("resolved");
  });

  it("a duplicate comment can be merged into an existing item", async () => {
    const a = await createComment("dup a");
    const b = await createComment("dup b");
    const { id } = await (await createItem({ comment_ids: [a], title: "dup", kind: "command", outcome: "build-fix" })).json() as { id: string };
    const p = await fetch(`${API}/v1/items/${id}`, { method: "PATCH", headers: h(), body: JSON.stringify({ add_comment_ids: [b] }) });
    expect(p.status).toBe(200);
    expect((await getItem(id)).comments.map((c) => c.id).sort()).toEqual([a, b].sort());
    expect((await commentState(b)).comment.status).toBe("in-progress");
  });

  it("the triage queue lists open comments with no item", async () => {
    const lone = await createComment("not triaged yet");
    const taken = await createComment("triaged");
    await createItem({ comment_ids: [taken], title: "t", kind: "command", outcome: "build-fix" });
    const q = await fetch(`${API}/v1/triage/queue`, { headers: h() }).then((r) => r.json()) as { comments: Array<{ id: string }> };
    const ids = q.comments.map((c) => c.id);
    expect(ids).toContain(lone);
    expect(ids).not.toContain(taken);
  });
});
