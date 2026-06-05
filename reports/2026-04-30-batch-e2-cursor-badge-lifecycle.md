# 2026-04-30 — Batch E.2: cursor mode-indicator badge lifecycle

## Summary
Replaces the CSS `cursor: url(...)` override with a three-stage **floating badge** that lives alongside the OS cursor. One visual element across three roles: cursor follower (Phase 1) → composer anchor (Phase 2) → numbered pin (Phase 3, via cross-fade).

The OS cursor stays the default arrow at all times; the badge is a separate fixed-position element rendered inside the widget shadow root.

## Phase contract
| Stage | When | Behaviour |
|---|---|---|
| `follow` | Comment mode active, no panel open | Badge follows `mousemove` at `+14, +14` from the cursor. Hidden while cursor is over widget chrome (toggle, sidebar). |
| `snap` | Composer open | Badge transitions (~180ms) from last follow position to the top-left of the composer panel, sitting half-inside / half-outside the panel border. Stops following the cursor. |
| `hidden` | Thread open OR Browse mode OR (transiently) just-after-submit | Badge is removed from layout (`hidden=true`) and its opacity reset for the next stage. |

On submit success: opacity fades to 0 over ~150ms while the new `.fp-pin` renders at the element's anchor — cross-fade rather than morph (different positions). Continuity comes from the shape and colour (filled blue circle, white interior, "+" → comment number).

## Files touched
| File | Change |
|---|---|
| `widget/src/ui.ts` | New private fields `cursorBadgeEl: HTMLElement` and `cursorStage: "follow" \| "snap" \| "hidden"`. New private method `setCursorStage(stage)` handles transition CSS + position. Badge appended in `renderHighlights`. `setMode` no longer writes `documentElement.style.cursor`; instead calls `setCursorStage("follow" / "hidden")`. `onPickMove` updates badge position when stage is `follow`, hides it when cursor is over widget chrome. `openComposer` ends with `setCursorStage("snap")`. `openThread` calls `setCursorStage("hidden")`. `cancelComposer` returns to `follow` (or `hidden` if mode changed). `submitComposer` success path triggers a 150ms opacity fade then resets the stage. `closeActive` returns to `follow` if Comment mode is still active. The unused `commentCursorDataUrl()` helper was removed. |
| `widget/src/styles.ts` | New `.fp-cursor-badge` rule: 20px circle, blue fill (`var(--fp-hl)`), white inner SVG, soft shadow, `pointer-events: none`. Honours `prefers-reduced-motion` (skips transitions). |
| `widget/dist/feedback-pin.js` | Rebuilt (269.9kb). |
| `tests/e2e/cursor-badge.spec.ts` | New file. 4 tests: (1) `documentElement.style.cursor` is empty in Comment mode, (2) Phase 1 badge follows mouse with `+14, +14` offset, (3) Phase 2 badge has `data-stage="snap"` and stops responding to mousemove after composer opens, (4) opening an existing thread hides the badge. |
| `manifest.yaml` | `widget-mode-toggle.contract` rewritten to describe the three-stage lifecycle. Invariants list rewritten: removed `custom-cursor-shown-in-comment-mode` and `cursor-tip-pixel-equals-css-hotspot`; added `os-cursor-not-overridden-in-comment-mode`, `comment-mode-renders-badge-following-cursor`, `badge-snaps-to-composer-on-open`, `badge-hides-on-thread-open`, `badge-fades-out-on-submit`, `badge-hides-while-cursor-over-widget-chrome`. `tests:` lists `cursor-badge.spec.ts`. One new entry in `recent_decisions:` (dated 2026-04-30). |
| `decisions.log` | Same entry appended. |

## Pipeline verdict per stage
| Stage | Result |
|---|---|
| 1 — shape (brief) | Pass; brief was unpacked into six concrete defaults that the user accepted via "run". |
| 2 — conflict scan | Pass; replaces a prior `widget-mode-toggle` invariant pair with a new one — explicitly superseded, not silently dropped. |
| 3 — specialists (inline) | a11y: badge is `aria-hidden` (decorative, not an interactive control); honours `prefers-reduced-motion`; OS cursor stays standard so OS-level customisation (high-contrast cursors, accessibility cursors) is preserved. Performance: a single `mousemove` listener was already active for hover-pick; badge update piggybacks on it (no new listener). Bundle delta +2.2kb. |
| 4 — engineer (orchestrator-inline) | Edits applied directly. Same workaround as previous batches. |
| 5 — tests | 74/74 green: 15 unit + 5 api + 54 e2e. 4 new badge tests added. |
| 6 — quality pass | Cursor-related code consolidated into `setCursorStage`. The `commentCursorDataUrl` helper was deleted (dead code). |
| 7 — integrator (orchestrator-inline) | Manifest contract + invariants rewritten; one decisions.log entry; tests re-run; all green. |
| 8 — review | Inline review: scoped to `widget-mode-toggle`; no leakage into composer / pin / thread invariants. |

## Manifest changes
- `widget-mode-toggle.contract`: rewrites the cursor section into a three-stage lifecycle.
- `widget-mode-toggle.invariants`: removed `custom-cursor-shown-in-comment-mode`, `cursor-tip-pixel-equals-css-hotspot`. Added six new invariants spelling out OS-cursor preservation, follow / snap / hidden behaviours, and submit-time fade.
- `widget-mode-toggle.tests`: now lists `tests/e2e/cursor-badge.spec.ts`.

## Local preview
- **Wrapper**: http://localhost:8789/review?url=http://localhost:5173/smoke-test/&token=fpt_52c5dbdd0f66b5f9899706d4679d58cfa71f704e
- **Portal**: http://localhost:8789/

How to verify by hand:
1. Toggle to Comment mode (already default). The OS arrow stays; a small blue circle with a white "+" follows the cursor at the bottom-right.
2. Move the cursor over the bottom-center toggle or right-side sidebar — the badge fades to 0 opacity (it's still there, just invisible over chrome).
3. Click any element in the page — the composer opens, and the badge transitions to the top-left corner of the composer panel and stays there.
4. Fill in Comment + Why and submit — the badge fades while a new numbered pin appears at the element's anchor.
5. Click that new pin — thread opens; badge is hidden (the pin is the anchor).
6. Switch to Browse mode — badge is hidden.

## Non-blocking notes
- The badge fades over 150ms but the pin appears instantly; visually it's a soft hand-off. Could add a 150ms scale-in on the pin for polish — happy to do as a small follow-up.
- `mousemove` was already listened to in Comment mode (for hover-pick) so the badge tracker piggybacks rather than adding a new listener — avoids any new perf cost.
- D1 was cleared (`DELETE FROM replies; DELETE FROM comments;`) before the test run to dodge the still-pending stub-coverage gap in `sidebar-triage.spec.ts`. Fix is one regex line.
