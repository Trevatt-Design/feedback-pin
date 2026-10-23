// Export a project's comments + screenshots from the LOCAL wrangler state
// into a browsable folder: one markdown file per page, screenshots alongside.
// Usage: node scripts/export-local.mjs <project_id> <out_dir>
import { execSync } from "node:child_process";
import { mkdirSync, copyFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const [projectId, outDir] = process.argv.slice(2);
if (!projectId || !outDir) {
  console.error("usage: node scripts/export-local.mjs <project_id> <out_dir>");
  process.exit(1);
}

const state = join(process.cwd(), "api/.wrangler/state/v3");
const d1Dir = join(state, "d1/miniflare-D1DatabaseObject");
const r2Dir = join(state, "r2/miniflare-R2BucketObject");
const r2Blobs = join(state, "r2/feedback-pin-screenshots/blobs");

const sq = (db, sql) =>
  JSON.parse(execSync(`sqlite3 -json "${db}" "${sql.replace(/"/g, '\\"')}"`).toString() || "[]");

const d1 = readdirSync(d1Dir).find((f) => f.endsWith(".sqlite"));
const r2 = readdirSync(r2Dir).find((f) => f.endsWith(".sqlite"));

const comments = sq(
  join(d1Dir, d1),
  `select id,url,selector,dom_path,what,change_text,why_text,status,site_wide,created_at,screenshot_key,x_pct,y_pct,viewport_w,viewport_h,anon_id,metadata from comments where project_id='${projectId}' order by created_at`
);
const blobs = Object.fromEntries(
  sq(join(r2Dir, r2), "select key, blob_id from _mf_objects").map((r) => [r.key, r.blob_id])
);

mkdirSync(join(outDir, "screenshots"), { recursive: true });

const byPage = new Map();
comments.forEach((c, i) => {
  c.n = i + 1;
  const path = new URL(c.url).pathname + (new URL(c.url).search || "");
  if (!byPage.has(path)) byPage.set(path, []);
  byPage.get(path).push(c);
});

const fmt = (ms) => new Date(ms).toISOString().replace("T", " ").slice(0, 16);
let index = `# ${projectId} — ${comments.length} comments\n\n`;

for (const [path, list] of byPage) {
  const slug = path === "/" ? "home" : path.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "-");
  let md = `# ${path}\n\n${list.length} comment${list.length === 1 ? "" : "s"}\n\n`;
  for (const c of list) {
    let shot = "";
    if (c.screenshot_key && blobs[c.screenshot_key]) {
      const name = `${String(c.n).padStart(3, "0")}-${slug}.png`;
      try {
        copyFileSync(join(r2Blobs, blobs[c.screenshot_key]), join(outDir, "screenshots", name));
        shot = `\n\n![](screenshots/${name})`;
      } catch {}
    }
    md += `## ${c.n}. ${c.change_text.split("\n")[0]}\n\n`;
    md += `- ${fmt(c.created_at)} · ${c.status}${c.site_wide ? " · site-wide" : ""}\n`;
    md += `- On: \`${c.what}\`\n`;
    md += `- Selector: \`${c.selector}\`\n`;
    md += `- DOM path: \`${c.dom_path}\`\n`;
    md += `- Position: ${Math.round(c.x_pct * 100)}% across, ${Math.round(c.y_pct * 100)}% down a ${c.viewport_w}×${c.viewport_h} viewport\n`;
    try {
      const m = JSON.parse(c.metadata);
      md += `- Device: ${m.sw}×${m.sh} @${m.dpr}x, ${m.platform}, ${m.lang}, ${m.tz}\n`;
      md += `- Browser: ${m.ua}\n`;
      if (m.ai) md += `- AI reading: ${JSON.stringify(m.ai)}\n`;
    } catch {}
    md += `- Reviewer: ${c.anon_id} · id ${c.id}\n`;
    if (c.change_text.includes("\n")) md += `\n${c.change_text}\n`;
    if (c.why_text) md += `\nWhy: ${c.why_text}\n`;
    md += `${shot}\n\n---\n\n`;
  }
  writeFileSync(join(outDir, `${slug}.md`), md);
  index += `- [${path}](${slug}.md) — ${list.length}\n`;
}
writeFileSync(join(outDir, "README.md"), index);
writeFileSync(
  join(outDir, "comments.json"),
  JSON.stringify(
    comments.map((c) => ({
      ...c,
      metadata: (() => { try { return JSON.parse(c.metadata); } catch { return c.metadata; } })(),
      screenshot: c.screenshot_key && blobs[c.screenshot_key]
        ? `screenshots/${String(c.n).padStart(3, "0")}-${(new URL(c.url).pathname === "/" ? "home" : new URL(c.url).pathname.replace(/^\//, "") + (new URL(c.url).search || "")).replace(/[^a-z0-9]+/gi, "-")}.png`
        : null,
    })),
    null,
    2
  )
);
console.log(`${comments.length} comments across ${byPage.size} pages → ${outDir}`);
