// Build the self-contained feedback-pin bundle that ships inside a host repo
// (orbit-web-app, orbit-mobile-app) and boots with its dev command.
//
//   node scripts/package-bundle.mjs <out_dir> [--keep-project <id> ...]
//
// The bundle holds the API and dashboard workers (run with `wrangler dev`),
// the prebuilt dashboard SPA and widget, a seed of the local database and
// screenshot store, and boot.mjs. Build the widget and dashboard first:
//   npm run build && npm run build:dashboard
//
// The seed is taken from the local wrangler state (api/.wrangler/state/v3).
// Only the projects named with --keep-project are kept; everything else
// (smoke-test data) is dropped from D1 and R2 and the files are vacuumed.

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const out = args[0] && !args[0].startsWith("--") ? resolve(args[0]) : null;
const keep = args.flatMap((a, i) => (args[i - 1] === "--keep-project" ? [a] : []));
if (!out || !keep.length) {
  console.error("usage: node scripts/package-bundle.mjs <out_dir> --keep-project <id> [--keep-project <id>]");
  process.exit(1);
}

const root = process.cwd();
const tpl = join(root, "bundle");
const sql = (db, q) => execFileSync("sqlite3", [db, q]).toString().trim();
const must = (p, hint) => { if (!existsSync(p)) { console.error(`missing ${p}. ${hint}`); process.exit(1); } };

must(join(root, "widget/dist/feedback-pin.js"), "Run `npm run build`.");
must(join(root, "dashboard/web/dist/index.html"), "Run `npm run build:dashboard`.");
const state = join(root, "api/.wrangler/state/v3");
must(state, "No local API state to seed from.");

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// Workers: source only; wrangler bundles the TypeScript itself.
const copy = (from, to = from) => cpSync(join(root, from), join(out, to), { recursive: true });
for (const f of ["src", "wrangler.toml", "tsconfig.json", "schema.sql", "schema-v2.sql", "schema-v3.sql"]) copy(`api/${f}`);
for (const f of ["worker", "wrangler.toml", "tsconfig.json", "web/dist"]) copy(`dashboard/${f}`);
copy("widget/dist/feedback-pin.js", "widget/feedback-pin.js");
for (const f of ["boot.mjs", "README.md", "package.json", "package-lock.json", "gitignore"]) {
  cpSync(join(tpl, f), join(out, f === "gitignore" ? ".gitignore" : f));
}

// Seed: snapshot D1 and R2 with sqlite's online backup (safe while wrangler
// dev is running), then drop every project not kept.
const seed = join(out, "seed/v3");
const d1Dir = join(state, "d1/miniflare-D1DatabaseObject");
const r2Dir = join(state, "r2/miniflare-R2BucketObject");
const blobsDir = join(state, "r2/feedback-pin-screenshots/blobs");
const d1File = readdirSync(d1Dir).find((f) => f.endsWith(".sqlite"));
const r2File = readdirSync(r2Dir).find((f) => f.endsWith(".sqlite"));
mkdirSync(join(seed, "d1/miniflare-D1DatabaseObject"), { recursive: true });
mkdirSync(join(seed, "r2/miniflare-R2BucketObject"), { recursive: true });
mkdirSync(join(seed, "r2/feedback-pin-screenshots/blobs"), { recursive: true });
const d1 = join(seed, "d1/miniflare-D1DatabaseObject", d1File);
const r2 = join(seed, "r2/miniflare-R2BucketObject", r2File);
sql(join(d1Dir, d1File), `.backup '${d1}'`);
sql(join(r2Dir, r2File), `.backup '${r2}'`);

const inList = keep.map((k) => `'${k.replace(/'/g, "")}'`).join(",");
sql(d1, `
  DELETE FROM item_events   WHERE item_id IN (SELECT id FROM items WHERE project_id NOT IN (${inList}));
  DELETE FROM item_comments WHERE item_id IN (SELECT id FROM items WHERE project_id NOT IN (${inList}));
  DELETE FROM items         WHERE project_id NOT IN (${inList});
  DELETE FROM replies       WHERE comment_id IN (SELECT id FROM comments WHERE project_id NOT IN (${inList}));
  DELETE FROM comments      WHERE project_id NOT IN (${inList});
  DELETE FROM projects      WHERE id NOT IN (${inList});
  -- Local copies run on localhost or 127.0.0.1; don't pin an origin.
  UPDATE projects SET origin = NULL;
  VACUUM;`);

const keyFilter = keep.map((k) => `key NOT LIKE '${k.replace(/'/g, "")}/%'`).join(" AND ");
sql(r2, `DELETE FROM _mf_objects WHERE ${keyFilter}; DELETE FROM _mf_multipart_parts; DELETE FROM _mf_multipart_uploads; VACUUM;`);
// Single-file databases: no -wal/-shm side files in the seed.
for (const db of [d1, r2]) sql(db, "PRAGMA journal_mode=DELETE;");
for (const f of readdirSync(join(seed, "r2/miniflare-R2BucketObject")).concat(readdirSync(join(seed, "d1/miniflare-D1DatabaseObject")))) {
  if (/-(wal|shm)$/.test(f)) rmSync(join(seed, f.includes(r2File.slice(0, 8)) ? "r2/miniflare-R2BucketObject" : "d1/miniflare-D1DatabaseObject", f), { force: true });
}
const blobIds = sql(r2, "SELECT blob_id FROM _mf_objects WHERE blob_id IS NOT NULL").split("\n").filter(Boolean);
for (const b of blobIds) cpSync(join(blobsDir, b), join(seed, "r2/feedback-pin-screenshots/blobs", b));

// Record what went in, for the boot banner and the README.
const counts = sql(d1, "SELECT p.id || '|' || p.name || '|' || p.token || '|' || (SELECT count(*) FROM comments c WHERE c.project_id = p.id) || '|' || (SELECT count(*) FROM items i WHERE i.project_id = p.id) FROM projects p ORDER BY p.id")
  .split("\n").map((l) => { const [id, name, token, comments, items] = l.split("|"); return { id, name, token, comments: +comments, items: +items }; });
const fpVersion = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root }).toString().trim();
writeFileSync(join(out, "seed/manifest.json"), JSON.stringify({ built_at: new Date().toISOString(), from: `feedback-pin@${fpVersion}`, projects: counts, screenshots: blobIds.length }, null, 2) + "\n");

const size = (p) => { let n = 0; for (const e of readdirSync(p, { withFileTypes: true })) n += e.isDirectory() ? size(join(p, e.name)) : statSync(join(p, e.name)).size; return n; };
console.log(JSON.stringify({ out, projects: counts.map(({ token, ...c }) => c), screenshots: blobIds.length, seed_mb: +(size(join(out, "seed")) / 1048576).toFixed(1), total_mb: +(size(out) / 1048576).toFixed(1) }));
