/**
 * Seed API integration test.
 *
 * Hits the locally running wrangler dev for now. The fp-feature pipeline can
 * later swap this for miniflare/unstable_dev so it is hermetic. For day 1
 * we just need a green canary that exercises the contract end-to-end.
 *
 * What this protects:
 *   - api-comments-crud invariants:
 *       create-requires-non-empty-change-and-why
 *       patch-rejects-non-author-with-403
 */

import { describe, it, expect, beforeAll } from "vitest";

const API = "http://localhost:8787";
const TOKEN = "fpt_52c5dbdd0f66b5f9899706d4679d58cfa71f704e";

async function ok() {
  try {
    const r = await fetch(`${API}/health`);
    return r.ok;
  } catch {
    return false;
  }
}

beforeAll(async () => {
  if (!(await ok())) {
    throw new Error(`API not reachable at ${API}. Start it with: cd api && npx wrangler dev --port 8787`);
  }
});

describe("api-comments-crud", () => {
  it("rejects create without why_text (create-requires-non-empty-change-and-why)", async () => {
    const r = await fetch(`${API}/v1/comments`, {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json", "x-fp-uid": "u_test_canary" },
      body: JSON.stringify({ url: "http://test/", change_text: "x" }),
    });
    expect(r.status).toBe(400);
    const j = await r.json();
    expect(j.error).toMatch(/why/i);
  });

  it("rejects PATCH from a different anon-id (patch-rejects-non-author-with-403)", async () => {
    // Create as author A
    const A = "u_test_author_" + Math.random().toString(36).slice(2, 10);
    const create = await fetch(`${API}/v1/comments`, {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json", "x-fp-uid": A },
      body: JSON.stringify({
        url: "http://test/canary",
        change_text: "patch-canary",
        why_text: "to verify auth",
      }),
    });
    expect(create.status).toBe(201);
    const { id } = await create.json();

    // Attempt PATCH as B
    const B = "u_test_imposter_" + Math.random().toString(36).slice(2, 10);
    const patch = await fetch(`${API}/v1/comments/${id}`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json", "x-fp-uid": B },
      body: JSON.stringify({ change_text: "hijacked" }),
    });
    expect(patch.status).toBe(403);

    // Cleanup
    await fetch(`${API}/v1/comments/${id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${TOKEN}`, "x-fp-uid": A },
    });
  });
});
