# 2026-04-30 — Sidebar triage upgrade

## Brief (verbatim through orchestrator)

Three coordinated additions to the comments sidebar:

1. **Search bar** — case-insensitive substring filter over `change_text`,
   `why_text`, `url`. Empty query = no filter. Placeholder reads
   "Search N comments…".
2. **Page grouping** — when the visible comment set spans more than one page
   URL, render collapsible group headers per page. Single-page projects
   render flat. **Dashboard list only** (the only multi-page surface).
3. **Sort menu** — newest / oldest / unresolved-first. Default newest.
   Persist per-user preference in localStorage.

All three controls live in a row above the comments list. Existing
Open/Resolved/All tabs stay. **Pure UI + state changes, no API contract
changes.**

## Plan summary (stage 2)

Touched manifest features `dashboard-list`, `wrapper-sidebar`,
`widget-sidebar-standalone`. Anti-features scanned, none triggered.
"Most replies" sort dropped to honour the no-API-change constraint.

## Pipeline verdict per stage

| Stage | Result |
|---|---|
| 1 — shape (brief) | Pass. Three additions, scope narrowed to no-API-change. |
| 2 — conflict scan | Pass. No anti-features triggered. Most-replies dropped to honour the constraint. |
| 3 — specialists | Pass with two engineer instructions: (1) escape `c.url` in widget innerHTML, (2) widget sidebar width is 340px. |
| 4 — engineer | Three surfaces touched: widget standalone sidebar, wrapper sidebar (review), dashboard list. Helpers duplicated across the two dashboard inline modules (separate scope is forced). |
| 5 — tests | 15 new unit tests + 13 new e2e tests. No API tests added (no API change). 55/55 green at handoff. |
| 6 — simplify + harden | One swap: `new URL(c.url).pathname \|\| "/"` → existing `fpUrlPathname(c.url)` at `dashboard/src/index.ts:241`. Helper duplication accepted. |
| 7 — integrator (this report) | Manifest contracts + invariants + tests-arrays updated for three features; six decisions appended to `decisions.log` and `recent_decisions`; full suite re-run twice — 55/55 green. |

## Files changed

| File | Change |
|---|---|
| `widget/src/styles.ts` | Added `.fp-sidebar-controls`, `.fp-sidebar-search`, `.fp-sidebar-sort`, `.fp-visually-hidden`. |
| `widget/src/ui.ts` | Added `searchQuery` / `sortMode` state on `WidgetUI`; injected search + sort markup into the sidebar; rewrote `renderSidebarList()` with three empty states; module-private helpers `SortMode`, `readSortPref()`, `commentMatchesQuery()`, `sortComments()`; `__test` named export at file end (test-only surface). |
| `dashboard/src/index.ts` (`html()` — `/comments` page) | Added `.controls` / `.group` / `.group-head` CSS; refactored `CommentList` → `CommentRow` + `CommentList` + new `GroupedCommentList`; added `ListControls`; helpers `fpReadSortPref` / `fpCommentMatchesQuery` / `fpSortComments` / `fpUrlPathname`. Wired `Comments` to apply search → sort → group-when-multi-URL. |
| `dashboard/src/index.ts` (`reviewHtml()` — `/review` wrapper) | Added `.sidebar-controls` / `.search` / `.sort` / `.visually-hidden` CSS; duplicate helpers (separate module scope is forced — accepted); extended `Sidebar` to render search + sort and three empty states; added `query` / `sort` state to `App`. |
| `manifest.yaml` | Updated `widget-sidebar-standalone`, `wrapper-sidebar`, `dashboard-list` contracts + invariants + tests arrays. Six entries appended to `recent_decisions:`. |
| `decisions.log` | Six entries appended (dated 2026-04-30). |

## Tests added / touched / status

| File | Status |
|---|---|
| `tests/unit/sort-search.test.ts` | New — 15 tests, happy-dom. |
| `tests/e2e/sidebar-triage.spec.ts` | New — 13 tests across 7 scenarios in 2 describe blocks (widget standalone + dashboard /comments). |
| `tests/e2e/composer.spec.ts` | Untouched — still 7 green. |
| `tests/unit/cohort.test.ts` | Untouched — still 12 green. |
| `tests/unit/anon-id.test.ts` | Untouched — still 3 green. |
| `tests/api/comments.test.ts` | Untouched — still 2 green. |
| `tests/api/inference.test.ts` | Untouched — still 3 green. |

**Final suite:** 30 unit + 5 api + 20 e2e = **55/55 green** (exit 0
from all three layers, re-run by integrator).

## Manifest entries updated

### `widget-sidebar-standalone`
- Contract appended with controls-row description (search, sort, three empty states).
- Invariants added:
  - `search-filters-by-change-why-and-url-substring`
  - `sort-options-newest-oldest-unresolved-first`
  - `sort-preference-persists-in-localstorage`
  - `corrupt-stored-sort-pref-falls-back-to-newest`
- `tests:` set to `[tests/unit/sort-search.test.ts, tests/e2e/sidebar-triage.spec.ts]`.

### `wrapper-sidebar`
- Contract appended with controls-row description (search, sort, three empty states). Explicit "page grouping is NOT used here" line — wrapper is URL-scoped.
- Invariants added:
  - `search-filters-by-change-why-and-url-substring`
  - `sort-options-newest-oldest-unresolved-first`
  - `sort-preference-persists-in-localstorage`
