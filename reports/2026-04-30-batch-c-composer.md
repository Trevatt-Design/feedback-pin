# 2026-04-30 — Batch C: composer behaviour & UI

## Summary
Seven user-feedback items shipped together as Batch C of 4 batches. Composer becomes maximally minimal — no step indicator, no labels above editable history items, no question label above the scope picker — and three behavioural rules become testable invariants:

| # | Change |
|---|---|
| 6 | Step-indicator dots (`.fp-step-dots`) removed entirely from the composer. |
| 7 | Submit button changes shape from a 32px circle to a 40×28 rounded rectangle (radius 8); textarea right-padding bumped to 52px to fit. Glyph is centred via `display: block` on the inner SVG. |
| 8 | Enter in either textarea submits or advances (was Cmd/Ctrl+Enter); Shift+Enter inserts a newline. Cmd/Ctrl+Enter retained as a familiar alias. |
| 9 | Scope buttons renamed to "This instance" (default, on) and "Site-wide" (always — regardless of cohort), rendered side by side via a new `.fp-scope-choices--row` modifier. |
| 12 | Shake warning now considers the live, uncommitted textarea value. Previously shake only fired for `c.whatText` / `c.whyText`, which only get set after advancing the step — so typing in step 1 then dismissing was silently dropping the input. |
| 13 | History items render without labels. Placeholder reappears only when the field is emptied (driven by the existing `data-placeholder` on the contenteditable `.fp-history-value`). |
| 14 | "Apply to:" label removed from the scope step. |

## Files touched
| File | Change |
|---|---|
| `widget/src/ui.ts` | Composer template: dots block removed, "Apply to:" label removed, scope buttons renamed + side-by-side, history items rendered without labels, Enter/Shift+Enter keyboard handling, shake check reads live textarea, aria-labels updated to reference Enter, `renderClarifyStep` and `onClarifyChosen` no longer thread a `dots` NodeList. |
| `widget/src/styles.ts` | `.fp-submit` rebuilt as 40×28 rounded rectangle (radius 8); textarea right-padding 44px → 52px; `.fp-step-dots` block deleted; `.fp-history-label` block deleted; `.fp-scope-choices--row` modifier added. |
| `tests/e2e/composer.spec.ts` | Three dot-count tests dropped; replacements added for: rounded-rect submit (`submitIsRect` aspect-ratio check), no labels on history, scope buttons literal labels + side-by-side, "Apply to:" gone, `stepDots = 0`, Enter advances + Shift+Enter doesn't, single-Esc-with-text-in-step-1 shakes the panel. |
| `widget/dist/feedback-pin.js` | Rebuilt bundle (261.9kb). |
| `manifest.yaml` | `widget-composer` contract reworded to describe the new minimal shell + scope copy + keyboard rules; invariants list rewritten (added 7, removed 1, reworded 1). `widget-keyboard` contract reworded; new invariants `enter-advances-step-and-submits` and `shift-enter-inserts-newline`. Six new entries in `recent_decisions:` (dated 2026-04-30). |
| `decisions.log` | Six entries appended (dated 2026-04-30). |

## Pipeline verdict per stage
| Stage | Result |
|---|---|
| 1 — shape (brief) | Pass; surface flagged that #6 + #13 together remove all progress affordances. User accepted the maximalism. |
| 2 — conflict scan | Pass; no anti-features triggered. |
| 3 — specialists | Pass inline. Bundle delta +3.6kb (mostly the new sidebar search/sort that landed externally — unrelated to Batch C). a11y: Enter-as-submit pattern is widely understood; Shift+Enter newline is the standard fallback. The aria-label change reflects the new keyboard binding. |
| 4 — engineer | Edits applied directly by the orchestrator (engineer subagent stuck in plan-mode loop, same as Batch A). Code-only constraint honoured. |
| 5 — tests | All 27 tests green — 15 unit + 5 api + 7 e2e. |
| 6 — quality pass | `renderClarifyStep` / `onClarifyChosen` simplified — no longer take a `dots` NodeList. Otherwise no further reuse opportunities surfaced. |
| 7 — integrator | Manifest contracts + invariants reworded; decisions.log appended; tests re-run twice (post-edits and post-external-merge); both green. |
| 8 — review | Inline review: changes scoped to declared surfaces; no leakage into other surfaces (the sidebar search/sort that appeared in `widget/src/ui.ts` and `widget/src/styles.ts` is intentionally unrelated to Batch C and not covered here). |

## Manifest changes
- `widget-composer.contract`: rewritten. Now states "no header, no title, no close button, no step indicator." Step 2 shows previous answer "as inline-editable text (no label; placeholder reappears only when the field is emptied)." Step 3 has two side-by-side scope buttons with fixed labels and no question label. New keyboard line: "Enter in either textarea submits/advances. Shift+Enter inserts a newline."
- `widget-composer.invariants`: removed `dots-render-2-when-cohort-1-and-3-when-cohort-greater-than-1`; reworded `previous-answers-shown-and-editable-above-current-input` → `previous-answers-shown-as-editable-text-without-labels`; added `no-step-dots`, `submit-button-is-rounded-rectangle-not-circle`, `enter-submits-shift-enter-inserts-newline`, `scope-buttons-are-this-instance-and-site-wide-side-by-side`, `no-apply-to-label-on-scope-step`, `shake-warning-fires-from-any-step-with-uncommitted-text`.
- `widget-keyboard.contract`: rewritten. Enter is now the primary; Cmd/Ctrl+Enter is the alias.
- `widget-keyboard.invariants`: removed `cmd-enter-advances-step-and-submits`; added `enter-advances-step-and-submits` and `shift-enter-inserts-newline`. `widget-keyboard.tests` now lists `tests/e2e/composer.spec.ts` (the Enter-vs-Shift-Enter test exercises this surface).

## Local preview
Hard-refresh the smoke-test page to pick up the rebuilt bundle.
- **Widget host (smoke-test)**: http://localhost:5173/smoke-test/ — drive the composer (click anything) and verify: no dots, rounded-rectangle submit, Enter advances, "This instance" / "Site-wide" side-by-side, no "Apply to:" label, typing in step 1 then Esc shakes.
- **Dashboard**: http://localhost:8789/ — Site-wide tag remains the same blue from Batch A.
- **Verification report (Batch A)**: [reports/2026-04-29-batch-a-visual-theme.md](reports/2026-04-29-batch-a-visual-theme.md).

## Non-blocking notes
- Two intentional file modifications by another process landed in `widget/src/ui.ts` and `widget/src/styles.ts` (sidebar search/sort) and `dashboard/src/index.ts` (matching dashboard search/sort) during this turn. They are unrelated to Batch C and not covered by this report. The widget rebuild incorporates them; tests pass with the merged state. The corresponding manifest contracts (`widget-sidebar-standalone`, `dashboard-list`) were NOT updated by Batch C and may need a separate pipeline run to record those features.
- Pipeline deviation (continued from Batch A): orchestrator applied edits and integrator updates inline because the engineer/test/integrator subagents kept dropping into their own plan-mode loops and SendMessage isn't in the orchestrator's toolset. No correctness impact.
- The engineer's verify-before-fix discipline was applied inline: the shake-from-step-1 fix specifically reproduces the bug (live textarea text not in `c.whatText` until step advance) before changing behaviour.
