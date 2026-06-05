# feedback-pin — v1 plan

A drop-in script that lets clients leave in-situ comments on any website. Designers triage comments in a dashboard. AI-assisted later.

## Principles

- **Comment first, edit never (in v1).** No auto-edit, no DOM mutation. Just capture.
- **Client-primary UX.** The widget is the interface. No login for commenters.
- **One-line install.** `<script src="...?project=abc"></script>`. That's it.
- **Hybrid anchoring.** Selector + DOM path + coords + screenshot + viewport. Resolve in priority order.
- **Coached input, not free-form.** Three fields: What (auto), Change, Why.

## Scope

### In scope (v1)
1. Embeddable widget script (vanilla TS, < 30KB gzipped, no deps).
2. Pin-on-element capture with hybrid anchor.
3. Three-field comment form (What auto / Change / Why).
4. Screenshot of viewport at comment time (html2canvas or `html-to-image`).
5. Cloudflare Worker API: create comment, list comments, resolve, reply.
6. D1 storage for comments and threads. R2 for screenshots.
7. Designer dashboard: list projects, list comments per project, threaded replies, resolve.
8. Project tokens (one per site) — no per-user auth in v1.
9. Pin persistence: comments visible on the site after a refresh, anchored to elements.
10. Reply from dashboard pushes back to the pin thread.

### Out of scope (v1) — capture only
- AI triage, AI edit, AI anything (v1.5).
- Per-user auth, teams, roles (v2).
- Multi-page / SPA route awareness (v1.5).
- Slack / email notifications (v1.5).
- Figma plugin parity (v2).
- Static-mockup commenting (v2).
- The "premium edit" version (separate product, much later).

## Architecture

```
Client browser (any site)
  └── feedback-pin widget (script tag)
        ├── floats a button bottom-right
        ├── click-to-pin mode
        ├── comment form with 3 fields
        ├── captures: selector, DOM path, coords, viewport, screenshot
        └── POSTs to API
              │
              ▼
Cloudflare Worker (api.feedback-pin.workers.dev)
  ├── POST /v1/comments              create
  ├── GET  /v1/comments?project=X    list
  ├── POST /v1/comments/:id/replies  reply
  ├── POST /v1/comments/:id/resolve  resolve
  └── auth: project token in query or header
        │
        ▼
D1 (comments, replies, projects)  +  R2 (screenshots)

Designer dashboard (dashboard.feedback-pin.workers.dev)
  ├── React SPA, single-file pattern
  ├── list of projects → list of comments → thread view
  └── reads/writes same Worker API
```

## Data model

```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,           -- short slug
  name TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,    -- for widget auth
  origin TEXT,                   -- expected origin (CORS)
  created_at INTEGER NOT NULL
);

CREATE TABLE comments (
  id TEXT PRIMARY KEY,           -- uuid
  project_id TEXT NOT NULL,
  url TEXT NOT NULL,             -- page where comment was made
  selector TEXT,                 -- CSS selector (best-effort stable)
  dom_path TEXT,                 -- nth-child path fallback
  x_pct REAL,                    -- coords as % of viewport
  y_pct REAL,
  viewport_w INTEGER,
  viewport_h INTEGER,
  screenshot_key TEXT,           -- R2 key
  what TEXT,                     -- auto-captured element summary
  change_text TEXT NOT NULL,     -- "make this smaller"
  why_text TEXT,                 -- "feels too loud next to the image"
  commenter_name TEXT,           -- optional client-typed
  status TEXT NOT NULL DEFAULT 'open',  -- open | resolved
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
);

CREATE TABLE replies (
  id TEXT PRIMARY KEY,
  comment_id TEXT NOT NULL,
  author TEXT NOT NULL,          -- 'client' | 'designer' | name
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_comments_project ON comments(project_id, status);
CREATE INDEX idx_replies_comment ON replies(comment_id);
```

## Build phases

### Phase 1 — backend foundation
- [ ] D1 schema
- [ ] Worker scaffolding with wrangler config
- [ ] CORS handling (echo expected origin)
- [ ] POST/GET /v1/comments
- [ ] R2 upload for screenshots (signed PUT or proxy)
- [ ] Project token auth
- [ ] Local dev with `wrangler dev`

### Phase 2 — widget
- [ ] Single-file build (esbuild → IIFE)
- [ ] Floating action button
- [ ] Click-to-pin mode (cursor changes, click captures element)
- [ ] Anchor extraction (selector, DOM path, coords)
- [ ] Screenshot via `html-to-image` (lighter than html2canvas)
- [ ] Comment form (3 fields)
- [ ] Pin rendering (existing comments load and pin to elements)
- [ ] Pin click → thread popover
- [ ] Reply from client side

### Phase 3 — dashboard
- [ ] React SPA, single-file Worker pattern (mirror `dashboard-builder` skill)
- [ ] Project switcher
- [ ] Comment list with filters (open/resolved)
- [ ] Comment detail view (screenshot, fields, thread, page link)
- [ ] Reply, resolve actions
- [ ] Login by project token (URL or one-input gate)

### Phase 4 — production hardening
- [ ] Rate limiting on comment POST
- [ ] Spam guards (honeypot, simple heuristic)
- [ ] Origin allowlist enforcement
- [ ] Screenshot size cap, image format normalisation
- [ ] Selector resilience: prefer data-attrs, fall back to nth-child
- [ ] Persistence test: pin stays anchored after layout change
- [ ] Reduced-motion and keyboard support in widget UI
- [ ] WCAG AA on dashboard
- [ ] Install docs
- [ ] Deploy: widget to a CDN URL, API + dashboard to Workers

## Production-ready criteria

A reasonable bar for v1 ship:

1. **Install:** one `<script>` tag on a real site, no other config beyond a project token.
2. **Works:** client can pin and comment on any element, see their comment persist after refresh, reply.
3. **Reliable:** comment anchor still resolves after a non-trivial CSS change on the host site (selector or coord fallback).
4. **Designer flow:** I can see comments in the dashboard, reply, and resolve from there. Replies show up on the client side.
5. **Performant:** widget loads in < 100ms perceived, < 30KB gz on the wire, no jank on the host site.
6. **Safe:** project token enforced, origin allowlist enforced, screenshots not publicly listable.
7. **Documented:** install.md tells a designer how to add the script and create a project.
8. **Deployed:** widget URL, API URL, dashboard URL all live and wired together.

## Open decisions (defer to first build pass)

- Screenshot library: `html-to-image` vs `modern-screenshot`. Test both for fidelity vs size.
- Pin UI style: numbered circles like Pastel/Vercel, or coloured tags. Decide during /impeccable pass.
- Project creation: one-off CLI script vs dashboard signup. CLI for v1.
- Domain: subdomain on a Cloudflare-owned domain for MVP, custom later.

## What this is NOT

This isn't the editor. The editor (the existing Claude CMS work) becomes a separate "Pro" product later, or gets shelved. Not deciding that here.
