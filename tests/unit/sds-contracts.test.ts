/**
 * Grep-based contract tests for the design-system-sds feature.
 *
 * These assertions read source files at the filesystem level rather than
 * importing them, because the contracts are about *what the source says*,
 * not about runtime behaviour. Each `it` block names the manifest invariant
 * it protects so a failure points the engineer at the contract that broke.
 *
 * Covered invariants:
 *   - sds-vendored-mit-license-shipped
 *   - widget-styles-sourced-from-sds-tokens
 *     (widget/src/styles.ts has var(--sds-… references; widget/src/tokens.ts
 *      has zero `:root` and zero `prefers-color-scheme: dark`.)
 *   - no-cdn-react-in-dashboard
 *     (dashboard/web/src/ does not import from esm.sh; allowed exception:
 *      dashboard/worker/reviewHtml.ts.)
 *   - cursor-badge-remains-custom-consumes-sds-brand-token-only
 *   - outline-only-highlight-consumes-sds-color-tokens-only-geometry-preserved
 *   - submit-button-radius-mapped-to-sds-radius-200
 *
 * Tests run from the repo root (Vitest cwd). Paths are computed relative to
 * this test file so they survive any cwd drift.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..");

function readRepoFile(relPath: string): string {
  return readFileSync(join(REPO_ROOT, relPath), "utf8");
}

/** Recursively list all `.ts` / `.tsx` / `.css` files under a directory. */
function walkSource(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walkSource(full));
    } else if (/\.(ts|tsx|css|mjs|js)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

describe("sds-contracts (design-system-sds)", () => {
  // ── Vendoring ────────────────────────────────────────────────────────────

  it("ships the SDS LICENSE file (sds-vendored-mit-license-shipped)", () => {
    const licensePath = join(REPO_ROOT, "dashboard/web/src/sds/LICENSE");
    expect(existsSync(licensePath)).toBe(true);
    const text = readFileSync(licensePath, "utf8");
    // Must mention MIT and Figma so it's the right upstream.
    expect(text).toMatch(/MIT/i);
    expect(text).toMatch(/Figma/i);
    // Non-empty body — guard against an accidentally-truncated copy.
    expect(text.trim().length).toBeGreaterThan(200);
  });

  // ── Widget tokens / styles sourced from SDS ──────────────────────────────

  it("widget/src/styles.ts references SDS tokens (widget-styles-sourced-from-sds-tokens)", () => {
    const styles = readRepoFile("widget/src/styles.ts");
    // At least one `var(--sds-` reference is required to prove the widget
    // consumes SDS tokens directly rather than re-defining its own palette.
    const sdsRefs = styles.match(/var\(--sds-/g) ?? [];
    expect(sdsRefs.length).toBeGreaterThan(20);
  });

  it("widget/src/tokens.ts has no :root selector (widget-styles-sourced-from-sds-tokens)", () => {
    const tokens = readRepoFile("widget/src/tokens.ts");
    // Upstream SDS uses :root; the widget MUST scope to :host so it stays
    // shadow-DOM only and never leaks into the host page.
    expect(tokens).not.toMatch(/:root\b/);
  });

  it("widget/src/tokens.ts has no @media (prefers-color-scheme: dark) block (widget-styles-sourced-from-sds-tokens)", () => {
    const tokens = readRepoFile("widget/src/tokens.ts");
    // Dark mode is intentionally not supported by the widget in this
    // codebase. A surprise dark block reintroduces the bug we vendored
    // around. We only count active CSS @media rules (not comments
    // explaining the removal).
    //
    // Strategy: strip JS block comments first, then assert no live
    // `@media (prefers-color-scheme: dark)` rule survives.
    const stripped = tokens
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    expect(stripped).not.toMatch(/@media[^{]*prefers-color-scheme:\s*dark/);
  });

  // ── Cursor badge: custom geometry, SDS-only colour ───────────────────────

  it("cursor-badge fill resolves through an SDS token (cursor-badge-remains-custom-consumes-sds-brand-token-only)", () => {
    const styles = readRepoFile("widget/src/styles.ts");
    // Locate the `.fp-cursor-badge` block and its declarations.
    const m = styles.match(/\.fp-cursor-badge\s*\{[\s\S]*?\}/);
    expect(m, "could not find .fp-cursor-badge rule").toBeTruthy();
    const block = m![0];
    // Background must trace through a token chain — directly via
    // var(--sds-*) or via the project alias --fp-hl which itself references
    // var(--sds-*).
    const usesAlias = /background:\s*var\(--fp-hl/.test(block);
    const usesSds = /background:\s*var\(--sds-/.test(block);
    expect(usesAlias || usesSds).toBe(true);
    // The geometry markers (20px circle, border-radius pill) MUST stay so
    // the cursor stays a custom 20px badge, not an SDS-shaped surface.
    expect(block).toMatch(/width:\s*20px/);
    expect(block).toMatch(/height:\s*20px/);
  });

  // ── Outline-only highlight: SDS color, raw geometry ──────────────────────

  it("outline-only highlight uses an SDS-sourced colour and preserves 2px transparent-fill geometry (outline-only-highlight-consumes-sds-color-tokens-only-geometry-preserved)", () => {
    const styles = readRepoFile("widget/src/styles.ts");
    const m = styles.match(/\.fp-highlight\s*\{[\s\S]*?\}/);
    expect(m, "could not find .fp-highlight rule").toBeTruthy();
    const block = m![0];
    // Border colour resolves through --fp-hl (which is a var(--sds-*) chain).
    expect(block).toMatch(/border:\s*2px\s+solid\s+var\(--fp-hl\)/);
    // Fill stays transparent — no fill is the whole point of "outline-only".
    expect(block).toMatch(/background:\s*transparent/);
  });

  // ── Submit button radius mapped to SDS radius-200 ────────────────────────

  it("submit button border-radius maps to --sds-size-radius-200 (submit-button-radius-mapped-to-sds-radius-200)", () => {
    const styles = readRepoFile("widget/src/styles.ts");
    const m = styles.match(/\.fp-submit\s*\{[\s\S]*?\}/);
    expect(m, "could not find .fp-submit rule").toBeTruthy();
    const block = m![0];
    expect(block).toMatch(/border-radius:\s*var\(--sds-size-radius-200/);
  });

  // ── No CDN React in dashboard SPA ────────────────────────────────────────

  it("dashboard/web/src/ does not import from esm.sh (no-cdn-react-in-dashboard)", () => {
    const root = join(REPO_ROOT, "dashboard/web/src");
    const files = walkSource(root);
    expect(files.length).toBeGreaterThan(0);
    const offenders: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      if (/['"]https:\/\/esm\.sh\//.test(text) || /from\s+["']https:\/\/esm\.sh\//.test(text)) {
        offenders.push(f.slice(REPO_ROOT.length + 1));
      }
    }
    expect(
      offenders,
      "dashboard SPA must not import any module from esm.sh",
    ).toEqual([]);
  });

  it("dashboard/worker/reviewHtml.ts is the ONLY allowed esm.sh consumer in the dashboard surface (no-cdn-react-in-dashboard, allowed exception)", () => {
    // Sanity-check that the documented exception still loads esm.sh — if
    // someone "fixes" it here, the test will surface so the manifest
    // exception can be removed alongside it.
    const text = readRepoFile("dashboard/worker/reviewHtml.ts");
    expect(text).toMatch(/esm\.sh/);
  });
});
