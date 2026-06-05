/**
 * Slim dashboard Worker. Replaces the previous monolith
 * (dashboard/src/index.ts) which inlined the whole SPA shell as a
 * template string. The SPA now lives in `dashboard/web/` and is served
 * via the Workers Static Assets binding (see wrangler.toml).
 *
 * Routes:
 *   GET /health   → "{ ok: true }"
 *   GET /review   → server-rendered iframe wrapper that embeds the widget
 *                   (intentionally not part of the SPA build per Stage 3
 *                   amendment; loads React from esm.sh because it has its
 *                   own visual + behaviour vocabulary).
 *   *             → ASSETS.fetch (Vite-built SPA, with SPA fallback to
 *                   /index.html via not_found_handling = single-page-application).
 *
 * `run_worker_first = true` ensures the Worker sees /health and /review
 * before the SPA fallback intercepts.
 *
 * Every HTML response gets a strict CSP. The `<api-origin>` placeholders
 * are filled from `env.API_URL` (no runtime <script> injection — the
 * Vite bundle bakes the URL at build time via `VITE_API_URL`).
 */
import { reviewHtml } from "./reviewHtml";

interface Env {
  API_URL: string;
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

/**
 * Strict CSP for the SPA shell. The Vite bundle is fully static (no inline
 * scripts) and bakes VITE_API_URL at build time, so script-src can stay tight
 * at 'self'. style-src 'unsafe-inline' covers Vite's inlined critical CSS and
 * react-aria-components' style attributes. frame-src * is required for /review
 * to embed any user-supplied URL.
 */
function buildSpaCsp(apiOrigin: string): string {
  return [
    "default-src 'self'",
    `img-src 'self' data: blob: ${apiOrigin}`,
    `connect-src 'self' ${apiOrigin}`,
    "frame-src *",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self'",
  ].join("; ");
}

/**
 * Relaxed CSP for /review only. The wrapper at dashboard/worker/reviewHtml.ts
 * ships an inline <script type="module"> that imports React from
 * https://esm.sh/. To run that bundle the CSP must allow:
 *   - script-src 'unsafe-inline' (the inline <script>),
 *   - script-src https://esm.sh (the import URLs),
 *   - connect-src https://esm.sh (esm.sh fetches transitive deps as ESM
 *     modules over the network at runtime).
 * The strict SPA CSP above is preserved for every other HTML response so this
 * relaxation does NOT widen the SPA's attack surface.
 */
function buildReviewCsp(apiOrigin: string): string {
  return [
    "default-src 'self'",
    `img-src 'self' data: blob: ${apiOrigin}`,
    `connect-src 'self' ${apiOrigin} https://esm.sh`,
    "frame-src *",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline' https://esm.sh",
  ].join("; ");
}

function originOf(u: string): string {
  try {
    return new URL(u).origin;
  } catch {
    return "";
  }
}

function withCsp(res: Response, csp: string): Response {
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("text/html")) return res;
  const headers = new Headers(res.headers);
  headers.set("content-security-policy", csp);
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    // env.API_URL defaults to "" if unset so origin parsing doesn't throw;
    // the SPA bakes the build-time VITE_API_URL into its bundle, so an empty
    // runtime API_URL only affects /review and the CSP `connect-src` clause.
    const apiUrl = env.API_URL || "";
    const apiOrigin = originOf(apiUrl);

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json" },
      });
    }
    if (url.pathname === "/review") {
      const body = reviewHtml(apiUrl);
      return withCsp(
        new Response(body, {
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
        buildReviewCsp(apiOrigin),
      );
    }
    // Fallback: serve the Vite-built SPA from the static-assets binding.
    // Strict CSP applies — the SPA has no inline scripts and no CDN imports.
    // Surface a clearer error if the binding is missing (misconfigured deploy)
    // rather than letting the runtime throw a bare TypeError.
    if (!env.ASSETS || typeof env.ASSETS.fetch !== "function") {
      return new Response(
        "Dashboard misconfigured: missing ASSETS binding. Check wrangler.toml [assets].",
        { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } },
      );
    }
    const assetRes = await env.ASSETS.fetch(req);
    return withCsp(assetRes, buildSpaCsp(apiOrigin));
  },
};
