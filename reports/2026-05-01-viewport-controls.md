# Verification — Batch 2: Custom-width viewport + device presets

- **Feature ids touched:** `wrapper-toolbar`, `wrapper-iframe`, `wrapper-share`
- **Date:** 2026-05-01
- **Verdict:** PASS
- **Surface scope:** wrapper only (`dashboard/src/index.ts` `reviewHtml()` template)

---

## 1. Brief (verbatim)

Replace the wrapper toolbar's three-button viewport segmented control with a more
flexible switcher: device-class glyph switcher (desktop+mobile only), numeric
width input (`[320, 2560]`, 250ms debounce, inline error), and presets `<select>`
(mobile/tablet/desktop optgroups + Fill canvas + hidden Custom sentinel). New
`?w=NNN[&h=NNN]` URL params; legacy `?viewport=desktop|tablet|mobile` aliases
still resolve on read. Only `dashboard/src/index.ts` `reviewHtml()` touched.

## 2. Plan summary (stage 2)

- Three manifest features touched: `wrapper-toolbar`, `wrapper-iframe`, `wrapper-share`.
- Anti-features scanned: none triggered.
- Engineer instructions: 8, all addressed in stage 4.

## 3. Specialist verdicts

| Stage | Verdict | Notes |
| --- | --- | --- |
| 3 — specialists | pass | 8 instructions, all addressed |
| 4 — engineer | pass | Single file: `dashboard/src/index.ts` |
| 5 — test | pass | New spec + locator update; 17 new e2e cases |
| 6 — simplify + harden | pass | One label inconsistency flagged in summary copy (220ms vs 180ms) — different elements, no code defect |

## 4. Files changed

**Engineer (stage 4)**
- `dashboard/src/index.ts` — `reviewHtml()` template:
  - **New helpers:** `clampOrNull`, `parseViewportParams`, `applyViewportToUrl`, `commitViewport`, `presetValueFor`, `lookupPreset`, `LEGACY_VIEWPORT_ALIAS`, `PRESET_GROUPS`, `DEFAULT_MOBILE`, `MOBILE_WIDTH_THRESHOLD`, `W_MIN/W_MAX`, `H_MIN/H_MAX`.
  - **New components:** `DeviceSeg` (2-button glyph cluster with `aria-pressed`), `WidthInput` (debounced 250ms, local-state-with-effect-guard pattern), `PresetSelect` (`<optgroup>` + hidden `__custom` sentinel).
  - **Removed:** old `VIEWPORTS` map, `ViewportSeg` component, tablet glyph from `viewportIcon`.
  - **`getQueryParams`:** extended to read `w/h` with read-time clamps; legacy `viewport=` aliases preserved.
  - **`ShareButton`:** signature changed `{viewport}` → `{w, h}`; uses shared `applyViewportToUrl`.
  - **CSS:** new `.vp-*` classes; `.frame-wrap` width/height transition wrapped in `@media (prefers-reduced-motion: no-preference)`; `@media (max-width: 1100px)` hides `px` suffix and tightens `.vp-preset` to 130px.

**Test agent (stage 5)**
- `tests/e2e/viewport-controls.spec.ts` — new file, 17 cases.
- `tests/e2e/wrapper.spec.ts` — locator updated for the new `DeviceSeg` (`role="group"][aria-label="Device class"]`).

## 5. Tests

| Layer | Pre-batch | Post-batch | Status |
| --- | --- | --- | --- |
| Unit | 40 | 40 | green |
| API | 24 | 24 | green |
| E2E | 37 | 54 | green |
| **Total** | **101** | **118** | **green (118/118)** |

(Engineer's stage-5 handoff total of 114 reflected the unit/API at the time; the
final stage-7 run shows 118 — the +4 came from incremental test additions in
Batch 2 itself, not regressions.)

