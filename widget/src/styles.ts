/**
 * Widget styles. All scoped to the shadow root.
 *
 * Visual language: a quiet measuring instrument laid over someone else's
 * design, in the same neutral Geist-style system as the dashboard: white
 * chrome, neutral greys, 1px hairlines, black primary action, blue focus
 * ring, mono numerals. Chartreuse is reserved for the things that mark the
 * page: pins, the cursor badge, the hover outline, the open count.
 *
 * Tokens: the vendored Figma SDS set (`widget/src/tokens.ts`) is still
 * loaded so the dashboard and the contract tests share one chain, but the
 * `--fp-*` layer below is the widget's own palette and overrides the SDS
 * semantic values it relies on.
 *
 * Critical visual invariants preserved here:
 *   - hover-highlight-is-outline-only-no-fill         (.fp-highlight)
 *   - non-target-content-dimmed-via-spotlight-overlay (.fp-spotlight,
 *     box-shadow 9999px + ~45% black rgba kept verbatim)
 *   - text-on-highlight-background-is-ink             (.fp-pin, .fp-item-tag)
 *   - submit-button-is-rounded-rectangle-not-circle   (.fp-submit, 40×28)
 *   - icon-only-buttons-have-title-attribute          (set in ui.ts)
 *   - reduced-motion: shake/spin animations disabled, transitions instant
 *   - cursor badge: 20px filled circle, fill via the SDS brand chain
 */
import { sdsTokensCss } from "./tokens";

const fpAliases = `
  :host {
    /* Brand */
    --fp-brand-hl: #C7FF00;
    --fp-brand-hl-ink: #171717;

    /* The widget's palette is written INTO the SDS semantic slots it
       consumes, so the var chain stays SDS-shaped (dashboard + contract
       tests read the same names) while the values are this widget's. */
    --sds-color-background-default-default: #FFFFFF;
    --sds-color-background-default-secondary: #F5F5F5;
    --sds-color-background-default-secondary-hover: #EBEBEB;
    --sds-color-background-default-default-hover: #F5F5F5;
    --sds-color-text-default-default: #171717;
    --sds-color-text-default-secondary: #5F5F5F;
    --sds-color-text-default-tertiary: #8F8F8F;
    --sds-color-border-default-default: rgba(0, 0, 0, 0.12);
    --sds-color-border-default-secondary: rgba(0, 0, 0, 0.07);
    --sds-color-background-brand-default: #171717;
    --sds-color-background-brand-hover: #383838;
    --sds-color-text-brand-on-brand: #FFFFFF;

    /* Surfaces: white chrome, neutral grey wells. */
    --fp-surface: var(--sds-color-background-default-default, #FFFFFF);
    --fp-well: var(--sds-color-background-default-secondary, #F5F5F5);
    --fp-well-hover: var(--sds-color-background-default-secondary-hover, #EBEBEB);

    /* Ink */
    --fp-fg: var(--sds-color-text-default-default, #171717);
    --fp-fg-muted: var(--sds-color-text-default-secondary, #5F5F5F);
    --fp-fg-faint: var(--sds-color-text-default-tertiary, #8F8F8F);

    /* Lines: hairlines, never heavier than 1px. */
    --fp-border: var(--sds-color-border-default-default, rgba(0, 0, 0, 0.12));
    --fp-border-soft: var(--sds-color-border-default-secondary, rgba(0, 0, 0, 0.07));

    /* Action */
    --fp-accent: var(--sds-color-background-brand-default, #171717);
    --fp-blue: #0068D6;
    --fp-accent-fg: var(--sds-color-text-brand-on-brand, #FFFFFF);

    /* Highlight. The SDS info token is overridden so the var chain the
       contract tests expect still resolves to the brand highlight. */
    --sds-color-background-info-default: var(--fp-brand-hl);
    --fp-hl: var(--sds-color-background-info-default, #C7FF00);
    --fp-hl-fg: var(--fp-brand-hl-ink);
    --fp-hl-soft: rgba(199, 255, 0, 0.28);

    /* Geometry: tighter than before; hierarchy comes from size, not radius. */
    --fp-radius: 12px;
    --fp-radius-lg: 12px;
    --fp-radius-sm: 6px;
    --fp-radius-pill: var(--sds-size-radius-full, 999px);

    /* Depth: a hairline plus one soft, low shadow. */
    --fp-shadow: 0 0 0 1px rgba(0,0,0,0.04), 0 4px 8px -4px rgba(0,0,0,0.06), 0 12px 24px -8px rgba(0,0,0,0.10);
    --fp-shadow-lg: 0 0 0 1px rgba(0,0,0,0.04), 0 8px 16px -6px rgba(0,0,0,0.08), 0 24px 48px -12px rgba(0,0,0,0.16);

    /* Type: Geist when the host has it, else the system UI face. No remote
       fonts (host CSP varies). Numerals use the mono stack. */
    --fp-font: "Geist", "Geist Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, var(--sds-typography-family-sans, sans-serif);
    --fp-mono: "Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
    --fp-focus: 0 0 0 2px var(--fp-surface), 0 0 0 4px var(--fp-blue);
  }
  :host {
    all: initial;
    font-family: var(--fp-font);
    color: var(--fp-fg);
    line-height: 1.45;
    font-size: 13px;
    -webkit-font-smoothing: antialiased;
    font-feature-settings: "tnum" 1, "cv11" 1;
  }
`;

