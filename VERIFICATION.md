# Verification — feedback-pin v1

Checked against the production-ready criteria in `PLAN.md`.

## Criteria

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | One `<script>` tag install, no other config beyond a project token. | ✅ | `widget/src/index.ts` auto-init reads `data-project-token` and `data-api` from script element. See `docs/install.md`. |
| 2 | Client can pin and comment on any element, comment persists after refresh, reply works. | ✅ (code-level) | Widget `loadComments()` runs on init, hits `GET /v1/comments?url=...&status=open`, renders pins. Thread popover supports replies via `POST /v1/comments/:id/replies`. End-to-end runtime test pending deploy. |
| 3 | Anchor resolves after CSS/layout changes. | ✅ | Hybrid: selector (stable attrs → id → class chain) → DOM path (nth-child) → coordinate fallback. `anchor.ts:resolveAnchor()`. |
| 4 | Designer can list, view, reply, resolve from the dashboard. | ✅ | `dashboard/src/index.ts` — Sidebar (open/resolved tabs), CommentList, CommentDetail with reply box and resolve/reopen button. |
| 5 | Performant: < 30KB gz, no host-page jank. | ✅ | Widget bundle: **35.3 KB minified, 11.8 KB gzipped**. All UI in shadow DOM, no layout-affecting CSS leaked. Pin reposition is rAF-throttled. |
| 6 | Safe: token enforced, origin allowlist, screenshots not cross-project readable. | ✅ | Every non-health route requires Bearer token. `routeCreateComment` validates Origin against project allowlist. `routeServeScreenshot` checks key starts with project ID. Honeypot field rejected. |
| 7 | Documented. | ✅ | `README.md`, `docs/install.md`, `PLAN.md`, this file. |
| 8 | Deployed. | ⏳ | Code is deploy-ready. Requires user to run `wrangler d1 create`, `wrangler r2 bucket create`, set IDs in `wrangler.toml`, and `wrangler deploy` from `api/` and `dashboard/`. README has the steps. |

## What works

- **Backend API:** D1 schema, all 8 routes, CORS, R2 screenshot upload + serve, project resolution from token, origin allowlist.
- **Widget:** floating button, picking mode with live highlight, three-field form, screenshot capture (best-effort), pin rendering for existing comments, thread popover with reply, scroll/resize repositioning, shadow-DOM style isolation.
- **Dashboard:** token login, sidebar with open/resolved counts, comment list, detail view with screenshot, fields, thread, designer reply, resolve/reopen.
- **Project provisioning:** CLI script (`scripts/create-project.mjs`) creates a project + token in D1.

## Known gaps (intentional, deferred)

These are out of scope for v1 per the plan:

- **AI triage / auto-edit.** v1.5.
- **SPA route awareness.** Widget reads `location.href` once at init. Single-page apps that change route without reload won't refresh comments. Fix: listen to `popstate` + `pushState` patches.
- **Per-user auth.** Single project token per project. Teams/roles in v2.
- **Rate limiting.** Relying on Cloudflare's edge protection. App-layer rate limit (D1 counter or KV) deferred.
- **Token in screenshot URL.** Dashboard requests screenshots via `?token=` query so `<img src>` works. Token is already in localStorage; this just exposes it to access logs. Mitigation: add a dashboard-side proxy route in v1.1.
- **Multi-page comment view in dashboard.** Currently lists all comments across pages mixed. Works but a per-page filter would help on bigger sites.
- **Tests.** No unit/integration tests yet. Manual deploy + smoke test required before declaring ship.

## Steps to ship

From a clean checkout:

1. `cd api && npm install && npx wrangler d1 create feedback-pin` — paste `database_id` into `api/wrangler.toml`.
2. `npx wrangler r2 bucket create feedback-pin-screenshots`
3. `npm run db:init:remote`
4. `npm run deploy` — note the deployed URL.
5. `cd ../dashboard && npm install` — set `API_URL` in `dashboard/wrangler.toml` to the URL from step 4. `npm run deploy`.
6. `cd .. && node scripts/create-project.mjs --name "Test" --remote` — copy the token.
7. `cd widget && npm install && npm run build` — upload `dist/feedback-pin.js` to a public host (Cloudflare Pages, R2 public bucket, etc.).
8. Drop the script tag on a test page, sanity check: button appears, comment can be left, dashboard shows it, reply works.

## Verdict

Code-level production-ready. Runtime verification pending the user's first deploy.
