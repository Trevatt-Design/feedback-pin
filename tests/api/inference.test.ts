/**
 * API integration tests for /v1/inference.
 *
 * Protects:
 *   api-inference-endpoint invariants:
 *     returns-503-when-anthropic-key-missing
 *     no-ai-call-when-comment-empty
 *
 * In local development, ANTHROPIC_API_KEY is not set, so the endpoint should
 * return 503 ai_unavailable and the widget falls back to its heuristic flow.
 *
 * If the user later sets the key, this test should be skipped or replaced
 * with one that asserts the response shape; for now we treat 503 as the
 * expected default.
 */

import { describe, it, expect, beforeAll } from "vitest";

const API = "http://localhost:8787";
const TOKEN = "fpt_52c5dbdd0f66b5f9899706d4679d58cfa71f704e";

beforeAll(async () => {
  const r = await fetch(`${API}/health`).catch(() => null);
  if (!r || !r.ok) throw new Error(`API not reachable at ${API}. Start with: cd api && npx wrangler dev --port 8787`);
});

describe("api-inference-endpoint", () => {
  it("rejects empty comment with 400 (no-ai-call-when-comment-empty)", async () => {
    const r = await fetch(`${API}/v1/inference`, {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ comment: "" }),
    });
    expect(r.status).toBe(400);
    const j = await r.json();
    expect(j.error).toMatch(/comment/i);
  });

  it("rejects missing token with 401", async () => {
    const r = await fetch(`${API}/v1/inference`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ comment: "x" }),
    });
    expect(r.status).toBe(401);
  });

  it("returns 503 ai_unavailable when ANTHROPIC_API_KEY is unset (returns-503-when-anthropic-key-missing)", async () => {
    // Note: this test passes only when the local wrangler dev was started
    // without the secret bound. If you've set it, the test should be skipped
    // or rewritten to assert response shape.
    const r = await fetch(`${API}/v1/inference`, {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ comment: "make this smaller", target: { tag: "h2" } }),
    });
    if (r.status === 200) {
      // AI is configured — assert the shape instead.
      const j = await r.json();
      expect(["single", "cohort", "global"]).toContain(j.scope);
      expect(typeof j.confidence).toBe("number");
    } else {
      expect(r.status).toBe(503);
      const j = await r.json();
      expect(j.error).toBe("ai_unavailable");
    }
  });
});
