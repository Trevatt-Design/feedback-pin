#!/usr/bin/env node
/**
 * Bundle-budget guard. Runs after `vite build` from the dashboard/web
 * package's build script. Sums gzipped sizes of every .js and .css file
 * under dist/ recursively and fails (exit 1) if either total exceeds:
 *
 *   JS  ≤ 200000 bytes gz first-load
 *   CSS ≤ 100000 bytes gz first-load
 *
 * These thresholds are the contract under manifest's
 * `dashboard-bundle-budget` (Stage 3 amendment).
 *
 * Output is a small table so deploy logs surface the trend over time.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const DIST = join(process.cwd(), "dist");
const JS_BUDGET = 200_000;
const CSS_BUDGET = 100_000;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walk(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

let files;
try {
  files = walk(DIST);
} catch (e) {
  console.error("[check-bundle] No dist/ directory; did vite build succeed?", e?.message || e);
  process.exit(1);
}

const rows = [];
let jsTotal = 0;
let cssTotal = 0;
for (const f of files) {
  if (!/\.(js|css|mjs)$/i.test(f)) continue;
  const buf = readFileSync(f);
  const gz = gzipSync(buf).length;
  const isCss = /\.css$/i.test(f);
  if (isCss) cssTotal += gz;
  else jsTotal += gz;
  rows.push({ kind: isCss ? "css" : "js", path: f.slice(DIST.length + 1), raw: buf.length, gz });
}

rows.sort((a, b) => b.gz - a.gz);

console.log("\n[check-bundle] Per-file sizes (sorted by gz desc)");
console.log("kind  raw       gz        path");
for (const r of rows) {
  console.log(
    `${r.kind.padEnd(5)} ${String(r.raw).padStart(8)} ${String(r.gz).padStart(8)} ${r.path}`,
  );
}
console.log(
  `\n[check-bundle] JS gz total : ${jsTotal} / ${JS_BUDGET} (${((jsTotal / JS_BUDGET) * 100).toFixed(1)}%)`,
);
console.log(
  `[check-bundle] CSS gz total: ${cssTotal} / ${CSS_BUDGET} (${((cssTotal / CSS_BUDGET) * 100).toFixed(1)}%)`,
);

let failed = false;
if (jsTotal > JS_BUDGET) {
  console.error(`[check-bundle] FAIL: JS gz total ${jsTotal} exceeds budget ${JS_BUDGET}`);
  failed = true;
}
if (cssTotal > CSS_BUDGET) {
  console.error(`[check-bundle] FAIL: CSS gz total ${cssTotal} exceeds budget ${CSS_BUDGET}`);
  failed = true;
}
if (failed) {
  process.exit(1);
}
console.log("[check-bundle] PASS");