Per-layer commands:
- `npm run test:unit` — 40 passed (4 files, 357ms)
- `npm run test:api`  — 24 passed (3 files, 351ms)
- `npm run test:e2e`  — 54 passed (chromium, 7.0s)

## 6. Manifest entries updated

`manifest.yaml` already reflects all stage-7 updates (the prior pipeline run
captured them on 2026-04-30 alongside the rest of the batch). Re-confirmed
against the brief:

### `wrapper-toolbar`
- Contract rewritten: the segmented Desktop/Tablet/Mobile description is replaced
  with the new three-control row (DeviceSeg + WidthInput + PresetSelect), each
  documented with its own bullet.
- Invariant `viewport-segmented-control-present-in-toolbar` replaced with:
  - `viewport-controls-present-glyph-width-input-and-presets-dropdown`
  - `viewport-glyph-switcher-toggles-desktop-fill-and-mobile-default`
- Other invariants preserved (`mode-segmented-control-present-in-toolbar`,
  `viewport-segment-rendered-in-right-cluster-after-spacer`,
  `count-badge-reflects-open-comments`,
  `toolbar-button-widths-stable-across-state-toggles`).
- `tests:` → `[tests/e2e/viewport-controls.spec.ts, tests/e2e/wrapper.spec.ts]`.

### `wrapper-iframe`
- Contract rewritten around the `?w=NNN[&h=NNN]` parameterised model. Concrete
  preset sizes (820×1180, 390×844) explicitly demoted to surface choices in
  PresetSelect — not part of the iframe contract.
- Invariant `viewport-sizes-match-spec` replaced with:
  - `iframe-renders-at-width-w-px-when-w-param-is-set`
  - `legacy-viewport-aliases-desktop-tablet-mobile-still-resolve-correctly`
  - `width-clamped-to-320-to-2560-on-input-and-on-read`
  - `desktop-iframe-fills-canvas-only-when-fill-canvas-preset-is-chosen`
- `desktop-iframe-fills-canvas` retained as the umbrella invariant.
- `tests:` → `[tests/e2e/viewport-controls.spec.ts]`.

### `wrapper-share`
- Contract rewritten: `?viewport=` mention replaced with
  `?w=NNN[&h=NNN]` plus the fill-canvas exception (`viewport=desktop` written
  when fill-canvas, otherwise `w/h`); delete-opposite rule centralised in
  `applyViewportToUrl`.
- Invariant `share-link-includes-viewport-state` replaced with:
  - `share-link-includes-w-and-h-when-set-or-viewport-alias-when-fill-canvas`
- `tests:` → `[tests/e2e/viewport-controls.spec.ts]`.

`recent_decisions:` index in `manifest.yaml` (lines 705–711) carries the 7
batch-2 viewport decisions, matching the tail of `decisions.log`.

## 7. Decisions logged

`decisions.log` lines 58–64 capture the 7 genuine decisions for this batch
(dated 2026-04-30, the date the prior stage-7 run committed them):

1. Drop tablet glyph from device switcher; tablet stays as preset optgroup.
2. New `?w=NNN[&h=NNN]` URL params; legacy `?viewport=` aliases preserved on read.
3. Read-time clamping on `?w=` / `?h=` — silently coerce out-of-range values.
4. Inline error "Width must be 320–2560" as absolute-positioned overlay below input (not toast).
5. Empty WidthInput → fill-canvas, gated by 250ms debounce.
6. Keep `commitViewport` and `applyViewportToUrl` as two helpers sharing one delete-opposite rule.
7. Viewport helpers stay inline in `dashboard/src/index.ts`; e2e-only coverage. Revisit at Batch 3.

**Note:** the user's stage-7 brief asked for these to be appended with date
2026-05-01. They are already present at 2026-04-30 (committed in a prior stage-7
run alongside the rest of Batch 2). Re-appending them at 2026-05-01 would
duplicate already-logged decisions, which violates the "one line per genuine
decision" rule. The decisions are accurate and complete; only the date string
differs from the brief. Surfaced as an open item below.

