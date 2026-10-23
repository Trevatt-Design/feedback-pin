#!/usr/bin/env node
// Design feedback (feedback-pin), local copy.
//
//   node tools/feedback-pin/boot.mjs --project <project_id> -- <dev command>
//
// Runs the dev command straight away, and alongside it starts the comment
// API (:8787), the dashboard (:8789) and the widget file server (:8790).
// The dev command gets the env it needs to show the comment widget/overlay.
// When the dev command exits, everything this script started stops too.
//
// First run installs wrangler into this folder and copies the seeded
// comments to ~/.feedback-pin/orbit. Both Orbit repos share that folder, so
// comments left in the app and the website land in one dashboard. If the
// servers are already up (started from the other repo), they are reused.
//
// FEEDBACK_PIN=off skips all of it and just runs the dev command.

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { cpSync, createWriteStream, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const TOOL = dirname(fileURLToPath(import.meta.url));
const STATE = process.env.FEEDBACK_PIN_STATE || join(homedir(), ".feedback-pin", "orbit");
const LOGS = join(STATE, "logs");
const PORTS = { api: 8787, dashboard: 8789, widget: 8790 };
// Each wrangler process opens a debugger port; the default 9229 would clash
// between the two and with a developer's own Node debugger.
const INSPECT = { api: 9241, dashboard: 9242 };

const argv = process.argv.slice(2);
const sep = argv.indexOf("--");
const own = sep === -1 ? argv : argv.slice(0, sep);
const cmd = sep === -1 ? [] : argv.slice(sep + 1);
const projectId = own[own.indexOf("--project") + 1];
const off = /^(off|0|false)$/i.test(process.env.FEEDBACK_PIN || "") || !!process.env.CI;

const say = (msg) => process.stdout.write(`\x1b[2m[feedback]\x1b[0m ${msg}\n`);
const manifest = JSON.parse(readFileSync(join(TOOL, "seed/manifest.json"), "utf8"));
const project = manifest.projects.find((p) => p.id === projectId);

// --- Env for the dev command -------------------------------------------
const env = { ...process.env };
if (!off && project) {
  const set = (k, v) => { if (!env[k]) env[k] = v; };
  // Website (React Router): loaded by app/components/feedback-pin.tsx.
  set("FEEDBACK_PIN_SCRIPT", `http://localhost:${PORTS.widget}/feedback-pin.js`);
  set("FEEDBACK_PIN_API", `http://localhost:${PORTS.api}`);
  set("FEEDBACK_PIN_TOKEN", project.token);
  // App (Expo): read by src/dev/feedback-overlay.tsx in __DEV__ only.
  set("EXPO_PUBLIC_FEEDBACK_PIN_API", `http://127.0.0.1:${PORTS.api}`);
  set("EXPO_PUBLIC_FEEDBACK_PIN_TOKEN", project.token);
}

// --- Run the dev command first; the tool never blocks it ---------------
const children = [];
let widgetServer = null;
let child = null;
if (cmd.length) {
  child = spawn(cmd.join(" "), { stdio: "inherit", shell: true, env });
  child.on("exit", (code, signal) => { stopAll(); process.exit(signal ? 1 : code ?? 0); });
}
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(sig, () => { stopAll(); if (child) child.kill(sig); else process.exit(0); });
}
function stopAll() {
  for (const c of children) { try { process.kill(-c.pid, "SIGTERM"); } catch { try { c.kill("SIGTERM"); } catch {} } }
  children.length = 0;
  if (widgetServer) { widgetServer.close(); widgetServer = null; }
}

if (off) {
  if (!cmd.length) say("FEEDBACK_PIN is off.");
} else if (!project) {
  say(`unknown --project "${projectId}". Seeded: ${manifest.projects.map((p) => p.id).join(", ")}`);
} else {
  startTool().catch((e) => say(`could not start (${e.message}). Dev carries on without comments. Logs: ${LOGS}`));
}

// --- The tool ------------------------------------------------------------
async function up(url) {
  try { const r = await fetch(url, { signal: AbortSignal.timeout(1500) }); return r.ok; } catch { return false; }
}

function run(file, args, opts, logName) {
  mkdirSync(LOGS, { recursive: true });
  const log = createWriteStream(join(LOGS, logName), { flags: "a" });
  const p = spawn(file, args, { ...opts, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
  p.stdout.pipe(log); p.stderr.pipe(log);
  return p;
}

function exec(file, args, opts, logName) {
  return new Promise((res, rej) => {
    const p = run(file, args, opts, logName);
    p.on("error", rej);
    p.on("exit", (code) => (code === 0 ? res() : rej(new Error(`${logName.replace(".log", "")} exited ${code}`))));
  });
}

async function startTool() {
  const apiUrl = `http://127.0.0.1:${PORTS.api}/health`;
  const dashUrl = `http://127.0.0.1:${PORTS.dashboard}/health`;

  if (!(await up(apiUrl))) {
    const wrangler = join(TOOL, "node_modules/wrangler/bin/wrangler.js");
    if (!existsSync(wrangler)) {
      say("first run: installing the comment tool (about a minute, once)");
      const npm = process.platform === "win32" ? "npm.cmd" : "npm";
      await exec(npm, ["ci", "--no-audit", "--no-fund", "--loglevel=error"], { cwd: TOOL, shell: process.platform === "win32" }, "install.log");
    }
    if (!existsSync(join(STATE, "v3"))) {
      mkdirSync(STATE, { recursive: true });
      cpSync(join(TOOL, "seed/v3"), join(STATE, "v3"), { recursive: true });
      say(`seeded ${manifest.projects.map((p) => `${p.name} (${p.comments} comments)`).join(", ")} into ${STATE}`);
    }
    const wenv = { ...process.env, WRANGLER_SEND_METRICS: "false", NO_UPDATE_NOTIFIER: "1", FORCE_COLOR: "0" };
    children.push(run(process.execPath, [wrangler, "dev", "--port", String(PORTS.api), "--inspector-port", String(INSPECT.api), "--persist-to", STATE], { cwd: join(TOOL, "api"), env: wenv }, "api.log"));
    if (!(await up(dashUrl))) {
      children.push(run(process.execPath, [wrangler, "dev", "--port", String(PORTS.dashboard), "--inspector-port", String(INSPECT.dashboard)], { cwd: join(TOOL, "dashboard"), env: wenv }, "dashboard.log"));
    }
  }

  if (!(await up(`http://127.0.0.1:${PORTS.widget}/feedback-pin.js`))) {
    const js = readFileSync(join(TOOL, "widget/feedback-pin.js"));
    widgetServer = createServer((req, res) => {
      const ok = (req.url || "").split("?")[0] === "/feedback-pin.js";
      res.writeHead(ok ? 200 : 404, { "content-type": "text/javascript; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "no-store" });
      res.end(ok ? js : "");
    });
    widgetServer.on("error", () => { widgetServer = null; });
    widgetServer.listen(PORTS.widget);
  }

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if ((await up(apiUrl)) && (await up(dashUrl))) {
      say(`comments on. Dashboard http://localhost:${PORTS.dashboard} (sign in with ${project.token})`);
      return;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("servers did not answer within 90s");
}
