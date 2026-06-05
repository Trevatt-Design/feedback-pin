#!/usr/bin/env node
/**
 * Create a project + token in the feedback-pin D1 database.
 *
 * Usage:
 *   node scripts/create-project.mjs --name "Acme Site" --origin "https://acme.com"
 *
 * Run from the repo root. Wrangler must be authenticated.
 */
import { execSync } from "node:child_process";
import { randomUUID, randomBytes } from "node:crypto";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith("--")) acc.push([cur.slice(2), arr[i + 1]]);
    return acc;
  }, [])
);

if (!args.name) {
  console.error("Usage: create-project.mjs --name \"Project name\" [--origin https://site.com]");
  process.exit(1);
}

const id = "proj_" + randomBytes(4).toString("hex");
const token = "fpt_" + randomBytes(20).toString("hex");
const origin = args.origin || null;
const created = Date.now();
const remote = args.remote ? "--remote" : "";

const sql = `
INSERT INTO projects (id, name, token, origin, created_at)
VALUES ('${id}', '${(args.name).replace(/'/g, "''")}', '${token}', ${origin ? `'${origin}'` : "NULL"}, ${created});
`;

execSync(`cd api && wrangler d1 execute feedback-pin ${remote} --command="${sql.replace(/\n/g, " ").replace(/"/g, '\\"')}"`, { stdio: "inherit" });

console.log("\nProject created.\n");
console.log("  id:     " + id);
console.log("  name:   " + args.name);
console.log("  origin: " + (origin || "(any)"));
console.log("  token:  " + token);
console.log("\nInstall snippet for the host site:\n");
console.log(`  <script src="https://your-cdn/feedback-pin.js"`);
console.log(`          data-project-token="${token}"`);
console.log(`          data-api="https://feedback-pin-api.your-account.workers.dev"></script>\n`);