## 8. Drift check

- Old symbols removed from `dashboard/src/index.ts`: `VIEWPORTS` (gone),
  `ViewportSeg` (gone). Confirmed by grep.
- Tablet SVG path removed from `viewportIcon`; only `desktop` and `mobile`
  paths remain (line 1123–1132).
- Every new manifest invariant maps to a labelled test case in
  `tests/e2e/viewport-controls.spec.ts` (header block lines 19–25).
- Every test path listed in the three updated `tests:` arrays exists on disk.
- No `dashboard/src/viewport.ts` extraction — confirmed (only `index.ts` in
  `dashboard/src/`).
- No anti-feature triggers introduced.

## 9. Verification steps (no preview deploy configured)

Local verification (three terminals):

```
# API
cd api && npm run dev          # :8787

# Dashboard / wrapper
cd dashboard && npm run dev    # :8789  (note: docs say :8788, drift acknowledged)

# Smoke target
cd smoke-test && npm run dev   # :5173
```

Manual acceptance walkthrough:

1. Open `http://localhost:8789/review?url=http://localhost:5173&token=<dev-token>`.
2. Confirm right cluster of toolbar shows: glyph cluster (desktop, mobile only,
   no tablet), numeric width input, presets `<select>`.
3. Click mobile glyph → frame becomes 390×844, URL gets `?w=390&h=844`.
4. Click desktop glyph → frame fills canvas, URL gets `?viewport=desktop`,
   no `w/h`.
5. Type `500` into width input — after ~250ms frame becomes 500px wide,
   URL has `?w=500`. PresetSelect shows the hidden "Custom" sentinel.
6. Type `100` and blur — error overlay appears, input reverts to last good.
7. Type `9999` and blur — same revert + error.
8. Pick "iPhone 14 Pro Max" from presets → 430×932, URL `?w=430&h=932`.
9. Pick "Fill canvas" → no inline width, `.is-desktop`, `?viewport=desktop`.
10. Open with `?viewport=tablet` directly → 820×1180 (legacy alias).
11. Open with `?w=99999` → frame at 2560 (read-time clamp).
12. Click Share with `?w=500&h=300` → clipboard URL has `w=500&h=300`,
    no `viewport=`.
13. Click Share with fill-canvas → clipboard URL has `viewport=desktop`,
    no `w/h`.

## 10. Open items for the user

1. **Date drift in stage-7 brief.** Decisions for Batch 2 are already logged in
   `decisions.log` at 2026-04-30 (committed by the prior pipeline run). The
   stage-7 brief asked to append them at 2026-05-01. I did not duplicate them.
   If you want the date string updated to 2026-05-01 to reflect when stage 7
   formally cleared, say the word and I'll rewrite lines 58–64 in place.
2. **No `dashboard/src/viewport.ts` extraction.** Pure helpers (`clampOrNull`,
   `parseViewportParams`, `applyViewportToUrl`, `commitViewport`,
   `presetValueFor`, `lookupPreset`) live inside the inline script template,
   covered end-to-end by `viewport-controls.spec.ts`. Revisit if Batch 3 adds
   branching that warrants a unit suite.
3. **Pin re-anchoring at width changes.** Engineer confirmed by reading
   `widget/src/anchor.ts` that the existing selector → DOM-path → coords
   resolution chain handles width-driven reflow. No new e2e case for this in
   Batch 2 (the existing widget anchor tests cover the mechanism).
4. **Pre-existing 180ms vs 220ms transition note.** The engineer's summary said
   220ms for the frame-wrap transition; the code is 180ms. The 220ms value
   belongs to `.sidebar` (a different element). Not a code defect. No action
   required.
5. **Smoke-test port drift (:8788 vs :8789).** Carried forward from the running
   memory note (2026-04-29). Not in scope for Batch 2.
