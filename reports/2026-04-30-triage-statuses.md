# Verification — batch 7: triage statuses

Date: 2026-04-30
Feature ids touched: `api-comments-crud`, `api-public-share`, `widget-pins`,
`widget-sidebar-standalone`, `wrapper-sidebar`, `dashboard-list`,
`dashboard-detail`.

## Brief (verbatim)

> Extend the comments status enum from binary `open|resolved` to four states
> (`open`, `in-progress`, `wont-fix`, `resolved`). Backward-compatible (no DB
> migration). New `POST /v1/comments/:id/status` route; legacy `/resolve` and
> `/reopen` kept alive as wrappers. Public/share read-path widened from
> `status='open'` to `status IN ('open','in-progress')`. UI: status pill on
> rows + status `<select>` in detail/thread + `is-resolved` → `is-closed`
> rename.

## Plan summary (stage 2)

Touched 7 manifest features. Anti-features scanned, none triggered. Pipeline
proceeded to specialists.

## Per-stage verdicts

| Stage | Agent | Verdict |
| --- | --- | --- |
| 2 | planner | pass — 7 features touched, no anti-features triggered |
| 3 | specialists | pass with 7 engineer instructions; all addressed in stage 4 |
| 4 | engineer | pass — code changes confined to engineer territory |
| 5 | test | pass — 35 new tests; suite green at handoff |
| 6 | simplifier | pass — promoted `isClosedStatus` to runtime; removed dead helpers; preserved `WidgetApi.resolve/reopen` for back-compat |
| 7 | integrator | pass (this report) — manifest + decisions updated, full suite green |

## Specialist instructions (stage 3) and resolution

1. `/status` action under project-token route block (not public). — addressed.
2. Body validation against four-element whitelist; reject with 400. — addressed.
3. Public read-path widened to `IN ('open','in-progress')` only. — addressed.
4. CSS class `is-resolved` → `is-closed` everywhere. — addressed (verified via grep, only test-file comment references the old name).
5. `aria-label="Status"` on widget select; visible `<label>Status</label>` on dashboard select. — addressed.
6. UI label "Won't fix"; wire value `wont-fix`. — addressed.
7. Dashboard switched from two-fetch to single-fetch + client-side bucketing. — addressed.

## Files changed

API:
- `api/src/index.ts` — `ALLOWED_STATUS`, `setStatusOnRow` shared helper, `routeStatus`, refactored `routeResolve`, widened `routeListComments` and `routePublicListComments`, route regex extended.

Widget:
- `widget/src/api.ts` — `Comment.status` widened, `setStatus()` added.
- `widget/src/ui.ts` — `STATUS_OPTIONS`, `statusLabel`, `isClosedStatus`; `setStatus()` private method; thread top action is `<select>`; row pill; per-row toggle button removed; dead helpers `toggleResolve`/`checkIcon`/`refreshIcon` removed.
- `widget/src/styles.ts` — pill styles, status select styles, `is-resolved` → `is-closed`.

Dashboard:
- `dashboard/src/index.ts` — both modules: `STATUS_OPTIONS`/`statusLabel`/`StatusPill`/`isClosedStatus`, status select in `CommentDetail`, single-fetch in `Comments`, pill in `CommentRow` + `Sidebar`, `is-closed` rename, sort helper updated.

## Tests added / touched / status

Added:
- `tests/unit/status-bucket.test.ts` (10 tests)
- `tests/api/status.test.ts` (19 tests)
- `tests/e2e/triage-statuses.spec.ts` (6 tests)

Touched:
- `tests/e2e/sidebar-triage.spec.ts` — fetch stub regex updated for the new single-fetch pattern.
- `widget/src/ui.ts` `__test` export extended with `STATUS_OPTIONS`, `statusLabel`, `isClosedStatus` (test-only surface).

Final suite results (re-run by integrator on 2026-04-30):

| Layer | Tests | Status |
| --- | --- | --- |
| Unit (vitest, `tests/unit`) | 40/40 | green |
| API  (vitest, `tests/api`)  | 24/24 | green |
| E2E  (playwright, `tests/e2e`) | 33/33 | green |
| Total | 97/97 | green |

## Manifest entries updated

