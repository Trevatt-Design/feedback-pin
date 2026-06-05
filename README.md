# feedback-pin

In-situ feedback for any website. Drop in a script tag, clients click any element to leave a comment, designers triage in a dashboard.

This is a comment-first tool. It does not edit the host site. It captures feedback well so the designer can act on it.

## How we work on this repo

This project is in **wireframe-as-code** phase. The goal right now is to iterate on functionality and UX quickly, with checks and balances, without ad-hoc chat-driven coding. We do this with the **fp-feature pipeline** — a single skill that takes a brief and runs it through a multi-agent pipeline composed of existing Anthropic skills (`shape`, `security-review`, `audit`, `adapt`, `critique`, `simplify`, `harden`, `verify-before-fix`, `polish`, `review`) and three thin custom agents (`engineer`, `test`, `integrator`). The pipeline is defined in `.claude/skills/fp-feature/SKILL.md`. Everything important gets recorded:

- **`manifest.yaml`** — single source of truth for features, contracts, invariants, anti-features, and which tests cover what.
- **`decisions.log`** — append-only one-line history of every decision the pipeline made.
- **`tests/`** — three layers (unit / api / e2e). Tests are the real safety net; the pipeline cannot pass while any layer is red.
- **`reports/`** — verification reports written by the integrator agent at the end of each pipeline run.

Always start a feature change with the brief, not with code. The pipeline is invoked by saying something like *"add a checkmark animation to the share button — run fp-feature"*.

### Autonomous batch mode

To ship a stack of features without supervising each one: queue briefs in `manifest.yaml#roadmap` (schema documented inline in that file), then run `/loop /fp-next`. The `fp-next` skill (`.claude/skills/fp-next/SKILL.md`) picks the highest-priority queued item, hands its brief to fp-feature, flips the entry to `done` on success, then asks `/loop` to repeat. The loop terminates on `queue empty` or on any halt — pipeline stop conditions (test fail, anti-feature conflict, drift, blocking review), an ambiguous brief that needs shaping, or a recent reversal in the decisions log (see `decisions/README.md` for the `reversal: true` convention). Halted items keep `status: in-progress` with a `halt_note:` so you can resolve them when you come back.

## What's in the box

- **`widget/`** — the embeddable script clients use on the live or staging site.
- **`api/`** — Cloudflare Worker + D1 + R2 that stores comments, replies, screenshots.
- **`dashboard/`** — single-file Worker that serves the designer-side React app.
- **`scripts/`** — small helpers (project creation).

See `PLAN.md` for the v1 plan and success criteria. See `docs/install.md` for install instructions.

## Quick start

Prereqs: Node 22+, a Cloudflare account, `wrangler` authenticated (`npx wrangler login`).

```bash
# 1. Create D1 + R2 resources
cd api
npx wrangler d1 create feedback-pin   # paste the database_id into wrangler.toml
npx wrangler r2 bucket create feedback-pin-screenshots

# 2. Apply schema
npm install
npm run db:init           # local dev
npm run db:init:remote    # production

# 3. Deploy the API
npm run deploy

# 4. Create a project + token
cd ..
node scripts/create-project.mjs --name "Acme Site" --origin "https://acme.com" --remote

# 5. Build and host the widget
cd widget
npm install
npm run build             # outputs dist/feedback-pin.js
# Upload dist/feedback-pin.js to a CDN (R2 public bucket, Pages, anywhere)

# 6. Deploy the dashboard
cd ../dashboard
npm install
# Edit wrangler.toml: set API_URL to your deployed API URL
npm run deploy
```

Then drop this on the host site:

```html
<script src="https://your-cdn/feedback-pin.js"
        data-project-token="fpt_…"
        data-api="https://feedback-pin-api.you.workers.dev"></script>
```

## Design choices

- **Cloudflare end-to-end**: free tier covers most projects, single account, single deploy story.
- **No client login**: friction kills feedback. Optional name field on the form.
- **Hybrid anchor**: stable selector → DOM path → coords. Pins survive most layout changes.
- **Coached input**: the form prompts for *change* and *why*, not free text. The "why" is what makes downstream AI useful later.
- **Shadow DOM widget**: zero CSS bleed onto the host site.

## AI inference

The widget calls `POST /v1/inference` between the "why?" step and the scope decision to disambiguate intent (e.g. "click parent div, comment says 'make text smaller', AI infers they meant the H2 inside"). The endpoint is backed by Claude Haiku 4.5.

To enable, set the Worker secret on the API:

```bash
cd api
npx wrangler secret put ANTHROPIC_API_KEY
# paste the key when prompted; for local dev, also add to .dev.vars:
echo 'ANTHROPIC_API_KEY="sk-ant-…"' >> .dev.vars
npx wrangler dev --port 8787   # restart so the secret is picked up
```

Without the key, `/v1/inference` returns `503 ai_unavailable` and the widget falls back silently to its heuristic-only flow. No comments are blocked.

## Tests

Three layers — pipeline cannot ship a change while any one is red.

```bash
npm test            # all three
npm run test:unit   # pure logic (Vitest)
npm run test:api    # worker endpoints (Vitest, hits local wrangler dev)
npm run test:e2e    # browser flows (Playwright)
```

Before running `test:api` or `test:e2e`, the three local servers must be up:
- API at `:8787` (`cd api && npx wrangler dev --port 8787`)
- Dashboard at `:8789` (`cd dashboard && npx wrangler dev --port 8789`)
- Static at `:5173` (`npx http-server . -p 5173 -c-1` from repo root)

## Future

AI triage and grouped batches come in v1.5 (see PLAN.md). The "premium edit" version is a separate product, deliberately deferred.

## License

TBD.
