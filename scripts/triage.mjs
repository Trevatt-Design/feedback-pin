#!/usr/bin/env node
/**
 * Triage helper (api-review-items). The checking is done by a person or by
 * Claude against Notion, the wireframes and the GUI; this script only moves
 * the results in and out of the API.
 *
 *   node scripts/triage.mjs queue                 untriaged open comments, as JSON
 *   node scripts/triage.mjs post items.json       create items from a triage file
 *   node scripts/triage.mjs approvers Michael,…   set who may decide and sign off
 *
 * Env: FP_API (default http://localhost:8787), FP_TOKEN (project token),
 *      FP_ACTOR (default "triage").
 *
 * items.json is a list of:
 *   { comment_ids: [..], title, kind: "question"|"command",
 *     outcome: "answered"|"built-right"|"build-fix"|"missing"|"conflict",
 *     verdict?, round?, reply?,
 *     design?:   { figma_url?, figma_node?, screen_key?, notion?: [{label,url,quote}], image_path? },
 *     proposal?: { summary?, figma_url?, effects?, image_path? } }
 * An image_path (a local PNG/JPG, e.g. a Figma export) is uploaded and
 * replaced with image_key so the dashboard can show it next to the build.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

const API = (process.env.FP_API || "http://localhost:8787").replace(/\/$/, "");
const TOKEN = process.env.FP_TOKEN;
const ACTOR = process.env.FP_ACTOR || "triage";
if (!TOKEN) {
  console.error("FP_TOKEN is required");
  process.exit(2);
}
const auth = { authorization: "Bearer " + TOKEN, "x-fp-actor": ACTOR };

async function call(method, p, body, headers = {}) {
  const res = await fetch(API + p, {
    method,
    headers: { ...auth, ...headers, ...(body && !(body instanceof Uint8Array) ? { "content-type": "application/json" } : {}) },
    body: body instanceof Uint8Array ? body : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`${method} ${p} -> ${res.status} ${typeof data === "string" ? data : data.error}`);
  return data;
}

async function upload(file, base) {
  const abs = path.resolve(base, file);
  const buf = new Uint8Array(await readFile(abs));
  const ext = path.extname(abs).toLowerCase();
  const ct = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  const { key } = await call("POST", "/v1/screenshots", buf, { "content-type": ct });
  return key;
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === "queue") {
  const { comments } = await call("GET", "/v1/triage/queue");
  console.log(JSON.stringify(comments.map((c) => ({
    id: c.id, url: c.url, what: c.what, change_text: c.change_text, why_text: c.why_text,
    screenshot_key: c.screenshot_key, created_at: new Date(c.created_at).toISOString(),
  })), null, 2));
} else if (cmd === "post") {
  if (!arg) throw new Error("usage: triage.mjs post items.json");
  const base = path.dirname(path.resolve(arg));
  const items = JSON.parse(await readFile(arg, "utf8"));
  // Comment ids may be given as short prefixes (as in exports); expand them.
  const { comments: all } = await call("GET", "/v1/comments");
  const expand = (p) => {
    const m = all.filter((c) => c.id.startsWith(p));
    if (m.length !== 1) throw new Error(`comment id ${p} matches ${m.length} comments`);
    return m[0].id;
  };
  for (const it of items) it.comment_ids = it.comment_ids.map(expand);
  for (const it of items) {
    for (const k of ["design", "proposal"]) {
      if (it[k]?.image_path) {
        it[k].image_key = await upload(it[k].image_path, base);
        delete it[k].image_path;
      }
    }
    const r = await call("POST", "/v1/items", it);
    console.log(`${r.ref}  ${r.stage.padEnd(18)} ${it.title}`);
  }
} else if (cmd === "approvers") {
  const list = (arg || "").split(",").map((s) => s.trim()).filter(Boolean);
  console.log(JSON.stringify(await call("PUT", "/v1/projects/me/approvers", { approvers: list })));
} else {
  console.error("usage: triage.mjs queue | post items.json | approvers A,B");
  process.exit(2);
}
