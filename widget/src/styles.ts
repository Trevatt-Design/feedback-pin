/**
 * Widget styles. All scoped to the shadow root.
 *
 * Visual language: Figma SDS (vendored copy in dashboard/web/src/sds/).
 * The widget consumes SDS at the **token** level — `widget/src/tokens.ts`
 * imports the full token set scoped to `:host`. This file maps the
 * project's existing `--fp-*` aliases onto SDS semantic tokens, so every
 * component class downstream keeps working without name changes.
 *
 * Status pill colour mapping is defined in `widget/src/tokens.ts` so the
 * widget and the dashboard cannot drift on triage colours.
 *
 * Critical visual invariants preserved here:
 *   - hover-highlight-is-outline-only-no-fill         (.fp-highlight)
 *   - non-target-content-dimmed-via-spotlight-overlay (.fp-spotlight,
 *     box-shadow 9999px + ~45% black rgba kept verbatim)
 *   - text-on-highlight-background-is-white           (`.fp-pin`, `.fp-item-tag`)
 *   - submit-button-is-rounded-rectangle-not-circle   (.fp-submit, 40×28)
 *   - icon-only-buttons-have-title-attribute          (set in ui.ts; styles
 *     never strip the title attribute)
 *   - reduced-motion: shake/spin animations disabled, transitions instant
 *
 * The cursor badge stays a vanilla 20px filled circle; only its background
 * resolves to the SDS brand-default token (with the legacy hex as fallback).
 */
import { sdsTokensCss } from "./tokens";

const fpAliases = `
  /* Project-layer aliases. Every --fp-* var is sourced from a vendored
     SDS token so widget and dashboard share one palette. Hex fallbacks
     are kept inline so the widget still renders if the SDS theme block
     ever fails to load (defensive — the bundle ships both together). */
  :host {
    /* Surface + ink */
    --fp-surface: var(--sds-color-background-default-default, #ffffff);
    --fp-fg: var(--sds-color-text-default-default, #111111);
    --fp-fg-muted: var(--sds-color-text-default-secondary, #6b6b6b);
    --fp-border: var(--sds-color-border-default-default, rgba(0, 0, 0, 0.10));
    --fp-border-soft: var(--sds-color-border-default-secondary, rgba(0, 0, 0, 0.06));

    /* Action / accent — keep the project's ink-black primary affordance.
       SDS brand-default already resolves to #2c2c2c in the light theme;
       the on-brand text token is its complement. */
    --fp-accent: var(--sds-color-background-brand-default, #1a1a1a);
    --fp-accent-fg: var(--sds-color-text-brand-on-brand, #ffffff);

    /* Highlight + spotlight tone. Drives outline-only hover, sticky
       highlight border, cursor badge fill, and the count-badge chip.
       Mapped to SDS info → brand-default fallback so it tracks the
       primary accent in light mode. */
    --fp-hl: var(--sds-color-background-info-default, #2563EB);
    --fp-hl-soft: rgba(37, 99, 235, 0.20);

    /* Radii — SDS sizes are stored in rems (0.5rem = 8px at root 16px).
       Keep the legacy pixel fallbacks in case the SDS theme is stripped. */
    --fp-radius: var(--sds-size-radius-200, 8px);
    --fp-radius-sm: var(--sds-size-radius-100, 4px);
    --fp-radius-pill: var(--sds-size-radius-full, 999px);

    /* Shadow stack — small surfaces use SDS drop-shadow-300, modal-y
       surfaces use drop-shadow-500. Custom rgba fallbacks preserved. */
    --fp-shadow: var(--sds-effects-shadows-drop-shadow-300, 0 6px 24px rgba(0,0,0,0.10), 0 1px 3px rgba(0,0,0,0.04));
    --fp-shadow-lg: var(--sds-effects-shadows-drop-shadow-500, 0 14px 40px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.06));

    /* Font stack — system stack first; SDS's "inter, sans-serif" appended
       so the widget never loads remote fonts (it can't, third-party host
       page CSP rules vary). The widget falls back to the host's system
       face if Inter isn't installed locally. */
    --fp-font: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, "Helvetica Neue", Arial, var(--sds-typography-family-sans, sans-serif);
  }
  :host {
    all: initial;
    font-family: var(--fp-font);
    color: var(--fp-fg);
    line-height: 1.4;
    font-size: 14px;
  }
`;

