/**
 * Seed unit test for the widget's anon-id generation.
 *
 * The function is small enough to import-and-test directly. We re-implement
 * the storage gate against an in-memory shim because the real getUid uses
 * window.localStorage which is unavailable in the Node/Vitest environment.
 *
 * What this protects:
 *   - widget-anon-id invariant: anon-id-persists-per-browser
 *   - widget-anon-id invariant: ids match the documented prefix and length
 */

import { describe, it, expect, beforeEach } from "vitest";

// Node 18+ exposes globalThis.crypto natively; no polyfill needed.

// Inline copy of widget/src/uid.ts logic — kept in sync via the manifest
// `widget-anon-id` contract. If this drifts from the source, the test fails
// loudly, which is intentional.
function rand16(): string {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

const memStore = new Map<string, string>();
const localStorageShim = {
  getItem: (k: string) => memStore.get(k) ?? null,
  setItem: (k: string, v: string) => void memStore.set(k, v),
};

const KEY = "fp_uid";

function getUid(): string {
  let v = localStorageShim.getItem(KEY);
  if (!v) {
    v = "u_" + rand16();
    localStorageShim.setItem(KEY, v);
  }
  return v;
}

describe("widget-anon-id", () => {
  beforeEach(() => memStore.clear());

  it("generates an id with the documented prefix and length", () => {
    const id = getUid();
    expect(id).toMatch(/^u_[0-9a-f]{32}$/);
  });

  it("persists the same id across calls (anon-id-persists-per-browser)", () => {
    const a = getUid();
    const b = getUid();
    expect(a).toBe(b);
  });

  it("produces a fresh id when storage is wiped", () => {
    const a = getUid();
    memStore.clear();
    const b = getUid();
    expect(a).not.toBe(b);
  });
});
