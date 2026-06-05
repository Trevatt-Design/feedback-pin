/**
 * Unit tests for the sidebar triage helpers (Batch 1: Sidebar triage upgrade).
 *
 * The widget's `__test` named export re-exports the pure helpers used by the
 * sidebar / wrapper / dashboard surfaces:
 *   - readSortPref()           — whitelist-validated localStorage read
 *   - commentMatchesQuery(c,q) — case-insensitive substring across change_text/why_text/url
 *   - sortComments(items, m)   — pure (non-mutating) sort by mode
 *
 * Protects (manifest invariants):
 *   widget-sidebar-standalone:
 *     - sort-preference-persists-via-localStorage
 *     - search-matches-change-text-why-text-and-url-case-insensitively
 *     - sort-modes-newest-oldest-unresolved
 *     - sort-helper-does-not-mutate-input
 *     - corrupt-stored-sort-pref-falls-back-to-newest
 */

// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { __test } from "../../widget/src/ui";
import type { Comment } from "../../widget/src/api";

const { readSortPref, commentMatchesQuery, sortComments } = __test;

/** Build a Comment with sane defaults; override what the test cares about. */
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
// readSortPref — whitelist + corruption + storage failure fallback
// -----------------------------------------------------------------------------

describe("readSortPref", () => {
  beforeEach(() => {
    try { localStorage.clear(); } catch {}
  });

  it("returns 'newest' when nothing is stored", () => {
    expect(readSortPref()).toBe("newest");
  });

  it("returns the stored value when it is a whitelisted mode", () => {
    localStorage.setItem("fp_sort", "newest");
    expect(readSortPref()).toBe("newest");
    localStorage.setItem("fp_sort", "oldest");
    expect(readSortPref()).toBe("oldest");
    localStorage.setItem("fp_sort", "unresolved");
    expect(readSortPref()).toBe("unresolved");
  });

  it("falls back to 'newest' for corrupt / unknown stored values", () => {
    localStorage.setItem("fp_sort", "garbage");
    expect(readSortPref()).toBe("newest");
    localStorage.setItem("fp_sort", "");
    expect(readSortPref()).toBe("newest");
    localStorage.setItem("fp_sort", "NEWEST"); // case-sensitive whitelist
    expect(readSortPref()).toBe("newest");
    localStorage.setItem("fp_sort", "{not:json}");
    expect(readSortPref()).toBe("newest");
  });

  it("does not throw when localStorage access throws (privacy mode etc.)", () => {
    // Force the underlying getItem to throw and confirm readSortPref swallows it.
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = function () {
      throw new Error("denied");
    };
    try {
      // Must not throw, must yield the documented default.
      expect(() => readSortPref()).not.toThrow();
      expect(readSortPref()).toBe("newest");
    } finally {
      Storage.prototype.getItem = original;
    }
  });
});

// -----------------------------------------------------------------------------
// commentMatchesQuery — case-insensitive substring across the three fields
// -----------------------------------------------------------------------------

describe("commentMatchesQuery", () => {
  // Caller is responsible for lowercasing the query (matches widget/dashboard
  // call sites which call .toLowerCase() on the user input first). Verify that
  // helper accepts an already-lowered query.
  it("matches change_text case-insensitively", () => {
    const c = mkComment({ change_text: "Make This SMALLER" });
    expect(commentMatchesQuery(c, "smaller")).toBe(true);
    expect(commentMatchesQuery(c, "make")).toBe(true);
    expect(commentMatchesQuery(c, "absent")).toBe(false);
  });

  it("matches why_text case-insensitively", () => {
    const c = mkComment({ change_text: "x", why_text: "Because it's TOO BIG" });
    expect(commentMatchesQuery(c, "too big")).toBe(true);
    expect(commentMatchesQuery(c, "because")).toBe(true);
  });

  it("matches url case-insensitively", () => {
    const c = mkComment({ url: "https://Example.com/Pricing" });
    expect(commentMatchesQuery(c, "pricing")).toBe(true);
    expect(commentMatchesQuery(c, "example.com")).toBe(true);
  });

  it("treats null/empty fields as non-matching but never throws", () => {
    const c = mkComment({ change_text: "", why_text: null, url: "" });
    // Empty query is excluded by the caller; helper still tolerates it without
    // pretending it matches anything meaningful (empty string is always a
    // substring of any string — but the field itself is empty, so .includes is
    // applied against "").
    expect(commentMatchesQuery(c, "anything")).toBe(false);
    expect(() => commentMatchesQuery(c, "")).not.toThrow();
  });

  it("returns true if any one of the three fields matches", () => {
    const c = mkComment({ change_text: "alpha", why_text: "beta", url: "https://gamma.test/" });
    expect(commentMatchesQuery(c, "alpha")).toBe(true);
    expect(commentMatchesQuery(c, "beta")).toBe(true);
    expect(commentMatchesQuery(c, "gamma")).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// sortComments — three modes, immutable
// -----------------------------------------------------------------------------

describe("sortComments", () => {
  const A = mkComment({ id: "a", change_text: "first ever",  created_at: 1000, status: "open" });
  const B = mkComment({ id: "b", change_text: "middle one",   created_at: 2000, status: "resolved" });
  const C = mkComment({ id: "c", change_text: "newest one",   created_at: 3000, status: "open" });
  const D = mkComment({ id: "d", change_text: "old resolved", created_at: 1500, status: "resolved" });
  const all = [A, B, C, D];

  it("'newest' returns descending by created_at", () => {
    const out = sortComments(all, "newest");
    expect(out.map(c => c.id)).toEqual(["c", "b", "d", "a"]);
  });

  it("'oldest' returns ascending by created_at", () => {
    const out = sortComments(all, "oldest");
    expect(out.map(c => c.id)).toEqual(["a", "d", "b", "c"]);
  });

  it("'unresolved' puts open comments before resolved, newest within each group", () => {
    const out = sortComments(all, "unresolved");
    // Open: c (3000), a (1000). Resolved: b (2000), d (1500).
    expect(out.map(c => c.id)).toEqual(["c", "a", "b", "d"]);
    // Sanity: every open comment comes before every resolved comment.
    const firstResolvedIdx = out.findIndex(c => c.status === "resolved");
    const lastOpenIdx = (() => {
      let last = -1;
      out.forEach((c, i) => { if (c.status === "open") last = i; });
      return last;
    })();
    expect(lastOpenIdx).toBeLessThan(firstResolvedIdx);
  });

  it("does not mutate the input array (sort-helper-does-not-mutate-input)", () => {
    const input = [C, A, B, D];
    const before = input.map(c => c.id);
    const out = sortComments(input, "newest");
    expect(input.map(c => c.id)).toEqual(before); // input untouched
    expect(out).not.toBe(input); // returns a new array
  });

  it("returns an empty array for an empty input", () => {
    expect(sortComments([], "newest")).toEqual([]);
    expect(sortComments([], "oldest")).toEqual([]);
    expect(sortComments([], "unresolved")).toEqual([]);
  });

  it("preserves all items (no accidental drop)", () => {
    expect(sortComments(all, "newest")).toHaveLength(all.length);
    expect(sortComments(all, "oldest")).toHaveLength(all.length);
    expect(sortComments(all, "unresolved")).toHaveLength(all.length);
  });
});