- `api-comments-crud` — contract gains `POST /v1/comments/:id/status` route, status enum widened paragraph; added invariants `status-enum-allows-open-in-progress-wont-fix-resolved`, `status-route-accepts-all-four-and-rejects-others-with-400`, `legacy-resolve-reopen-routes-still-work-and-route-through-status-handler`, `status-change-is-not-author-gated`; `tests:` adds `tests/api/status.test.ts`.
- `api-public-share` — invariant relaxed: `share-routes-only-return-open-comments` → `share-routes-expose-open-and-in-progress-only`; contract paragraph updated to spell out which states are visible; `tests:` adds `tests/api/status.test.ts`.
- `widget-pins` — contract paragraph rewrites the thread top action as a Status `<select>` with all four options; describes `is-closed` greyout class; added invariants `thread-top-action-is-status-select-with-four-options`, `closed-bucket-includes-resolved-and-wont-fix-for-greyout-and-tabs`; `tests:` adds `tests/e2e/triage-statuses.spec.ts`.
- `widget-sidebar-standalone` — contract describes Open/Resolved tab bucketing of the four-state enum, status pill on rows, removed per-row toggle, `is-closed` greyout; added invariant `closed-bucket-includes-resolved-and-wont-fix-for-greyout-and-tabs`; `tests:` adds `tests/e2e/triage-statuses.spec.ts`.
- `wrapper-sidebar` — contract describes tab bucketing, status pill on rows, `is-closed` greyout; added invariant `closed-bucket-includes-resolved-and-wont-fix-for-greyout-and-tabs`; `tests:` adds `tests/e2e/triage-statuses.spec.ts`.
- `dashboard-list` — contract describes single-fetch + client-side bucketing, binary tab strip over the four-state enum, status pill on rows, `is-closed` greyout; added invariant `closed-bucket-includes-resolved-and-wont-fix-for-greyout-and-tabs`; `tests:` adds `tests/unit/status-bucket.test.ts` and `tests/e2e/triage-statuses.spec.ts`.
- `dashboard-detail` — contract describes Status `<select>` (replaces resolve/reopen button) with a visible `<label>Status</label>` and the four options including the "Won't fix" copy; added invariant `detail-view-status-select-lists-four-options-with-wont-fix-label`; `tests:` adds `tests/e2e/triage-statuses.spec.ts`.

## Decisions logged (2026-04-30)

Appended to `decisions.log` and mirrored into `manifest.yaml` `recent_decisions:`:

1. `api-comments-crud` — widen status enum to `open|in-progress|wont-fix|resolved`, backward-compatible (no DB migration).
2. `api-comments-crud` — new `POST /v1/comments/:id/status`; legacy `/resolve` + `/reopen` kept alive as wrappers.
3. `api-public-share` — share-routes now expose `open` + `in-progress` only; `wont-fix` and `resolved` invisible to share visitors.
4. `dashboard-list` — tab strip stays binary (Open / Resolved / All) bucketing the four-state enum.
5. `widget-pins` — UI label "Won't fix" wired to value `wont-fix` (dev-tooling-style hyphenated wire value, sentence-case display).
6. `widget-pins` — CSS class `is-resolved` → `is-closed` across widget + dashboard + wrapper.
7. `widget-pins` — `WidgetApi.resolve()` / `reopen()` kept alive as public-API wrappers around the new shared status helper.
8. `dashboard-list` — `Comments` switched from two-fetch (open + resolved) to single-fetch + client-side bucketing.

## Drift check

- All listed test paths exist (`tests/unit/status-bucket.test.ts`, `tests/api/status.test.ts`, `tests/e2e/triage-statuses.spec.ts`, plus the touched `tests/e2e/sidebar-triage.spec.ts`).
- `manifest.yaml` `recent_decisions:` matches the new tail of `decisions.log`.
- Grep for `is-resolved` in `widget/src` and `dashboard/src` returns no matches; only one hit in `tests/e2e/triage-statuses.spec.ts` and it is a comment explaining the rename, not a class reference.
- Dead helpers `toggleResolve`, `checkIcon`, `refreshIcon` are gone from `widget/src/ui.ts`.
- New helpers `STATUS_OPTIONS`, `statusLabel`, `isClosedStatus` exist in `widget/src/ui.ts` and are referenced at the runtime sites described in stage 6 (pin class toggle, list row class).

## Local verify steps (no preview env configured)

Three terminals:

1. API: `npm run dev -w api` — serves on `:8787`.
2. Dashboard: `npm run dev -w dashboard` — serves on `:8789` (note: docs say `:8788`, actual binding is `:8789`; user has chosen to leave the docs as-is).
3. Smoke fixture: `npm run dev -w smoke-test` — serves the fixture host page on `:5173`.

Then:

- Dashboard `/comments` — confirm tab strip Open/Resolved/All shows row pills in four colours; click a row → detail page Status `<select>` lists Open / In progress / Won't fix / Resolved; changing it moves the row between tabs and updates the pill.
- Smoke fixture (`http://localhost:5173/`) — open a thread; confirm the top-row Status `<select>` exposes the four options; switching to `wont-fix` or `resolved` greys the pin via `is-closed`.
- Wrapper `/review?url=…` — confirm sidebar rows show pills and the `is-closed` greyout when status is closed.
- Public/share — generate a share link from the wrapper, open it in an incognito window, confirm only `open` + `in-progress` comments are visible.

## Open items for the user

- `WidgetApi.resolve()` and `WidgetApi.reopen()` are now redundant on the widget side (no internal callers). They are deliberately preserved as public-API wrappers around the new shared status helper for back-compat with any externally-embedded widget builds. Consider scheduling a deprecation batch once we confirm no external integrations depend on them.
- Smoke-test port drift (`:8788` in docs vs `:8789` actual) remains untouched per prior decision (2026-04-29).
- No DB migration was required: the existing `status TEXT` column accepts the two new string values without schema change. If a future batch wants a CHECK constraint at the DB layer, that's a follow-up.
