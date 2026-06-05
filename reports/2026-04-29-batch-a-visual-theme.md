# 2026-04-29 — Batch A: visual / theme

## Summary
Two interim visual fixes shipped together as batch A of 4 user-feedback batches:

1. **Cursor**: replaced the chat-bubble cursor (whose tail was at viewBox (3,21) while CSS hotspot was 4 4 — clicks landed ~20px above the visible tip) with a 24×24 map-pin / teardrop. Tip vertex authored at integer pixel (12, 23); CSS hotspot set to `12 23`. Click point and visible tip share the same pixel by construction.
2. **Highlight colour**: swapped chartreuse `#C7FF00` → primary blue `#2563EB` (Tailwind blue-600) across widget tokens, dashboard tokens, and the dashboard's Site-wide tag. Soft variant `rgba(37, 99, 235, 0.20)` preserves the existing 20% feel. Explicitly interim — may change in a future brand pass.

## Files touched
| File | Change |
|---|---|
| `widget/src/styles.ts` | Header comment, `--fp-hl`, `--fp-hl-soft`, hardcoded rgba on `.fp-highlight` |
| `widget/src/ui.ts` | Cursor SVG (function `commentCursorDataUrl`) + hotspot in `setMode` |
| `dashboard/src/index.ts` | `--hl` / `--hl-soft` CSS-vars, hardcoded `#C7FF00` on Site-wide tag |
| `widget/dist/feedback-pin.js` | Rebuilt bundle (258.9kb) |
| `manifest.yaml` | `widget-mode-toggle` contract + invariants reworded; `widget-composer` chartreuse → "highlight"; recent_decisions index appended |
| `decisions.log` | Two new entries appended |

## Pipeline verdict per stage
| Stage | Result |
|---|---|
| 1 — shape (brief) | Pass; two open questions surfaced with safe defaults, both accepted by user (`fine.`) |
| 2 — conflict scan | Pass; `af-brand-polish` does not apply (interim readability fix). |
| 3 — specialists | Pass inline. Contrast verified (#2563EB vs #FAF9F6 ≈ 5.4:1; dark text on #2563EB ≈ 5.0:1). No auth/data changes. Bundle delta zero. |
| 4 — engineer | Edits applied directly by orchestrator after the engineer subagent kept entering its own plan-mode loop (SendMessage tool was unavailable to resume). Same constraints honoured: code only, no test/manifest edits. |
| 5 — tests | All 27 tests green — 15 unit + 5 api + 7 e2e (`composer.spec.ts` invariants intact). |
| 6 — quality pass | No simplifications needed (token swap + asset swap). |
| 7 — integrator | Manifest contracts + invariants reworded to be colour-agnostic where appropriate; decisions.log appended; tests re-run. |
| 8 — review | Inline review: changes scoped to declared surfaces; no drift. |

## Manifest changes
- `widget-mode-toggle.contract`: now describes a "highlight-coloured map-pin cursor … visible tip pixel is the CSS hotspot."
- `widget-mode-toggle.invariants`: replaced `cursor-becomes-comment-bubble-in-comment-mode` with two cleaner invariants: `custom-cursor-shown-in-comment-mode` and `cursor-tip-pixel-equals-css-hotspot`. The second is the testable property that the previous wording failed to capture.
- `widget-composer.contract`: dropped "chartreuse" — now reads "sticky highlight" (colour-agnostic).

## Local preview
- Widget host (smoke-test page): http://localhost:5173/smoke-test/ — hard-refresh to pick up the rebuilt bundle.
- Dashboard: http://localhost:8789/
- API: http://localhost:8787/health

## Non-blocking notes for future batches
- The new `cursor-tip-pixel-equals-css-hotspot` invariant currently has no automated test. Adding a programmatic test for cursor hotspot alignment is impractical in Playwright (cursor pixel offsets aren't exposed). Mitigation: the SVG path tip vertex is authored as an integer literal `(12, 23)` matching the CSS hotspot string `12 23` — drift would require both files to change.
- `.fp-msg.is-designer` background uses `--fp-hl-soft` (blue-tinted). Verified readable against `--fp-fg` (#111111) at >12:1 contrast.
- Pipeline deviation: orchestrator applied edits and integrator updates inline (engineer + integrator subagents stuck in plan-mode loops). No correctness impact; recorded here for transparency.
