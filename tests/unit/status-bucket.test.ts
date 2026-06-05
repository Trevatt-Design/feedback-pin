/**
 * Unit tests for the four-state triage helpers (Batch 7: Triage statuses).
 *
 * The widget's `__test` named export re-exports the pure helpers used by the
 * sidebar / wrapper / dashboard surfaces:
 *   - STATUS_OPTIONS  — wire value + display label tuples for the four states
 *   - statusLabel(s)  — wire→display lookup (e.g. "wont-fix" → "Won't fix")
 *   - isClosedStatus(s) — true for {resolved, wont-fix}; drives greyout + tabs
 *   - sortComments(items, "unresolved") — buckets all four states into the
 *     binary open/closed split before tie-breaking by created_at
 *
 * Protects (manifest invariants — to land in stage 7):
 *   - status-enum-allows-open-in-progress-wont-fix-resolved
 *   - closed-bucket-includes-resolved-and-wont-fix-for-greyout-and-tabs
 *   - sort-options-newest-oldest-unresolved-first  (already in manifest;
 *     the unresolved branch widens to four states here)
 */

// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { __test } from "../../widget/src/ui";
import type { Comment } from "../../widget/src/api";

const { STATUS_OPTIONS, statusLabel, isClosedStatus, sortComments } = __test;

function mkComment(over: Partial<Comment> = {}): Comment {
  return {
    id: over.id ?? "c_" + Math.random().toString(36).slice(2),
    url: over.url ?? "https://example.com/",
    selector: over.selector ?? null,
    dom_path: over.dom_path ?? "body>div",
    x_pct: 0.5,
    y_pct: 0.5,
    viewport_w: 1280,
    viewport_h: 800,
    screenshot_key: null,
    what: over.what ?? "div.foo",
    change_text: over.change_text ?? "",
    why_text: over.why_text ?? null,
    commenter_name: null,
    anon_id: over.anon_id ?? "u_abc",
    site_wide: 0,
    metadata: null,
    status: over.status ?? "open",
    created_at: over.created_at ?? 1_700_000_000_000,
    resolved_at: null,
    ...over,
  } as Comment;
}

// -----------------------------------------------------------------------------
// STATUS_OPTIONS — the wire values + UI labels for the four-state enum.
// -----------------------------------------------------------------------------

describe("STATUS_OPTIONS", () => {
  it("exposes exactly four states in the canonical order", () => {
    // status-enum-allows-open-in-progress-wont-fix-resolved
    const wire = STATUS_OPTIONS.map(o => o.value);
    expect(wire).toEqual(["open", "in-progress", "wont-fix", "resolved"]);
  });

  it("labels 'wont-fix' as \"Won't fix\" (apostrophe in UI, hyphen on the wire)", () => {
    const found = STATUS_OPTIONS.find(o => o.value === "wont-fix")!;
    expect(found).toBeDefined();
    expect(found.label).toBe("Won't fix");
  });

  it("labels each remaining wire value the way the UI promises", () => {
    const labels = Object.fromEntries(STATUS_OPTIONS.map(o => [o.value, o.label]));
    expect(labels).toEqual({
      "open": "Open",
      "in-progress": "In progress",
      "wont-fix": "Won't fix",
      "resolved": "Resolved",
    });
  });
});

// -----------------------------------------------------------------------------
// statusLabel — wire→display lookup (used in pill aria-label + select options).
// -----------------------------------------------------------------------------

describe("statusLabel", () => {
  it("returns the matching display label for each wire value", () => {
    expect(statusLabel("open")).toBe("Open");
    expect(statusLabel("in-progress")).toBe("In progress");
    expect(statusLabel("wont-fix")).toBe("Won't fix");
    expect(statusLabel("resolved")).toBe("Resolved");
  });
});

// -----------------------------------------------------------------------------
// isClosedStatus — drives `is-closed` greyout class and the "Resolved" tab
// bucketing (closed-bucket-includes-resolved-and-wont-fix-for-greyout-and-tabs).
// -----------------------------------------------------------------------------

describe("isClosedStatus", () => {
  it("returns true for resolved and wont-fix", () => {
    expect(isClosedStatus("resolved")).toBe(true);
    expect(isClosedStatus("wont-fix")).toBe(true);
  });

  it("returns false for open and in-progress", () => {
    expect(isClosedStatus("open")).toBe(false);
    expect(isClosedStatus("in-progress")).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// sortComments — the 'unresolved' mode now buckets four states, not two.
// -----------------------------------------------------------------------------

describe("sortComments — 'unresolved' across four statuses", () => {
  // Mix all four states with distinct timestamps so the within-bucket tie-break
  // (newest first) is observable.
  const O = mkComment({ id: "o", change_text: "open",        created_at: 1_000, status: "open" });
  const P = mkComment({ id: "p", change_text: "in-progress", created_at: 2_000, status: "in-progress" });
  const W = mkComment({ id: "w", change_text: "wont-fix",    created_at: 3_000, status: "wont-fix" });
  const R = mkComment({ id: "r", change_text: "resolved",    created_at: 4_000, status: "resolved" });
  const all = [O, P, W, R];

  it("buckets {open, in-progress} before {resolved, wont-fix}, newest within each bucket", () => {
    const out = sortComments(all, "unresolved");
    // Open bucket: P (2000) before O (1000). Closed bucket: R (4000) before W (3000).
    expect(out.map(c => c.id)).toEqual(["p", "o", "r", "w"]);

    // Sanity: every closed comment is after every open comment.
    const lastOpenIdx = out.reduce((acc, c, i) => isClosedStatus(c.status) ? acc : i, -1);
    const firstClosedIdx = out.findIndex(c => isClosedStatus(c.status));
    expect(lastOpenIdx).toBeLessThan(firstClosedIdx);
  });

  it("does not collapse in-progress into the closed bucket", () => {
    const inputs = [
      mkComment({ id: "p", created_at: 1_000, status: "in-progress" }),
      mkComment({ id: "r", created_at: 2_000, status: "resolved" }),
    ];
    // in-progress should come first (it's open-bucket), not last.
    expect(sortComments(inputs, "unresolved").map(c => c.id)).toEqual(["p", "r"]);
  });

  it("does not collapse wont-fix into the open bucket", () => {
    const inputs = [
      mkComment({ id: "w", created_at: 5_000, status: "wont-fix" }),
      mkComment({ id: "o", created_at: 1_000, status: "open" }),
    ];
    // open (older) should come BEFORE wont-fix (newer) because of bucketing.
    expect(sortComments(inputs, "unresolved").map(c => c.id)).toEqual(["o", "w"]);
  });

  it("preserves all four items (no accidental drop)", () => {
    expect(sortComments(all, "unresolved")).toHaveLength(all.length);
  });
});