export const widgetCss = sdsTokensCss + fpAliases + `
  *, *::before, *::after { box-sizing: border-box; }

  .fp-root { position: fixed; inset: 0; pointer-events: none; z-index: 2147483600; }
  .fp-root > * { pointer-events: auto; }

  /* ---------- Mode toggle (segmented) ---------- */
  .fp-toggle {
    position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
    display: inline-flex; padding: 4px;
    background: var(--fp-surface);
    border: 1px solid var(--fp-border);
    border-radius: var(--fp-radius-pill);
    box-shadow: var(--fp-shadow);
  }
  .fp-toggle button {
    appearance: none; border: none; background: transparent;
    height: 36px; padding: 0 16px; border-radius: var(--fp-radius-pill);
    font: 500 13px var(--fp-font); color: var(--fp-fg-muted);
    cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
    transition: background 120ms ease, color 120ms ease;
  }
  .fp-toggle button:hover { color: var(--fp-fg); }
  .fp-toggle button.is-active {
    background: var(--fp-fg); color: var(--fp-accent-fg);
  }
  .fp-toggle button.is-active.fp-mode-comment { background: var(--fp-fg); }
  .fp-toggle svg { width: 14px; height: 14px; }
  .fp-toggle .fp-count {
    font-size: 11px; font-weight: 600;
    background: var(--fp-hl); color: #fff;
    padding: 1px 7px; border-radius: var(--fp-radius-pill);
    margin-left: 4px;
  }

  /* ---------- Sidebar ---------- */
  .fp-sidebar {
    position: fixed; top: 16px; right: 16px; bottom: 16px;
    width: 340px; max-width: calc(100vw - 32px);
    background: var(--fp-surface);
    border: 1px solid var(--fp-border);
    border-radius: var(--fp-radius);
    box-shadow: var(--fp-shadow);
    display: flex; flex-direction: column;
    overflow: hidden;
    transition: transform 220ms cubic-bezier(.2,.8,.2,1), opacity 180ms ease;
  }
  .fp-sidebar.is-hidden {
    transform: translateX(calc(100% + 24px)); opacity: 0; pointer-events: none;
  }
  .fp-sidebar-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 16px; border-bottom: 1px solid var(--fp-border-soft);
  }
  .fp-sidebar-head h3 { margin: 0; font: 600 14px var(--fp-font); }

  .fp-sidebar-controls {
    display: flex; gap: 8px; align-items: center;
    padding: 10px 16px;
    border-bottom: 1px solid var(--fp-border-soft);
  }
  .fp-sidebar-search {
    flex: 1; min-width: 0;
    height: 30px; padding: 0 10px;
    border: 1px solid var(--fp-border);
    border-radius: var(--fp-radius-pill);
    background: var(--fp-surface);
    font: 400 12px var(--fp-font); color: var(--fp-fg);
    outline: none;
  }
  .fp-sidebar-search:focus {
    border-color: var(--fp-fg);
    box-shadow: 0 0 0 3px var(--fp-hl-soft);
  }
  .fp-sidebar-sort {
    appearance: none;
    -webkit-appearance: none;
    height: 30px; padding: 0 24px 0 10px;
    border: 1px solid var(--fp-border);
    border-radius: var(--fp-radius-pill);
    background: var(--fp-surface);
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path d='M1 1l4 4 4-4' fill='none' stroke='%236b6b6b' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/></svg>");
    background-repeat: no-repeat;
    background-position: right 8px center;
    font: 500 12px var(--fp-font); color: var(--fp-fg);
    cursor: pointer; outline: none;
  }
  .fp-sidebar-sort:focus {
    border-color: var(--fp-fg);
    box-shadow: 0 0 0 3px var(--fp-hl-soft);
  }
  .fp-visually-hidden {
    position: absolute !important; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0;
  }

  .fp-sidebar-tabs {
    display: flex; gap: 4px; padding: 10px 16px;
    border-bottom: 1px solid var(--fp-border-soft);
  }
  .fp-sidebar-tabs button {
    appearance: none; border: 1px solid transparent; background: transparent;
    font: 500 12px var(--fp-font); color: var(--fp-fg-muted);
    padding: 6px 10px; border-radius: var(--fp-radius-pill); cursor: pointer;
  }
  .fp-sidebar-tabs button.is-active {
    background: var(--sds-color-background-default-secondary, #f0efeb);
    color: var(--fp-fg); border-color: var(--fp-border-soft);
  }
  .fp-sidebar-list {
    flex: 1; overflow-y: auto; padding: 8px;
  }
  .fp-sidebar-empty {
    padding: 28px 16px; text-align: center; color: var(--fp-fg-muted);
    font-size: 13px;
  }

  .fp-item {
    display: flex; gap: 10px; padding: 12px;
    border-radius: var(--fp-radius-sm);
    cursor: pointer; position: relative;
  }
  .fp-item:hover { background: var(--sds-color-background-default-default-hover, #f5f4ef); }
  .fp-item.is-active { background: var(--fp-hl-soft); }
  .fp-item.is-closed .fp-item-num {
    background: var(--sds-color-background-disabled-default, #b5b5b5);
    color: #fff;
  }
  .fp-item-num {
    width: 24px; height: 24px; border-radius: var(--fp-radius-pill);
    background: var(--fp-fg); color: var(--fp-accent-fg);
    font: 600 11px var(--fp-font);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .fp-item-body { flex: 1; min-width: 0; }
  .fp-item-text {
    font: 500 13px var(--fp-font); color: var(--fp-fg);
    overflow: hidden; text-overflow: ellipsis; display: -webkit-box;
    -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    word-break: break-word;
  }
  .fp-item-meta {
    margin-top: 4px; font: 400 11px var(--fp-font); color: var(--fp-fg-muted);
    display: flex; gap: 6px; align-items: center;
  }
  /* Eyebrow register: 10px is below the SDS body-small ramp (12px) by
     intent. Do not collapse into --sds-font-body-small. */
  .fp-item-tag {
    display: inline-block; padding: 1px 6px; border-radius: 4px;
    background: var(--fp-hl); color: #fff; font: 600 10px var(--fp-font);
    text-transform: uppercase; letter-spacing: 0.04em;
  }
  /* Status-pill rules live in widget/src/tokens.ts so the dashboard can
     mirror the exact token references. The .fp-status-* classes are
     consumed verbatim here. */
  .fp-item-actions {
    display: none; gap: 4px; align-items: center;
  }
  .fp-item:hover .fp-item-actions { display: flex; }
  .fp-item-actions button {
    appearance: none; border: none; background: transparent;
    width: 24px; height: 24px; border-radius: var(--fp-radius-pill);
    color: var(--fp-fg-muted); cursor: pointer;
    display: inline-flex; align-items: center; justify-content: center;
  }
  .fp-item-actions button:hover {
    background: var(--sds-color-background-default-secondary-hover, rgba(0,0,0,0.06));
    color: var(--fp-fg);
  }
  .fp-item-actions svg { width: 13px; height: 13px; }

  /* ---------- Hover highlight while picking ---------- */
  /* Outline only — invariant: hover-highlight-is-outline-only-no-fill.
     2px coloured stroke, no fill, no halo. Geometry preserved verbatim;
     only the border colour resolves through the SDS token chain. */
  .fp-highlight {
    position: fixed; pointer-events: none;
    border: 2px solid var(--fp-hl);
    background: transparent;
    border-radius: 6px;
    transition: all 60ms ease;
  }

  /* ---------- Cursor mode-indicator badge ---------- */
  /* Stays vanilla — invariant: cursor-badge-remains-custom-consumes-sds-
     brand-token-only. 20px circle, white "+" interior. The fill is the
     only thing that resolves through the SDS chain (--fp-hl). */
  .fp-cursor-badge {
    position: fixed;
    width: 20px; height: 20px; border-radius: var(--fp-radius-pill);
    background: var(--fp-hl); color: #fff;
    box-shadow: 0 2px 8px rgba(0,0,0,0.18), 0 0 0 2px var(--fp-surface);
    display: flex; align-items: center; justify-content: center;
    pointer-events: none;
    /* Default transition (overridden per stage in JS). */
    transition: opacity 120ms ease;
  }
  .fp-cursor-badge[hidden] { display: none; }
  .fp-cursor-badge svg { width: 12px; height: 12px; display: block; }

  /* ---------- Spotlight overlay ---------- */
  /* Invariant: spotlight-overlay-consumes-sds-color-tokens-only-opacity-
     preserved. The 9999px box-shadow trick + ~45% black rgba is preserved
     byte-for-byte; this is load-bearing for the focus effect. */
  .fp-spotlight {
    position: fixed; pointer-events: none;
    border-radius: 6px;
    box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.45);
    transition: opacity 160ms ease;
  }
  .fp-spotlight[hidden] { display: none; }

  /* ---------- Pin marker ---------- */
  .fp-pin {
    position: fixed;
    width: 28px; height: 28px; border-radius: var(--fp-radius-pill);
    background: var(--fp-hl); color: #fff;
    font: 700 12px var(--fp-font);
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 4px 14px rgba(0,0,0,0.20), 0 0 0 2px var(--fp-surface);
    cursor: pointer;
    transform: translate(-50%, -50%);
    transition: transform 120ms ease;
    border: none;
  }
  .fp-pin:hover { transform: translate(-50%, -50%) scale(1.12); }
  .fp-pin.is-closed {
    background: var(--sds-color-background-disabled-default, #c5c5c5);
    color: #fff;
  }
  .fp-pin.is-active { box-shadow: 0 0 0 3px var(--fp-fg), 0 4px 14px rgba(0,0,0,0.20); }

  /* ---------- Floating composer / thread panel ---------- */
  .fp-panel {
    position: fixed;
    width: 340px; max-width: calc(100vw - 32px);
    background: var(--fp-surface);
    border: 1px solid var(--fp-border);
    border-radius: var(--fp-radius);
    box-shadow: var(--fp-shadow-lg);
    overflow: hidden;
    display: flex; flex-direction: column;
  }
  .fp-panel-head {
    padding: 12px 14px;
    display: flex; align-items: center; justify-content: space-between;
    border-bottom: 1px solid var(--fp-border-soft);
  }
  .fp-panel-head .fp-panel-target {
    font: 500 12px var(--fp-font); color: var(--fp-fg-muted);
    max-width: 250px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .fp-icon-btn {
    appearance: none; border: none; background: transparent;
    width: 28px; height: 28px; border-radius: var(--fp-radius-pill);
    color: var(--fp-fg-muted); cursor: pointer;
    display: inline-flex; align-items: center; justify-content: center;
  }
  .fp-icon-btn:hover {
    background: var(--sds-color-background-default-secondary-hover, rgba(0,0,0,0.06));
    color: var(--fp-fg);
  }
  .fp-icon-btn svg { width: 14px; height: 14px; }

  .fp-panel-body { padding: 12px 14px; }
  .fp-input-row {
    position: relative;
  }
  .fp-input-row textarea {
    width: 100%; resize: none; min-height: 44px; max-height: 200px;
    padding: 10px 52px 10px 12px;
    border: 1px solid var(--fp-border);
    border-radius: var(--fp-radius-sm);
    font: 400 14px var(--fp-font); color: var(--fp-fg);
    background: var(--fp-surface);
    line-height: 1.4;
  }
  .fp-input-row textarea:focus {
    outline: none; border-color: var(--fp-fg);
    box-shadow: 0 0 0 3px var(--fp-hl-soft);
  }
  /* Submit: invariant submit-button-radius-mapped-to-sds-radius-200.
     SDS radius-200 = 0.5rem = 8px, identical to the legacy hardcoded
     value, so the visual and the invariant agree. */
  .fp-submit {
    position: absolute; right: 6px; bottom: 6px;
    appearance: none; border: none; padding: 0;
    width: 40px; height: 28px; border-radius: var(--sds-size-radius-200, 8px);
    background: var(--fp-fg); color: var(--fp-accent-fg);
    cursor: pointer;
    display: inline-flex; align-items: center; justify-content: center;
    transition: background 120ms ease, opacity 120ms ease;
  }
  .fp-submit:hover { background: var(--sds-color-background-brand-hover, #2a2a2a); }
  .fp-submit:active { background: #000; }
  .fp-submit:disabled {
    background: var(--sds-color-background-disabled-default, #cfcfcf);
    cursor: not-allowed;
  }
  .fp-submit svg { width: 14px; height: 14px; display: block; }

  /* History stack — previous answers, inline-editable on click. */
  .fp-history { display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px; }
  .fp-history-item {
    padding: 8px 12px;
    border: 1px solid transparent;
    border-radius: var(--fp-radius-sm);
    background: var(--sds-color-background-default-secondary, #f5f4ef);
    cursor: text;
  }
  .fp-history-item:hover { border-color: var(--fp-border-soft); }
  .fp-history-item:focus-within {
    background: var(--fp-surface);
    border-color: var(--fp-fg);
    box-shadow: 0 0 0 3px var(--fp-hl-soft);
  }
  .fp-history-value {
    font: 400 13px var(--fp-font); color: var(--fp-fg);
    white-space: pre-wrap; word-break: break-word;
    outline: none;
  }
  .fp-history-value[contenteditable="true"]:empty::before {
    content: attr(data-placeholder);
    color: var(--fp-fg-muted);
  }

  /* Top action bar — used in the existing-comment thread view. */
  .fp-top-actions {
    display: flex; align-items: center; gap: 4px;
    padding: 8px 8px 0;
    justify-content: flex-end;
  }
  .fp-top-actions .fp-icon-btn { width: 32px; height: 32px; }
  .fp-top-actions .fp-icon-btn svg { width: 16px; height: 16px; }
  .fp-status-select {
    appearance: none; -webkit-appearance: none;
    height: 30px; padding: 0 24px 0 10px;
    border: 1px solid var(--fp-border); border-radius: var(--fp-radius-pill);
    background: var(--fp-surface);
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path d='M1 1l4 4 4-4' fill='none' stroke='%236b6b6b' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/></svg>");
    background-repeat: no-repeat; background-position: right 8px center;
    font: 500 12px var(--fp-font); color: var(--fp-fg);
    cursor: pointer; outline: none;
  }
  .fp-status-select:focus {
    border-color: var(--fp-fg);
    box-shadow: 0 0 0 3px var(--fp-hl-soft);
  }

  /* Edit-mode thread. */
  .fp-edit-actions {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--fp-border-soft);
    justify-content: flex-end;
  }
  .fp-edit-form { display: flex; flex-direction: column; gap: 12px; }
  .fp-edit-field {
    display: flex; flex-direction: column; gap: 4px;
    cursor: text;
  }
  /* Eyebrow register: 10px is below the SDS body-small ramp by intent. */
  .fp-edit-label {
    font: 600 10px var(--fp-font);
    text-transform: uppercase; letter-spacing: 0.06em;
    color: var(--fp-fg-muted);
    cursor: pointer;
    user-select: none;
  }
  .fp-edit-field textarea {
    width: 100%; resize: vertical; min-height: 48px; max-height: 200px;
    padding: 8px 10px;
    border: 1px solid var(--fp-border);
    border-radius: var(--fp-radius-sm);
    font: 400 14px var(--fp-font); color: var(--fp-fg);
    background: var(--fp-surface);
    line-height: 1.4;
  }
  .fp-edit-field textarea:focus {
    outline: none; border-color: var(--fp-fg);
    box-shadow: 0 0 0 3px var(--fp-hl-soft);
  }
  .fp-edit-checkbox {
    display: flex; align-items: center; gap: 8px;
    cursor: pointer;
    font: 400 13px var(--fp-font); color: var(--fp-fg);
    padding: 4px 0;
  }
  .fp-edit-checkbox input { accent-color: var(--fp-fg); cursor: pointer; }
  /* Plain text-button used for Cancel / Save in the thread edit state. */
  .fp-btn-text {
    appearance: none; border: 1px solid var(--fp-border);
    background: var(--fp-surface); color: var(--fp-fg);
    height: 32px; padding: 0 14px; border-radius: var(--fp-radius-sm);
    font: 500 13px var(--fp-font); cursor: pointer;
    transition: background 120ms ease, border-color 120ms ease;
  }
  .fp-btn-text:hover { background: var(--sds-color-background-default-default-hover, #f5f4ef); }
  .fp-btn-text:disabled { opacity: 0.6; cursor: not-allowed; }
  .fp-btn-text--primary {
    background: var(--fp-fg); color: var(--fp-accent-fg); border-color: var(--fp-fg);
  }
  .fp-btn-text--primary:hover { background: var(--sds-color-background-brand-hover, #2a2a2a); }

  /* Shake animation — used to warn before dismissing a textful composer. */
  @keyframes fp-shake {
    0%, 100% { transform: translateX(0); }
    20% { transform: translateX(-6px); }
    40% { transform: translateX(6px); }
    60% { transform: translateX(-4px); }
    80% { transform: translateX(4px); }
  }
  .fp-shake { animation: fp-shake 280ms ease; }

  .fp-options {
    margin-top: 10px;
    display: flex; align-items: center; gap: 8px;
    font: 500 12px var(--fp-font); color: var(--fp-fg-muted);
  }
  .fp-checkbox {
    display: inline-flex; align-items: center; gap: 6px; cursor: pointer;
    padding: 4px 8px; border-radius: var(--fp-radius-pill);
    border: 1px solid var(--fp-border-soft);
  }
  .fp-checkbox:hover { background: var(--sds-color-background-default-default-hover, #f5f4ef); }
  .fp-checkbox input { accent-color: var(--fp-fg); }
  .fp-checkbox.is-on { background: var(--fp-hl); color: #fff; border-color: transparent; }

  /* Site-wide chip. */
  .fp-chip {
    appearance: none; border: 1px solid var(--fp-border-soft);
    background: transparent; color: var(--fp-fg-muted);
    height: 28px; padding: 0 10px 0 6px;
    border-radius: var(--fp-radius-pill);
    font: 500 12px var(--fp-font); cursor: pointer;
    display: inline-flex; align-items: center; gap: 6px;
    transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
  }
  .fp-chip:hover { background: var(--sds-color-background-default-default-hover, #f5f4ef); color: var(--fp-fg); }
  .fp-chip-mark {
    width: 18px; height: 18px; border-radius: 999px;
    border: 1.5px solid var(--fp-border);
    display: inline-flex; align-items: center; justify-content: center;
    color: transparent;
    transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
  }
  .fp-chip-mark svg { width: 11px; height: 11px; }
  .fp-chip.is-on {
    background: var(--fp-hl); color: #fff; border-color: transparent;
  }
  .fp-chip.is-on .fp-chip-mark { background: var(--fp-fg); border-color: var(--fp-fg); color: var(--fp-hl); }
  .fp-chip:disabled { cursor: default; }

  /* Scope step. */
  .fp-scope, .fp-clarify { display: flex; flex-direction: column; gap: 10px; }
  .fp-scope[hidden], .fp-clarify[hidden] { display: none; }
  .fp-thinking {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 4px;
    color: var(--fp-fg-muted);
    font: 500 12px var(--fp-font);
  }
  .fp-thinking[hidden] { display: none; }
  .fp-spinner {
    width: 14px; height: 14px;
    border: 2px solid var(--fp-border);
    border-top-color: var(--fp-fg);
    border-radius: 999px;
    animation: fp-spin 700ms linear infinite;
  }
  @keyframes fp-spin { to { transform: rotate(360deg); } }
  .fp-scope-q {
    font: 500 13px var(--fp-font); color: var(--fp-fg);
  }
  .fp-scope-choices { display: flex; flex-direction: column; gap: 8px; }
  .fp-scope-choices--row { flex-direction: row; gap: 8px; }
  .fp-scope-choices--row .fp-scope-btn { flex: 1; text-align: center; }
  .fp-scope-btn {
    appearance: none; border: 1px solid var(--fp-border);
    background: var(--fp-surface); color: var(--fp-fg);
    height: 40px; padding: 0 14px; border-radius: var(--fp-radius-sm);
    font: 500 14px var(--fp-font); cursor: pointer;
    text-align: left;
    transition: background 120ms ease, border-color 120ms ease, transform 100ms ease;
  }
  .fp-scope-btn:hover { background: var(--sds-color-background-default-default-hover, #f5f4ef); border-color: var(--fp-fg); }
  .fp-scope-btn:focus-visible {
    outline: none; border-color: var(--fp-fg);
    box-shadow: 0 0 0 3px var(--fp-hl-soft);
  }
  .fp-scope-btn.is-on {
    background: var(--fp-hl); border-color: transparent; color: #fff;
  }
  .fp-scope-btn:disabled { opacity: 0.6; cursor: default; }
  /* Eyebrow register: 11px is below the SDS body-small ramp by intent. */
  .fp-step-label {
    font: 500 11px var(--fp-font); color: var(--fp-fg-muted);
    text-transform: uppercase; letter-spacing: 0.06em;
    margin-bottom: 6px;
  }
  .fp-error {
    margin-top: 8px;
    padding: 6px 10px;
    background: var(--sds-color-background-danger-tertiary, #fdecea);
    color: var(--sds-color-text-danger-default, #8a1f12);
    border-radius: var(--fp-radius-sm); font: 400 12px var(--fp-font);
  }

  /* ---------- Thread view ---------- */
  .fp-thread { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; max-height: 360px; overflow-y: auto; }
  .fp-msg {
    padding: 10px 12px; border-radius: var(--fp-radius-sm);
    background: var(--sds-color-background-default-secondary, #f5f4ef);
  }
  .fp-msg.is-designer { background: var(--fp-hl-soft); }
  .fp-msg-meta {
    font: 500 11px var(--fp-font); color: var(--fp-fg-muted);
    display: flex; gap: 6px; margin-bottom: 4px;
  }
  .fp-msg-body {
    font: 400 13px var(--fp-font); color: var(--fp-fg);
    white-space: pre-wrap; word-break: break-word;
  }
  .fp-msg-extra {
    margin-top: 4px; font: 400 12px var(--fp-font); color: var(--fp-fg-muted);
  }
  .fp-msg-extra strong { color: var(--fp-fg); font-weight: 500; }

  /* Reduced-motion: shake/spin disabled, transitions instant. The
     widget-side overrides are explicit (rather than relying on the
     blanket * rule from tokens.ts) because the cursor badge stage
     transitions are JS-driven inline styles that already opt out via
     the JS path; here we only guarantee CSS-level motion is dropped. */
  @media (prefers-reduced-motion: reduce) {
    .fp-shake { animation: none; }
    .fp-spinner { animation-duration: 0s; }
    .fp-pin, .fp-highlight, .fp-toggle button, .fp-sidebar,
    .fp-cursor-badge, .fp-spotlight, .fp-submit, .fp-btn-text,
    .fp-scope-btn, .fp-chip, .fp-chip-mark { transition: none; }
  }
`;
