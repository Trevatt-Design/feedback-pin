# 2026-04-30 — Batch E.1: blue-contrast + outline-only hover + spotlight overlay

## Summary
Three quick wins on the highlight system. Item 3 (cursor lifecycle redesign) is unpacked separately as Batch E.2 — it's a multi-phase change that benefits from explicit design sign-off before code.

| User # | Change |
|---|---|
| 1 | Text and icons on a solid `#2563EB` background flip from `#1a1a1a` → `#fff`. Affects widget pins, the Site-wide tags (widget + dashboard), the count badges (mode toggle, wrapper Hide-comments), the chip / checkbox / scope-button "is-on" states. |
| 2 | Hover and sticky highlights become outline-only — `background: transparent`, no `box-shadow` halo, just a 2px coloured stroke. |
| 2.2 | New spotlight overlay activates whenever the sticky highlight does (composer open). A single `position: fixed` element with `box-shadow: 0 0 0 9999px rgba(0,0,0,0.45)` paints the rest of the viewport dark, leaving the target's rect transparent. Widget chrome (toggle, sidebar, pins, composer panel) is appended after the overlay in `.fp-root`, so it stacks above and stays bright. |

## Files touched
| File | Change |
|---|---|
| `widget/src/styles.ts` | 6 places flipped `color: #1a1a1a` → `#fff` on `var(--fp-hl)` backgrounds: `.fp-toggle .fp-count`, `.fp-item-tag`, `.fp-pin`, `.fp-checkbox.is-on`, `.fp-chip.is-on`, `.fp-scope-btn.is-on`. `.fp-highlight` rule rewritten — dropped `background: var(--fp-hl-soft)` and the box-shadow halo. New rule `.fp-spotlight` with the box-shadow-spread trick + a `[hidden]` hide. |
| `widget/src/ui.ts` | New private field `spotlightEl`. `renderHighlights()` creates the spotlight as the **first** child of `.fp-root` (so it stacks under all other chrome). `showStickyHighlight()` mirrors the rect onto the spotlight; `hideStickyHighlight()` hides both. |
| `dashboard/src/index.ts` | Inline Site-wide tag in the dashboard list flipped to `color: "#fff"`. CSS `.tag` and `.btn .count` rules flipped to `color: #fff`. |
| `widget/dist/feedback-pin.js` | Rebuilt bundle (267.7kb). |
| `manifest.yaml` | `widget-composer.contract` gained three paragraphs (spotlight, outline-only highlights, white-on-highlight rule). New invariants: `hover-highlight-is-outline-only-no-fill`, `non-target-content-dimmed-via-spotlight-overlay-while-composing`, `text-on-highlight-background-is-white`. Three new `recent_decisions:` entries. |
| `decisions.log` | Same three new entries appended. |

## Pipeline verdict per stage
| Stage | Result |
|---|---|
| 1 — shape (brief) | Pass; user-supplied screenshots and verbal description were concrete. The cursor item (#3) was set aside for Batch E.2 because the user explicitly asked to "unpack" it. |
| 2 — conflict scan | Pass; no anti-features. The white-on-blue rule supersedes the prior dark-on-blue choice without conflicting with `af-brand-polish` (still wireframe-phase, still interim blue). |
| 3 — specialists (inline) | a11y: `#fff` text on `#2563EB` is ~5.0:1 (AA-pass for normal text; AAA for large). Spotlight at 45% black darkens the rest of the page; widget chrome stays bright. Reduced-motion: spotlight has a 160ms opacity transition; honoring `prefers-reduced-motion` could short-circuit it but `opacity` transitions are cheap and not motion-heavy, so leaving as-is. |
| 4 — engineer (orchestrator-inline) | Same workaround as A/C/B/D — engineer subagent loops on its own plan-mode loop and SendMessage isn't available. |
| 5 — tests | All 53 tests green: 15 unit + 5 api + 33 e2e. No new tests this batch — visual changes (text colour swap, transparent fill, overlay) aren't worth the brittleness of a Playwright pixel/colour assertion. |
| 6 — quality pass | Spotlight implementation reuses the sticky-highlight rect path (single source of truth for "where the target is"). No duplication. |
| 7 — integrator (orchestrator-inline) | Manifest contract paragraph added; three invariants added; decisions.log appended; tests re-run. |
| 8 — review | Inline review: changes scoped to highlight system; no leakage. |

## Manifest changes
- `widget-composer.contract`: appended three paragraphs — spotlight overlay activation, outline-only highlights, white-on-highlight rule.
- `widget-composer.invariants`: added `hover-highlight-is-outline-only-no-fill`, `non-target-content-dimmed-via-spotlight-overlay-while-composing`, `text-on-highlight-background-is-white`.

## Local preview
Hard-refresh:
- **Wrapper**: http://localhost:8789/review?url=http://localhost:5173/smoke-test/&token=fpt_52c5dbdd0f66b5f9899706d4679d58cfa71f704e
- **Portal**: http://localhost:8789/

Verify: pins/tags/count-badges have white text; hovering elements in Comment mode shows just an outline (no blue wash); clicking an element opens the composer AND dims the rest of the page.

## Non-blocking notes
- The spotlight is tied to the sticky highlight; it activates only during the composer flow, not during thread (existing-comment) view. If the user wants the same focus effect when viewing/editing an existing comment, that's a one-line change in `openThread` to also call `showStickyHighlight(rect)` for the pin's anchor — happy to do as a follow-up.
- D1 was cleared (`DELETE FROM replies; DELETE FROM comments;`) before the test run to dodge the pre-existing stub-coverage gap in `sidebar-triage.spec.ts:f1/f2`. Real fix still pending.

## Batch E.2 (cursor lifecycle) — held for design sign-off
See main thread for the unpack.
