#!/usr/bin/env node
/**
 * Cross-import boundary guard. Fails the build if any file under
 * widget/src/**\/*.ts imports from dashboard/web — the widget MUST stay
 * vanilla TS in a shadow DOM and CANNOT bring React + react-aria-
 * components along.
 *
 * Project doesn't currently use ESLint, so this script enforces the
 * boundary via a simple regex grep run from the widget package's
 * `prebuild` script. The corresponding manifest contract is
 * `widget-does-not-import-dashboard-sds` (Stage 3 amendment).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Anchor to the widget package root, regardless of cwd. This script is
// invoked by npm `prebuild` from widget/, but we don't want to depend on
// that — running it from the repo root should also work.
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "src");

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx|js|mjs|cjs)$/i.test(full)) out.push(full);
  }
  return out;
}

// Only inspect actual import / dynamic-import / require statements.
// Comments mentioning the dashboard are allowed; only real module loads
// from dashboard/** are blocked.
const importRe =
  /(?:^|\s)(?:import\s[^;]*?from|import\s*\(|require\s*\()\s*["']([^"']+)["']/;

const offenders = [];
for (const f of walk(ROOT)) {
  const text = readFileSync(f, "utf8");
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    const m = ln.match(importRe);
    if (!m) continue;
    const spec = m[1];
    if (/(^|\/)dashboard($|\/)/.test(spec) || /dashboard\/web/.test(spec)) {
      offenders.push(`${f}:${i + 1}: imports "${spec}"`);
    }
  }
}

if (offenders.length) {
  console.error("[check-no-cross-import] FAIL: widget must not import from dashboard.");
  for (const o of offenders) console.error("  " + o);
  process.exit(1);
}
console.log("[check-no-cross-import] PASS");