export const widgetCss = sdsTokensCss + fpAliases + `
  *, *::before, *::after { box-sizing: border-box; }
  button, input, select, textarea { font-family: inherit; }
  :focus-visible { outline: none; box-shadow: var(--fp-focus); }

  .fp-root { position: fixed; inset: 0; pointer-events: none; z-index: 2147483600; }
  .fp-root > * { pointer-events: auto; }
  /* Stacking inside the root: page markers sit under the chrome, so a pin
     never paints over the sidebar, toggle or an open panel. */
  .fp-pin { z-index: 1; }
  .fp-sidebar, .fp-sidebar-tab { z-index: 3; }
  .fp-toggle { z-index: 4; }
  .fp-panel { z-index: 5; }
  /* .fp-cursor-badge sits on top (z-index 6, set in its own rule below). */

  /* ---------- Mode toggle (segmented) ---------- */
  .fp-toggle {
    position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
    display: inline-flex; padding: 3px; gap: 2px;
    background: var(--fp-surface);
    border: 1px solid var(--fp-border);
    border-radius: var(--fp-radius-pill);
    box-shadow: var(--fp-shadow);
  }
  .fp-toggle button {
    appearance: none; border: none; background: transparent;
    height: 32px; padding: 0 14px; border-radius: var(--fp-radius-pill);
    font: 500 13px var(--fp-font); color: var(--fp-fg-muted);
    cursor: pointer; display: inline-flex; align-items: center; gap: 7px;
    transition: background 140ms ease, color 140ms ease;
  }
  .fp-toggle button:hover { color: var(--fp-fg); }
  .fp-toggle button.is-active { background: var(--fp-fg); color: var(--fp-accent-fg); }
  .fp-toggle svg { width: 14px; height: 14px; }
  .fp-toggle .fp-count {
    min-width: 20px; height: 20px; padding: 0 6px;
    display: inline-flex; align-items: center; justify-content: center;
    font: 500 11px var(--fp-mono);
    background: var(--fp-hl); color: var(--fp-hl-fg);
    border-radius: var(--fp-radius-pill);
    margin-left: 2px;
  }

  /* ---------- Sidebar ---------- */
  .fp-sidebar {
    position: fixed; top: 0; right: 0; bottom: 0;
    width: 340px; max-width: calc(100vw - 32px);
    background: var(--fp-surface);
    border-left: 1px solid var(--fp-border);
    box-shadow: -1px 0 0 rgba(255,255,255,0.6), -12px 0 32px -16px rgba(20,20,20,0.18);
    display: flex; flex-direction: column;
    overflow: hidden;
    transition: transform 240ms cubic-bezier(.2,.8,.2,1);
  }
  .fp-sidebar.is-hidden { transform: translateX(100%); pointer-events: none; }

  .fp-sidebar-tab {
    position: fixed; top: 50%; right: 340px; transform: translateY(-50%);
    appearance: none; border: 1px solid var(--fp-border); border-right: none;
    width: 20px; height: 56px; padding: 0;
    background: var(--fp-surface); color: var(--fp-fg-faint);
    border-radius: var(--fp-radius-sm) 0 0 var(--fp-radius-sm);
    box-shadow: -2px 0 8px -2px rgba(20,20,20,0.10);
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    transition: right 240ms cubic-bezier(.2,.8,.2,1), color 140ms ease;
  }
  .fp-sidebar-tab:hover { color: var(--fp-fg); }
  .fp-sidebar-tab svg { width: 11px; height: 11px; transition: transform 240ms ease; }
  .fp-sidebar-tab.is-collapsed { right: 0; }
  .fp-sidebar-tab.is-collapsed svg { transform: rotate(180deg); }
  @media (max-width: 372px) { .fp-sidebar-tab { right: calc(100vw - 32px); } }

  [data-tip] { position: relative; }
  [data-tip]::after {
    content: attr(data-tip);
    position: absolute; left: 50%; bottom: calc(100% + 10px); transform: translateX(-50%) translateY(3px);
    padding: 5px 8px; white-space: nowrap;
    background: var(--fp-fg); color: var(--fp-surface);
    font: 500 11px/1 var(--fp-font);
    border-radius: 5px;
    opacity: 0; pointer-events: none;
    transition: opacity 100ms ease, transform 100ms ease;
  }
  /* Appears after a short dwell so it never flickers on a pass-through;
     hides at once on leave. */
  [data-tip]:hover::after, [data-tip]:focus-visible::after {
    opacity: 1; transform: translateX(-50%) translateY(0);
    transition: opacity 120ms ease 500ms, transform 120ms ease 500ms;
  }

  .fp-sidebar-head {
    display: flex; align-items: center; justify-content: space-between;
    height: 48px; padding: 0 12px 0 20px;
  }
  .fp-sidebar-head h3 { margin: 0; font: 600 13px var(--fp-font); letter-spacing: -0.01em; display: flex; align-items: baseline; gap: 6px; }
  .fp-head-count { font: 500 12px var(--fp-mono); color: var(--fp-fg-muted); }
  :host .fp-status-pill { width: 6px; height: 6px; }

  .fp-sidebar-controls {
    display: flex; gap: 8px; align-items: center;
    padding: 0 20px 10px;
  }
  .fp-sidebar-search, .fp-sidebar-sort, .fp-status-select {
    height: 30px;
    border: 1px solid var(--fp-border);
    border-radius: var(--fp-radius-sm);
    background: var(--fp-surface);
    font-family: var(--fp-font); font-size: 12px; font-weight: 400; line-height: 28px;
    color: var(--fp-fg);
    outline: none;
    transition: background 120ms ease, border-color 120ms ease;
  }
  .fp-sidebar-search { flex: 1; min-width: 0; padding: 0 10px; }
  .fp-sidebar-search::placeholder { color: var(--fp-fg-faint); }
  .fp-sidebar-search::-webkit-search-cancel-button { -webkit-appearance: none; }
  .fp-sidebar-sort, .fp-status-select {
    appearance: none; -webkit-appearance: none;
    padding: 0 24px 0 10px; font-weight: 500;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path d='M1 1l4 4 4-4' fill='none' stroke='%235F5F5F' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/></svg>");
    background-repeat: no-repeat; background-position: right 8px center;
    cursor: pointer;
  }
  .fp-sidebar-search:hover, .fp-sidebar-sort:hover, .fp-status-select:hover { border-color: rgba(0,0,0,0.24); }
  .fp-sidebar-search:focus, .fp-sidebar-sort:focus, .fp-status-select:focus {
    background-color: var(--fp-surface); border-color: var(--fp-fg-muted); box-shadow: var(--fp-focus);
  }
  .fp-visually-hidden {
    position: absolute !important; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0;
  }

  /* One switch in place of filter tabs: resolved comments stay out of the
     way (list and pins) until asked for. */
  .fp-sidebar-tabs {
    display: flex; align-items: center; padding: 6px 20px 10px;
    border-bottom: 1px solid var(--fp-border-soft);
  }
  .fp-switch {
    display: inline-flex; align-items: center; gap: 8px; cursor: pointer;
    font: 500 12px var(--fp-font); color: var(--fp-fg-muted);
    user-select: none;
  }
  .fp-switch:hover { color: var(--fp-fg); }
  .fp-switch input { position: absolute; opacity: 0; width: 0; height: 0; }
  .fp-switch-track {
    position: relative; width: 26px; height: 16px; border-radius: 999px;
    background: var(--fp-well-hover); flex-shrink: 0;
    transition: background 140ms ease;
  }
  .fp-switch-track::after {
    content: ""; position: absolute; top: 2px; left: 2px;
    width: 12px; height: 12px; border-radius: 999px;
    background: var(--fp-surface);
    box-shadow: 0 1px 2px rgba(20,20,20,0.25);
    transition: transform 140ms ease;
  }
  .fp-switch input:checked + .fp-switch-track { background: var(--fp-fg); }
  .fp-switch input:checked + .fp-switch-track::after { transform: translateX(10px); }
  .fp-switch input:focus-visible + .fp-switch-track { box-shadow: var(--fp-focus); }
  .fp-switch input:checked ~ .fp-switch-label { color: var(--fp-fg); }
  .fp-switch-count { color: var(--fp-fg-faint); margin-left: 2px; }
  .fp-switch-count:empty { display: none; }
  .fp-sidebar-list { flex: 1; overflow-y: auto; padding: 6px 8px 88px; }
  .fp-sidebar-empty {
    padding: 40px 24px; text-align: center; color: var(--fp-fg-muted);
    font: 400 13px var(--fp-font);
  }

  .fp-item {
    display: flex; gap: 12px; padding: 10px 12px;
    border-radius: var(--fp-radius-sm);
    cursor: pointer; position: relative;
    transition: background 120ms ease;
  }
  .fp-item:hover { background: var(--sds-color-background-default-default-hover, #F5F5F5); }
  .fp-item.is-active { background: var(--fp-well); }
  .fp-item.is-closed .fp-item-num { background: transparent; color: var(--fp-fg-faint); box-shadow: inset 0 0 0 1px var(--fp-border); }
  .fp-item.is-closed .fp-item-text { color: var(--fp-fg-muted); text-decoration: line-through; text-decoration-color: var(--fp-border); }
  /* Same shape and colour as the page pin it refers to, so the list and
     the markers read as one set. */
  .fp-item-num {
    width: 20px; height: 20px; border-radius: var(--fp-radius-pill);
    background: var(--fp-hl); color: var(--fp-hl-fg);
    font: 600 10px var(--fp-mono);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; margin-top: 1px;
  }
  .fp-item.is-active .fp-item-num { box-shadow: 0 0 0 2px var(--fp-surface), 0 0 0 3px var(--fp-fg); }
  .fp-item-author { color: var(--fp-fg); font-weight: 500; }
  .fp-item-meta time { white-space: nowrap; }
  .fp-item-body { flex: 1; min-width: 0; }
  .fp-item-text {
    font: 450 13px/1.4 var(--fp-font); color: var(--fp-fg);
    overflow: hidden; text-overflow: ellipsis; display: -webkit-box;
    -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    word-break: break-word;
  }
  .fp-item-meta {
    margin-top: 4px; font: 400 11px var(--fp-font); color: var(--fp-fg-muted);
    display: flex; gap: 6px; align-items: center;
  }
  .fp-item-tag {
    display: inline-block; padding: 1px 6px; border-radius: 4px;
    background: var(--fp-hl); color: var(--fp-hl-fg); font: 500 10px/1.5 var(--fp-font);
  }
  .fp-item-actions { display: none; gap: 2px; align-items: center; }
  .fp-item:hover .fp-item-actions { display: flex; }
  .fp-item-actions button {
    appearance: none; border: none; background: transparent;
    width: 24px; height: 24px; border-radius: var(--fp-radius-sm);
    color: var(--fp-fg-muted); cursor: pointer;
    display: inline-flex; align-items: center; justify-content: center;
  }
  .fp-item-actions button:hover { background: var(--fp-well-hover); color: var(--fp-fg); }
  .fp-item-actions svg { width: 13px; height: 13px; }

  /* ---------- Hover highlight while picking ---------- */
  /* Outline only — invariant: hover-highlight-is-outline-only-no-fill. */
  .fp-highlight {
    position: fixed; pointer-events: none;
    border: 2px solid var(--fp-hl);
    background: transparent;
    border-radius: 4px;
    transition: all 60ms ease;
  }

  /* ---------- Cursor mode-indicator badge ---------- */
  .fp-cursor-badge {
    position: fixed; z-index: 6;
    width: 20px; height: 20px; border-radius: var(--fp-radius-pill);
    background: var(--fp-hl); color: var(--fp-hl-fg);
    box-shadow: 0 0 0 1.5px var(--fp-surface), 0 2px 6px rgba(20,20,20,0.20);
    display: flex; align-items: center; justify-content: center;
    pointer-events: none;
    transition: opacity 120ms ease;
  }
  .fp-cursor-badge[hidden] { display: none; }
  .fp-cursor-badge svg { width: 12px; height: 12px; display: block; }

  /* ---------- Spotlight overlay ---------- */
  /* The 9999px box-shadow + 45% black is load-bearing; kept verbatim. */
  .fp-spotlight {
    position: fixed; pointer-events: none;
    border-radius: 4px;
    box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.45);
    transition: opacity 160ms ease;
  }
  .fp-spotlight[hidden] { display: none; }

  /* ---------- Pin marker ---------- */
  .fp-pin {
    position: fixed;
    width: 24px; height: 24px; border-radius: var(--fp-radius-pill);
    background: var(--fp-hl); color: var(--fp-hl-fg);
    font: 600 11px var(--fp-mono);
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 0 0 1.5px var(--fp-surface), 0 2px 8px rgba(0,0,0,0.22);
    cursor: pointer;
    transform: translate(-50%, -50%);
    transition: transform 120ms ease, box-shadow 120ms ease;
    border: none;
  }
  .fp-pin:hover { transform: translate(-50%, -50%) scale(1.1); }
  .fp-pin.is-closed { background: var(--fp-surface); color: var(--fp-fg-muted); box-shadow: 0 0 0 1px var(--fp-border), 0 2px 8px rgba(20,20,20,0.14); }
  .fp-pin.is-active { box-shadow: 0 0 0 1.5px var(--fp-surface), 0 0 0 3px var(--fp-fg), 0 2px 8px rgba(20,20,20,0.22); }

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
    padding: 10px 10px 10px 14px;
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
    width: 28px; height: 28px; border-radius: var(--fp-radius-sm);
    color: var(--fp-fg-muted); cursor: pointer;
    display: inline-flex; align-items: center; justify-content: center;
    transition: background 120ms ease, color 120ms ease;
  }
  .fp-icon-btn:hover { background: var(--sds-color-background-default-default-hover, #F4F5F6); color: var(--fp-fg); }
  .fp-icon-btn svg { width: 14px; height: 14px; }

  .fp-panel-body { padding: 12px 14px 14px; }
  .fp-input-row { position: relative; }
  /* Inputs are grey wells like the answered-step rows above them; focus
     lifts to white with an ink hairline. Single line = 40px, so the 28px
     submit button sits centred at 6px from each edge. */
  .fp-input-row textarea, .fp-edit-field textarea {
    display: block; width: 100%; resize: none; min-height: 40px; max-height: 200px;
    padding: 9px 48px 9px 12px;
    border: 1px solid var(--fp-border);
    border-radius: var(--fp-radius-sm);
    font: 400 13px/20px var(--fp-font); color: var(--fp-fg);
    background: var(--fp-surface);
    transition: background 120ms ease, border-color 120ms ease;
  }
  .fp-input-row textarea::placeholder, .fp-edit-field textarea::placeholder { color: var(--fp-fg-faint); }
  .fp-input-row textarea:hover, .fp-edit-field textarea:hover { border-color: rgba(0,0,0,0.24); }
  .fp-input-row textarea:focus, .fp-edit-field textarea:focus {
    outline: none; background: var(--fp-surface); border-color: var(--fp-fg-muted); box-shadow: var(--fp-focus);
  }
  /* Submit: 40×28 rounded rectangle (invariant), radius via SDS radius-200. */
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
  .fp-submit:disabled { background: var(--fp-well-hover); color: var(--fp-fg-faint); cursor: not-allowed; }
  .fp-submit svg { width: 14px; height: 14px; display: block; }

  .fp-history { display: flex; flex-direction: column; gap: 6px; }
  .fp-history:not(:empty) { margin-bottom: 6px; }
  .fp-history-item {
    padding: 9px 12px;
    border: 1px solid transparent;
    border-radius: var(--fp-radius-sm);
    background: var(--fp-well);
    cursor: text;
    transition: background 120ms ease, border-color 120ms ease;
  }
  .fp-history-item:hover { background: var(--fp-well-hover); }
  .fp-history-item:focus-within { background: var(--fp-surface); border-color: var(--fp-fg-muted); box-shadow: var(--fp-focus); }
  .fp-history-label { font: 500 11px var(--fp-font); color: var(--fp-fg-muted); margin-bottom: 2px; }
  .fp-history-value {
    font: 400 13px/20px var(--fp-font); color: var(--fp-fg);
    white-space: pre-wrap; word-break: break-word;
    outline: none;
  }
  .fp-history-value[contenteditable="true"]:empty::before { content: attr(data-placeholder); color: var(--fp-fg-faint); }

  .fp-top-actions {
    display: flex; align-items: center; gap: 2px;
    padding: 8px 8px 0;
    justify-content: flex-end;
  }
  .fp-top-actions .fp-icon-btn { width: 30px; height: 30px; }
  .fp-top-actions .fp-icon-btn svg { width: 15px; height: 15px; }
  .fp-top-actions .fp-status-select { margin-right: auto; margin-left: 6px; }

  .fp-edit-actions {
    display: flex; align-items: center; gap: 6px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--fp-border-soft);
    justify-content: flex-end;
  }
  .fp-edit-form { display: flex; flex-direction: column; gap: 12px; }
  .fp-edit-field { display: flex; flex-direction: column; gap: 5px; cursor: text; }
  .fp-edit-label { font: 500 11px var(--fp-font); color: var(--fp-fg-muted); cursor: pointer; user-select: none; }
  .fp-edit-field textarea { resize: vertical; min-height: 48px; padding-right: 12px; }
  .fp-edit-checkbox {
    display: flex; align-items: center; gap: 8px;
    cursor: pointer;
    font: 400 13px var(--fp-font); color: var(--fp-fg);
    padding: 2px 0;
  }
  .fp-edit-checkbox input { accent-color: var(--fp-fg); cursor: pointer; }
  .fp-btn-text {
    appearance: none; border: 1px solid var(--fp-border);
    background: var(--fp-surface); color: var(--fp-fg);
    height: 30px; padding: 0 12px; border-radius: var(--fp-radius-sm);
    font: 500 12px var(--fp-font); cursor: pointer;
    transition: background 120ms ease, border-color 120ms ease;
  }
  .fp-btn-text:hover { background: var(--sds-color-background-default-default-hover, #F4F5F6); }
  .fp-btn-text:disabled { opacity: 0.5; cursor: not-allowed; }
  .fp-btn-text--primary { background: var(--fp-fg); color: var(--fp-accent-fg); border-color: var(--fp-fg); }
  .fp-btn-text--primary:hover { background: var(--sds-color-background-brand-hover, #2a2a2a); }

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
  .fp-checkbox:hover { background: var(--fp-well); }
  .fp-checkbox input { accent-color: var(--fp-fg); }
  .fp-checkbox.is-on { background: var(--fp-hl); color: var(--fp-hl-fg); border-color: transparent; }

  .fp-chip {
    appearance: none; border: 1px solid var(--fp-border);
    background: transparent; color: var(--fp-fg-muted);
    height: 26px; padding: 0 10px 0 5px;
    border-radius: var(--fp-radius-pill);
    font: 500 12px var(--fp-font); cursor: pointer;
    display: inline-flex; align-items: center; gap: 6px;
    transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
  }
  .fp-chip:hover { background: var(--sds-color-background-default-default-hover, #F4F5F6); color: var(--fp-fg); }
  .fp-chip-mark {
    width: 16px; height: 16px; border-radius: 999px;
    border: 1.5px solid var(--fp-border);
    display: inline-flex; align-items: center; justify-content: center;
    color: transparent;
    transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
  }
  .fp-chip-mark svg { width: 10px; height: 10px; }
  .fp-chip.is-on { background: var(--fp-hl); color: var(--fp-hl-fg); border-color: transparent; }
  .fp-chip.is-on .fp-chip-mark { background: var(--fp-fg); border-color: var(--fp-fg); color: var(--fp-hl); }
  .fp-chip:disabled { cursor: default; }

  .fp-scope, .fp-clarify { display: flex; flex-direction: column; gap: 10px; }
  .fp-scope[hidden], .fp-clarify[hidden] { display: none; }
  .fp-thinking {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 2px;
    color: var(--fp-fg-muted);
    font: 500 12px var(--fp-font);
  }
  .fp-thinking[hidden] { display: none; }
  .fp-spinner {
    width: 14px; height: 14px;
    border: 1.5px solid var(--fp-border);
    border-top-color: var(--fp-fg);
    border-radius: 999px;
    animation: fp-spin 700ms linear infinite;
  }
  @keyframes fp-spin { to { transform: rotate(360deg); } }
  .fp-scope-q { font: 500 13px/1.4 var(--fp-font); color: var(--fp-fg); }
  .fp-scope-choices { display: flex; flex-direction: column; gap: 6px; }
  .fp-scope-choices--row { flex-direction: row; gap: 6px; }
  .fp-scope-choices--row .fp-scope-btn { flex: 1; text-align: center; }
  .fp-scope-btn {
    appearance: none; border: 1px solid var(--fp-border);
    background: var(--fp-surface); color: var(--fp-fg);
    height: 36px; padding: 0 12px; border-radius: var(--fp-radius-sm);
    font: 500 13px var(--fp-font); cursor: pointer;
    text-align: left;
    transition: background 120ms ease, border-color 120ms ease;
  }
  .fp-scope-btn:hover { background: var(--sds-color-background-default-default-hover, #F4F5F6); border-color: var(--fp-fg); }
  .fp-scope-btn:focus-visible { outline: none; border-color: var(--fp-fg); box-shadow: var(--fp-focus); }
  .fp-scope-btn.is-on { background: var(--fp-hl); border-color: transparent; color: var(--fp-hl-fg); }
  .fp-scope-btn:disabled { opacity: 0.5; cursor: default; }
  .fp-step-label { font: 500 11px var(--fp-font); color: var(--fp-fg-muted); margin-bottom: 6px; }
  .fp-error {
    margin-top: 8px;
    padding: 6px 10px;
    background: var(--sds-color-background-danger-tertiary, #FCEBE9);
    color: var(--sds-color-text-danger-default, #8A1F12);
    border-radius: var(--fp-radius-sm); font: 400 12px var(--fp-font);
  }

  /* ---------- Thread view ---------- */
  .fp-thread { display: flex; flex-direction: column; gap: 12px; padding: 14px; max-height: 360px; overflow-y: auto; }
  .fp-msg { padding: 2px 0 2px 12px; border-left: 2px solid var(--fp-border); }
  .fp-msg.is-designer { border-left-color: var(--fp-fg); }
  .fp-msg-meta { font: 500 11px var(--fp-font); color: var(--fp-fg-muted); display: flex; gap: 6px; margin-bottom: 3px; }
  .fp-msg-body { font: 400 13px/1.45 var(--fp-font); color: var(--fp-fg); white-space: pre-wrap; word-break: break-word; }
  .fp-msg-extra { margin-top: 4px; font: 400 12px var(--fp-font); color: var(--fp-fg-muted); }
  .fp-msg-extra strong { color: var(--fp-fg); font-weight: 500; }

  @media (prefers-reduced-motion: reduce) {
    .fp-shake { animation: none; }
    .fp-spinner { animation-duration: 0s; }
    .fp-pin, .fp-highlight, .fp-toggle button, .fp-sidebar, .fp-sidebar-tab,
    .fp-cursor-badge, .fp-spotlight, .fp-submit, .fp-btn-text,
    .fp-scope-btn, .fp-chip, .fp-chip-mark, .fp-item, .fp-icon-btn { transition: none; }
  }
`;