- `tests:` set to `[tests/e2e/sidebar-triage.spec.ts]`.

### `dashboard-list`
- Contract appended with controls-row, page-grouping rules (default-expanded, first-seen URL order, global pin numbering), and three empty states.
- Invariants added:
  - `search-filters-by-change-why-and-url-substring`
  - `sort-options-newest-oldest-unresolved-first`
  - `sort-preference-persists-in-localstorage`
  - `page-groups-render-only-when-distinct-page-count-greater-than-one`
- `tests:` set to `[tests/unit/sort-search.test.ts, tests/e2e/sidebar-triage.spec.ts]`.

## Decisions logged

Six entries appended to `decisions.log` and mirrored in `manifest.yaml` `recent_decisions:`:

```
2026-04-30 | dashboard-list | drop most-replies sort option | replies live behind GET /v1/comments/:id; counting them on the client would require N+1 fetches and the brief is no API change
2026-04-30 | dashboard-list | page grouping scoped to dashboard-list only | wrapper-sidebar and widget-sidebar-standalone are URL-scoped to a single page already, so grouping there is dead UI
2026-04-30 | strategy | shared fp_sort localStorage key across widget, wrapper, and dashboard surfaces | one preference travels with the user across surfaces — no surprise reset between contexts
2026-04-30 | dashboard-list | groups default-expanded; collapse state held in component state, not persisted | revisit cost is one click per group; persisting collapse adds a second key with weak payoff
2026-04-30 | dashboard-list | group ordering = first-seen URL order within sorted list, not alphabetical | follows the chosen sort (newest/oldest/unresolved) so surfacing logic is predictable
2026-04-30 | dashboard-list | pin numbering stays global across groups, not per-group | numbers double as stable IDs in conversation; per-group renumbering would shift them when a user collapses a section
```

## Drift check

- Every feature in the manifest still maps to a code symbol or file matching its `surface` field. Spot-checked: `searchQuery` / `sortMode` / `readSortPref` / `commentMatchesQuery` / `sortComments` / `__test` named export in `widget/src/ui.ts`; `.fp-sidebar-controls` / `.fp-sidebar-search` / `.fp-sidebar-sort` / `.fp-visually-hidden` in `widget/src/styles.ts`; `GroupedCommentList` / `ListControls` / `fpReadSortPref` / `fpCommentMatchesQuery` / `fpSortComments` / `fpUrlPathname` and `.controls` / `.group` / `.group-head` in `dashboard/src/index.ts`; `sidebar-controls` / `.search` / `.sort` / `.visually-hidden` plus duplicate helpers in `reviewHtml()`.
- Both test paths listed in the manifest exist: `tests/unit/sort-search.test.ts` (200 lines) and `tests/e2e/sidebar-triage.spec.ts` (429 lines).
- Anti-feature scan: `most-replies` / `mostReplies` / `sortByReplies` greps return zero hits in `widget/src/ui.ts` and `dashboard/src/index.ts`. Dropped sort option has no residual code.
- `decisions.log` entries dated 2026-04-30 match `manifest.yaml` `recent_decisions:` entries one-for-one.

## Local verification steps

No preview environment is configured for this repo (no Cloudflare Pages preview wired in). Verify locally:

- **API**: `http://localhost:8787` — `npm run dev -w api` (Wrangler).
- **Dashboard / wrapper**: `http://localhost:8789` — `npm run dev -w dashboard` (per the smoke-test port-drift note: docs say 8788, actual is 8789; user said leave it, 2026-04-29). Routes to verify:
  - `http://localhost:8789/#/comments` — search + sort + page grouping (load comments spanning ≥ 2 URLs to see the group headings).
  - `http://localhost:8789/review?url=<target>` — wrapper sidebar with search + sort + three empty states; **no** page grouping.
- **Smoke fixture (widget standalone)**: `http://localhost:5173/smoke-test/` — the right-edge sidebar with search + sort + three empty states.

Manual checks worth running:
1. Type into search; confirm placeholder "Search N comments…" updates as N changes.
2. Switch sort to oldest; reload the page; confirm the select sticks (localStorage `fp_sort`).
3. In dev tools, set `localStorage.fp_sort = "garbage"`; reload; confirm sort falls back to newest.
4. On `/comments` with comments across multiple URLs, click a group `[-]`/`[+]` toggle; confirm the rows hide/show and pin numbers stay global.

## Open items for the user

1. **Most-replies sort dropped.** The original brief implied it as a fourth option; it was cut at stage 2 because reply counts live behind `GET /v1/comments/:id` and a per-row fetch on the dashboard list would breach the no-API-change constraint. If you want it back, it needs an API change — most likely a `reply_count` column added to the list endpoint's response shape — and a fresh pipeline run.
2. **Helper duplication across the two inline dashboard modules** (`html()` and `reviewHtml()`). Stage 6 reviewed and accepted; cost of dedup outweighs benefit while both modules are inline strings shipped to a Worker. Worth revisiting if a third surface needs the same helpers.
3. **Group collapse state is not persisted.** Decision logged. If users complain that collapse resets on reload, persisting to localStorage is a small follow-up.
4. **Smoke-test port drift** (background context): docs say dashboard runs on `:8788`, actual is `:8789`. User said leave it on 2026-04-29; this report uses `:8789` everywhere.
