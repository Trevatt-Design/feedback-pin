import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for feedback-pin e2e.
 *
 * The harness expects three local servers:
 *   - API:        http://localhost:8787   (api/, wrangler dev)
 *   - Dashboard:  http://localhost:8789   (dashboard/, wrangler dev — must
 *                                          have web/dist/ built first)
 *   - Static:     http://localhost:5173   (repo root, http-server)
 *
 * Stage 4 amendment: the dashboard now serves a Vite-built SPA from
 * `dashboard/web/dist` via the [assets] binding in wrangler.toml. If the
 * build directory is missing, e2e tests will hit a blank SPA shell and
 * silently fail. The `webServer` entry below builds the SPA first
 * (`npm run build:dashboard`) and then starts `wrangler dev` on :8789.
 *
 * `reuseExistingServer: true` means: if you already have all three
 * processes running locally (the common dev workflow), Playwright will
 * skip spawning them and just use yours. CI runs on a clean checkout so
 * the spawns matter there.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [["list"]],
  use: {
    headless: true,
    baseURL: "http://localhost:5173",
    actionTimeout: 5_000,
    navigationTimeout: 10_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Order matters here: webServer is started in array order, but each
  // entry's `command` is a single shell pipeline so we can chain
  // `vite build && wrangler dev` for the dashboard. The API and static
  // server entries are idempotent (`reuseExistingServer: true`) — they
  // are no-ops when developers already have them running.
  webServer: [
    {
      // API worker on :8787.
      command: "npx wrangler dev --port 8787",
      cwd: "./api",
      url: "http://localhost:8787/health",
      reuseExistingServer: true,
      timeout: 60_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      // Static smoke-test page on :5173.
      command: "npx --yes http-server . -p 5173 -c-1 -s",
      url: "http://localhost:5173/smoke-test/",
      reuseExistingServer: true,
      timeout: 30_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      // Dashboard worker on :8789. MUST run `vite build` first — wrangler
      // dev binds `dashboard/web/dist/` as the [assets] directory, so a
      // stale or missing dist means the SPA never mounts.
      //
      // The build script reads $API_URL and bakes it into the bundle as
      // `import.meta.env.VITE_API_URL`. Tests stub absolute API URLs at
      // `http://localhost:8787`, so the build must produce a bundle whose
      // fetch() targets that origin (otherwise the SPA fetches relative
      // paths against :8789 and bypasses every Playwright route stub).
      command:
        "API_URL=http://localhost:8787 npm run build:dashboard --silent && cd dashboard && npx wrangler dev --port 8789",
      url: "http://localhost:8789/health",
      reuseExistingServer: true,
      timeout: 180_000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
