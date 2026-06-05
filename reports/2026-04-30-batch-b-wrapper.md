# 2026-04-30 — Batch B: review-wrapper toolbar + sidebar

## Summary
Three user-feedback items shipped together as Batch B (3 of 4 batches now in). All changes are scoped to the wrapper surface (`/review` on the dashboard worker). One collateral bug fix (URL-helper name shadowing) landed alongside because #3 wouldn't actually function without it.

| # | Change |
|---|---|
| 3 | Desktop/Tablet/Mobile viewport segment moved from the left side of the toolbar (next to mode toggle) to the right cluster, between the spacer and the Share button. The right cluster now reads `Viewport · Share · Hide-comments` — three "session controls" grouped together. |
| 4 | Toolbar buttons (`.btn-toolbar`) reserve a stable footprint via `min-width: 180px` + `justify-content: center`, and the count badge has `min-width: 22px`. Label flips ("Hide comments" ⇄ "Show comments", "Share" ⇄ "Copied!") and digit-count changes no longer nudge neighbouring controls. |
| 5 | Sidebar refactored from a grid column (which was pushing the canvas and reflowing the iframe) to a `position: absolute` overlay that slides in/out via `transform`. The iframe canvas never changes dimensions when the sidebar is toggled, so a fixed-position widget composer modal inside the iframe stays anchored to the element it was opened on. |
| (bug) | Renamed the top-level URL helper `setQuery` → `setUrlParams` to break shadowing by the search-input `useState` setter that was added during the recent sidebar-search feature. Without this, viewport-tab clicks and `?open=` updates were silently being routed into the search-input state instead of `history.replaceState`. |

## Files touched
| File | Change |
|---|---|
| `dashboard/src/index.ts` | Renamed `setQuery` → `setUrlParams` (top-level URL helper) and updated the only caller (`setQ` inside `App`). Reordered the toolbar JSX so `ViewportSeg` renders after `<div className="spacer"/>`. Tagged Share + Hide-comments buttons with `btn-toolbar`. Added `aria-label` to both. CSS: new `.btn-toolbar { min-width: 180px; justify-content: center }`; `.btn .count` gets `min-width: 22px; text-align: center` (kept `color: #1a1a1a`). Sidebar CSS rewritten to `position: absolute; transform: translateX(...)` with a `.is-hidden` modifier and `prefers-reduced-motion` guard. `.stage` collapsed to single-column `1fr` (no more `is-sidebar-hidden` class). `.frame-wrap` `transition: width/height` removed (canvas no longer animates). Sidebar render now always-mounted with `hidden` prop instead of conditional. |
| `tests/e2e/wrapper.spec.ts` | New file. Three tests: viewport segment after spacer, hide-comments button width stable across toggle (rounded to integer pixels), iframe bounding rect unchanged across sidebar toggle (with 280ms wait past the slide transition). |
| `manifest.yaml` | `wrapper-toolbar` contract rewritten with explicit left/right cluster description; new invariants `viewport-segment-rendered-in-right-cluster-after-spacer` and `toolbar-button-widths-stable-across-state-toggles`; `tests:` now lists `wrapper.spec.ts`. `wrapper-sidebar` contract gained an overlay paragraph; new invariant `sidebar-overlays-canvas-without-reflowing-iframe`; `tests:` now also lists `wrapper.spec.ts`. Four new entries appended to `recent_decisions:` (dated 2026-04-30). |
| `decisions.log` | Same four entries appended (dated 2026-04-30). |

## Pipeline verdict per stage
| Stage | Result |
|---|---|
| 1 — shape (brief) | Pass; no interview needed (brief was concrete). Identified the `setQuery`-shadowing bug during recon and folded the fix in because #3 depended on it. |
| 2 — conflict scan | Pass; no anti-features triggered. The right-cluster grouping doesn't conflict with any existing wrapper invariants. |
| 3 — specialists (inline) | a11y: added `aria-label` on Share and Hide-comments (icon + "Copied!" / count needed accessible names); `aria-hidden` on the offscreen sidebar; `prefers-reduced-motion` honored on the slide. Performance: zero bundle delta (CSS-only), zero new JS. |
| 4 — engineer (orchestrator-inline) | Edits applied directly. Engineer subagent still gets stuck in plan-mode loop and SendMessage isn't available — same workaround as Batches A and C. |
| 5 — tests | All 43 tests green: 15 unit + 5 api + 23 e2e (3 new wrapper.spec.ts tests). |
| 6 — quality pass | One small simplification took place during edits — `frame-wrap` lost its width/height transition since the canvas no longer animates. No further reuse opportunities. |
| 7 — integrator (orchestrator-inline) | Manifest contracts + invariants reworded; decisions.log appended; tests re-run; all green. |
| 8 — review | Inline review: changes scoped to wrapper surface; widget and dashboard-triage surfaces untouched. |

## Manifest changes
- `wrapper-toolbar.contract`: rewritten to describe two clusters separated by a flex spacer, and to document the stable-footprint pattern for `.btn-toolbar`.
- `wrapper-toolbar.invariants`: added `viewport-segment-rendered-in-right-cluster-after-spacer` and `toolbar-button-widths-stable-across-state-toggles`.
- `wrapper-toolbar.tests`: now lists `tests/e2e/wrapper.spec.ts`.
- `wrapper-sidebar.contract`: added a paragraph describing the overlay layout and why it's load-bearing for the widget composer modal.
- `wrapper-sidebar.invariants`: added `sidebar-overlays-canvas-without-reflowing-iframe` (placed first so the layout invariant is visible before the behavioural ones).
- `wrapper-sidebar.tests`: appended `tests/e2e/wrapper.spec.ts` alongside the existing `sidebar-triage.spec.ts`.

## Local preview
- **Wrapper**: http://localhost:8789/review?url=http://localhost:5173/smoke-test/&token=fpt_52c5dbdd0f66b5f9899706d4679d58cfa71f704e
- **Portal**: http://localhost:8789/

The dashboard worker reloads on save (no rebuild needed). Click Hide-comments and confirm: (a) the button width doesn't twitch, (b) viewport tabs sit on the right of the spacer, (c) iframe geometry is identical before/after toggle, (d) opening a comment composer in the iframe and then toggling the sidebar leaves the modal correctly anchored.

## Non-blocking notes
- Trade-off of the overlay: when the sidebar is open, it covers the right ~360px of the canvas. For tablet/mobile viewports the centred `.frame-wrap` may be partially occluded if canvas width is tight. User can hide the sidebar momentarily. This is the right call given #5's explicit requirement that the page beneath the modal not move.
- The shadowing bug (`setQuery` → `setUrlParams` rename) is a real fix that landed during this batch but wasn't part of the original brief; it's documented in `decisions.log`. If the user prefers it pulled out into its own pipeline run for traceability, easy to revert here and re-do.
- Pipeline deviation continues from Batches A + C: orchestrator applied edits and integrator updates inline because the engineer/test/integrator subagents loop on plan-mode and SendMessage isn't in the orchestrator's toolset.
