/**
 * Review wrapper. Loads any URL inside an iframe with viewport switcher,
 * mode toggle, share link, and a comments sidebar.
 *
 * Extracted verbatim from the previous monolith (dashboard/src/index.ts:600).
 * The runtime React + behaviour are unchanged. Styles in the inline CSS
 * block have been migrated to SDS tokens (var(--sds-color-*),
 * var(--sds-radius-*) etc.) with hex fallbacks; the wrapper continues to
 * load React from esm.sh because the SPA build does NOT cover /review
 * (per Stage 3 plan amendment). This is the one remaining CDN dependency
 * in the dashboard surface.
 *
 * Wrapper invariants preserved (see manifest.yaml):
 *   - toolbar-button-widths-stable-across-state-toggles  (.btn-toolbar
 *     min-width: 180px retained as a raw layout value)
 *   - viewport-segment-rendered-in-right-cluster-after-spacer
 *   - count-badge-reflects-open-comments
 *   - sidebar-overlays-canvas-without-reflowing-iframe
 *   - desktop-iframe-fills-canvas
 *   - iframe-renders-at-width-w-px-when-w-param-is-set
 *   - width-clamped-to-320-to-2560-on-input-and-on-read
 *   - legacy-viewport-aliases-desktop-tablet-mobile-still-resolve-correctly
 *
 * URL params:
 *   ?url=...        target URL to load in the iframe (required)
 *   ?token=...      project token (designer mode, RW)
 *   ?share=...      share token (public mode, RO)
 *   ?w=...          frame width in px (320..2560)
 *   ?h=...          frame height in px (240..4096)
 *   ?viewport=...   legacy: desktop|tablet|mobile (only used when ?w= absent)
 *   ?open=...       comment id to open
 *
 * Postmessage protocol with the iframe's feedback-pin widget:
 *   parent -> iframe: { type: "fp:wrapper-hello" }
 *   iframe -> parent: { type: "fp:widget-ready", uid, pageUrl }
 *   parent -> iframe: { type: "fp:set-mode", mode: "comment" | "browse" }
 */
export function reviewHtml(apiUrl: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Review — feedback-pin</title>
<style>
  /* Token aliases. Resolves to vendored SDS tokens when the dashboard's
     theme block is present; falls back to the original hex palette so
     /review stays self-contained (it doesn't link the dashboard's CSS). */
  :root {
    color-scheme: light;
    --bg: var(--sds-color-background-default-secondary, #fafafa);
    --surface: var(--sds-color-background-default-default, #fff);
    --fg: var(--sds-color-text-default-default, #171717);
    --muted: var(--sds-color-text-default-secondary, #5f5f5f);
    --border: var(--sds-color-border-default-default, #ebebeb);
    --soft: var(--sds-color-border-default-secondary, rgba(0,0,0,0.06));
    --hl: var(--sds-color-background-info-default, var(--sds-color-background-brand-default, #0068d6));
    --hl-soft: var(--sds-color-background-brand-tertiary, rgba(0,104,214,0.18));
    --shadow: var(--sds-effect-shadow-300, 0 0 0 1px rgba(0,0,0,0.04), 0 4px 8px -4px rgba(0,0,0,0.06), 0 12px 24px -8px rgba(0,0,0,0.10));
    --radius: var(--sds-size-radius-300, 12px);
    --radius-sm: var(--sds-size-radius-200, 6px);
    --pill: 999px;
    --font: var(--sds-font-family-base, "Geist", "Geist Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
  }
  *, *::before, *::after { box-sizing: border-box; }
  html, body, #root { margin: 0; padding: 0; height: 100%; background: var(--bg); color: var(--fg); font: 14px/1.4 var(--font); }
  button { font-family: inherit; }
  .layout { display: grid; grid-template-rows: 56px 1fr; height: 100%; }
  .toolbar {
    display: flex; align-items: center; gap: 12px;
    padding: 0 16px;
    background: var(--surface); border-bottom: 1px solid var(--border);
    box-shadow: 0 1px 0 var(--soft);
  }
  .brand { font-weight: 600; font-size: 14px; }
  .url { font: 400 12px var(--font); color: var(--muted); flex: 1; max-width: 460px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .seg {
    display: inline-flex; padding: 3px;
    background: var(--sds-color-background-default-secondary, #f2f2f2); border-radius: 8px; border: 1px solid var(--border);
  }
  .seg button {
    appearance: none; border: none; background: transparent;
    height: 28px; padding: 0 10px; border-radius: 6px;
    font: 500 12px var(--font); color: var(--muted); cursor: pointer;
    display: inline-flex; align-items: center; gap: 6px;
  }
  .seg button.is-active { background: var(--surface); color: var(--fg); box-shadow: 0 0 0 1px var(--border), 0 1px 2px rgba(0,0,0,0.06); }
  .seg svg { width: 14px; height: 14px; }
  /* Numeric width input. Tight, right-aligned digits; "px" suffix is decorative
     text NOT inside the input (so it doesn't compete for caret space). */
  .vp-width { position: relative; display: inline-flex; align-items: center; gap: 4px; }
  .vp-width-input {
    width: 70px; height: 30px;
    padding: 0 6px; text-align: right;
    border: 1px solid var(--border); border-radius: var(--radius-sm);
    background: var(--surface); color: var(--fg);
    font: 500 12px var(--font);
    -moz-appearance: textfield;
  }
  .vp-width-input::-webkit-outer-spin-button,
  .vp-width-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
  .vp-width-input:focus { outline: none; border-color: var(--fg); box-shadow: 0 0 0 3px var(--hl-soft); }
  .vp-width-input[aria-invalid="true"] { border-color: var(--sds-color-border-danger-default, #c0392b); }
  .vp-width-suffix { font: 500 12px var(--font); color: var(--muted); }
  /* Inline error sits below the input so it's directly actionable in context. */
  .vp-width-err {
    position: absolute; top: 100%; right: 0;
    margin-top: 4px;
    padding: 4px 8px;
    background: var(--sds-color-background-danger-tertiary, #fdecea);
    color: var(--sds-color-text-danger-default, #8a1f12);
    border-radius: var(--radius-sm);
    font: 400 11px var(--font);
    white-space: nowrap;
    z-index: 3;
  }
  /* Preset select — pill shape to match the segmented control rhythm. */
  .vp-preset {
    appearance: none; -webkit-appearance: none;
    height: 30px; padding: 0 24px 0 10px;
    border: 1px solid var(--border); border-radius: var(--pill);
    background: var(--surface);
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path d='M1 1l4 4 4-4' fill='none' stroke='%236b6b6b' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/></svg>");
    background-repeat: no-repeat; background-position: right 8px center;
    font: 500 12px var(--font); color: var(--fg);
    cursor: pointer; outline: none;
    max-width: 180px;
  }
  .vp-preset:focus { border-color: var(--fg); box-shadow: 0 0 0 3px var(--hl-soft); }
  /* Tight-cluster mode: hide decorative "px" suffix, narrow the preset select. */
  @media (max-width: 1100px) {
    .vp-width-suffix { display: none; }
    .vp-preset { max-width: 130px; padding-right: 22px; }
  }
  .spacer { flex: 1; }
  .btn {
    height: 34px; padding: 0 14px; border-radius: var(--pill);
    border: 1px solid var(--border); background: var(--surface);
    font: 500 12px var(--font); color: var(--fg); cursor: pointer;
    display: inline-flex; align-items: center; gap: 6px;
  }
  .btn:hover { background: var(--sds-color-background-default-secondary, #f5f4ef); }
  .btn-primary { background: var(--fg); color: var(--surface); border-color: var(--fg); }
  .btn-primary:hover { background: var(--sds-color-background-brand-hover, #2a2a2a); }
  /* Toolbar buttons reserve a stable footprint so label changes
     ("Hide comments" → "Show comments", "Share" → "Copied!") and the count-
     badge digit count don't reflow neighbouring controls. The 180px raw
     value is intentionally NOT a token — it's a layout commitment that
     comfortably fits "Show comments" + a 1-2 digit count badge with
     padding. Larger counts grow consistently across both label states. */
  .btn-toolbar { min-width: 180px; justify-content: center; }
  .btn .count {
    background: var(--hl); color: var(--sds-color-text-brand-on-brand, #fff); border-radius: var(--pill);
    padding: 1px 7px; font-weight: 700; font-size: 11px; margin-left: 2px;
    min-width: 22px; text-align: center;
  }
  /* Stage is always single-column. The sidebar overlays the canvas so the
     iframe never reflows on toggle — comment modals inside the iframe stay
     anchored to whichever element they were opened on. */
  .stage {
    display: grid; grid-template-columns: 1fr; height: 100%;
    overflow: hidden; position: relative;
  }
  .stage-canvas {
    position: relative;
    display: flex; align-items: center; justify-content: center;
    padding: 16px; overflow: auto; background: var(--sds-color-background-default-secondary, #f0efeb);
    min-height: 0;
  }
  .frame-wrap {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); box-shadow: var(--shadow);
    overflow: hidden;
    display: flex;
  }
  /* Smooth resize between presets / typed widths. Wrapped in
     prefers-reduced-motion: no-preference so reduce-motion users don't
     see the animation; we don't need a separate reduce override. */
  @media (prefers-reduced-motion: no-preference) {
    .frame-wrap { transition: width 180ms cubic-bezier(.2,.8,.2,1), height 180ms cubic-bezier(.2,.8,.2,1); }
  }
  /* Desktop: pin to canvas edges so it always fills, regardless of flex centering. */
  .frame-wrap.is-desktop {
    position: absolute; inset: 16px;
    width: auto !important; height: auto !important;
  }
  .frame-wrap iframe { display: block; flex: 1; width: 100%; height: 100%; border: 0; }

  .sidebar {
    position: absolute; top: 0; right: 0; bottom: 0;
    width: 360px; max-width: 100%;
    background: var(--surface); border-left: 1px solid var(--border);
    display: flex; flex-direction: column; overflow: hidden;
    z-index: 2;
    box-shadow: -8px 0 24px rgba(0,0,0,0.04);
    transform: translateX(0);
    transition: transform 220ms cubic-bezier(.2,.8,.2,1);
  }
  .sidebar.is-hidden {
    transform: translateX(100%);
    pointer-events: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .sidebar { transition: none; }
  }
  .sidebar-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 16px; border-bottom: 1px solid var(--soft);
  }
  .sidebar-head h3 { margin: 0; font: 600 14px var(--font); }
  .sidebar-controls {
    display: flex; gap: 8px; align-items: center;
    padding: 10px 14px; border-bottom: 1px solid var(--soft);
  }
  .sidebar-controls .search {
    flex: 1; min-width: 0;
    height: 30px; padding: 0 10px;
    border: 1px solid var(--border); border-radius: var(--pill);
    background: var(--surface);
    font: 400 12px var(--font); color: var(--fg);
    outline: none;
  }
  .sidebar-controls .search:focus { border-color: var(--fg); box-shadow: 0 0 0 3px var(--hl-soft); }
  .sidebar-controls .sort {
    appearance: none; -webkit-appearance: none;
    height: 30px; padding: 0 24px 0 10px;
    border: 1px solid var(--border); border-radius: var(--pill);
    background: var(--surface);
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path d='M1 1l4 4 4-4' fill='none' stroke='%236b6b6b' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/></svg>");
    background-repeat: no-repeat; background-position: right 8px center;
    font: 500 12px var(--font); color: var(--fg);
    cursor: pointer; outline: none;
  }
  .sidebar-controls .sort:focus { border-color: var(--fg); box-shadow: 0 0 0 3px var(--hl-soft); }
  .visually-hidden { position: absolute !important; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }

  .tabs { display: flex; gap: 4px; padding: 10px 14px; border-bottom: 1px solid var(--soft); }
  .tabs button { appearance: none; background: transparent; border: 1px solid transparent; font: 500 12px var(--font); color: var(--muted); padding: 6px 10px; border-radius: var(--pill); cursor: pointer; }
  .tabs button.is-active { background: var(--sds-color-background-default-secondary, #f0efeb); color: var(--fg); border-color: var(--soft); }
  .list { flex: 1; overflow-y: auto; padding: 8px; }
  .empty { padding: 28px 16px; color: var(--muted); text-align: center; font-size: 13px; }
  .item { display: flex; gap: 10px; padding: 12px; border-radius: var(--radius-sm); cursor: pointer; }
  .item:hover { background: var(--sds-color-background-default-secondary, #f5f4ef); }
  .item.is-active { background: var(--hl-soft); }
  .item .num { width: 24px; height: 24px; border-radius: var(--pill); background: var(--fg); color: var(--surface); font: 600 11px var(--font); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .item.is-closed .num { background: var(--sds-color-background-neutral-secondary, #b5b5b5); color: var(--surface); }
  /* Status pill — small dot in row meta, colour-coded per status.
     Colours mirror widget/src/tokens.ts; the wrapper inlines them so it
     doesn't depend on the dashboard's CSS bundle. */
  .status-pill { display: inline-block; width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .status-open { background: var(--sds-color-background-info-default, var(--sds-color-background-brand-default, #2563EB)); }
  .status-in-progress { background: var(--sds-color-background-warning-default, #D97706); }
  .status-wont-fix { background: var(--sds-color-background-neutral-tertiary, #6B7280); }
  .status-resolved { background: var(--sds-color-background-positive-default, #14ae5c); }
  .item .text { font: 500 13px var(--font); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word; }
  .item .meta { margin-top: 4px; font: 400 11px var(--font); color: var(--muted); display: flex; gap: 6px; }
  .tag { display: inline-block; padding: 1px 6px; border-radius: 4px; background: var(--hl); color: var(--sds-color-text-brand-on-brand, #fff); font: 600 10px var(--font); text-transform: uppercase; letter-spacing: 0.04em; }
  .err { padding: 8px 10px; background: var(--sds-color-background-danger-tertiary, #fdecea); color: var(--sds-color-text-danger-default, #8a1f12); border-radius: var(--radius-sm); font: 400 12px var(--font); margin: 12px; }

  .empty-frame {
    height: 100%; display: flex; align-items: center; justify-content: center;
    color: var(--muted); padding: 32px; text-align: center;
  }
  input.url-input { flex: 1; height: 32px; padding: 0 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-family: inherit; font-size: 13px; }
  input.url-input:focus { outline: none; border-color: var(--fg); box-shadow: 0 0 0 3px var(--hl-soft); }
</style>
</head>
<body>
<div id="root"></div>
<script>window.__API_URL__ = ${JSON.stringify(apiUrl)};</script>
<script type="module">
import React, { useEffect, useState, useCallback, useRef, useMemo } from "https://esm.sh/react@18";
import { createRoot } from "https://esm.sh/react-dom@18/client";

const API = window.__API_URL__ || "";
// If the wrangler [vars] block omits API_URL the wrapper has no API to talk to.
// Surface that as a visible banner rather than letting fetches resolve to the
// dashboard origin (which would return SPA HTML and confuse JSON parsing).
const API_MISSING = !API;

// Width/height clamp ranges. Applied on read (so share-link tampering with
// ?w=99999 is sanitised) AND on user input. NaN → null = fill canvas.
const W_MIN = 320, W_MAX = 2560;
const H_MIN = 240, H_MAX = 4096;
function clampOrNull(raw, lo, hi) {
  if (raw == null || raw === "") return null;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return null;
  return Math.min(hi, Math.max(lo, n));
}
// Legacy ?viewport= alias → {w,h}. Used only when ?w= is absent on read.
const LEGACY_VIEWPORT_ALIAS = {
  desktop: { w: null, h: null },
  tablet:  { w: 820,  h: 1180 },
  mobile:  { w: 390,  h: 844  },
};

function getQueryParams() {
  const u = new URL(location.href);
  const rawW = u.searchParams.get("w");
  const rawH = u.searchParams.get("h");
  let w = null, h = null;
  if (rawW != null) {
    w = clampOrNull(rawW, W_MIN, W_MAX);
    h = clampOrNull(rawH, H_MIN, H_MAX);
  } else {
    const vp = u.searchParams.get("viewport");
    if (vp && LEGACY_VIEWPORT_ALIAS[vp]) {
      w = LEGACY_VIEWPORT_ALIAS[vp].w;
      h = LEGACY_VIEWPORT_ALIAS[vp].h;
    }
  }
  return {
    url: u.searchParams.get("url") || "",
    token: u.searchParams.get("token") || localStorage.getItem("fp_token") || "",
    share: u.searchParams.get("share") || "",
    w, h,
    open: u.searchParams.get("open") || "",
  };
}

function setUrlParams(patch) {
  const u = new URL(location.href);
  for (const [k, v] of Object.entries(patch)) {
    if (v == null || v === "") u.searchParams.delete(k);
    else u.searchParams.set(k, v);
  }
  history.replaceState(null, "", u.toString());
}

function commitViewport({ w, h }) {
  if (w == null) {
    setUrlParams({ w: null, h: null, viewport: "desktop" });
  } else {
    setUrlParams({ w: String(w), h: h == null ? null : String(h), viewport: null });
  }
}
function applyViewportToUrl(u, { w, h }) {
  if (w == null) {
    u.searchParams.delete("w");
    u.searchParams.delete("h");
    u.searchParams.set("viewport", "desktop");
  } else {
    u.searchParams.set("w", String(w));
    if (h == null) u.searchParams.delete("h");
    else u.searchParams.set("h", String(h));
    u.searchParams.delete("viewport");
  }
}

function api(path, opts = {}, q = getQueryParams()) {
  if (API_MISSING) {
    return Promise.reject(new Error("API URL not configured. Set API_URL in wrangler [vars]."));
  }
  const headers = { ...(opts.headers || {}) };
  if (q.token) headers.authorization = "Bearer " + q.token;
  let url = API + path;
  if (q.share && !q.token) {
    url += (url.includes("?") ? "&" : "?") + "share=" + encodeURIComponent(q.share);
  }
  return fetch(url, { ...opts, headers }).then(async r => {
    if (!r.ok) { let m = "Request failed"; try { const j = await r.json(); m = j.error || m; } catch {} throw new Error(m); }
    if (r.headers.get("content-type")?.includes("json")) return r.json();
    return r;
  });
}

const PRESET_GROUPS = [
  { label: "Mobile", items: [
    { label: "iPhone SE",         w: 375, h: 667 },
    { label: "iPhone 14",         w: 390, h: 844 },
    { label: "iPhone 14 Pro Max", w: 430, h: 932 },
    { label: "Pixel 7",           w: 412, h: 915 },
  ]},
  { label: "Tablet", items: [
    { label: "iPad mini",     w: 768, h: 1024 },
    { label: "iPad 10\\"",    w: 820, h: 1180 },
    { label: "iPad Pro 11\\"",w: 834, h: 1194 },
  ]},
  { label: "Desktop", items: [
    { label: "1280", w: 1280, h: null },
    { label: "1440", w: 1440, h: null },
    { label: "1920", w: 1920, h: null },
  ]},
];
const DEFAULT_MOBILE = { w: 390, h: 844 };
const MOBILE_WIDTH_THRESHOLD = 600;
function presetValueFor(w, h) {
  if (w == null && h == null) return "__fill";
  for (const g of PRESET_GROUPS) {
    for (const it of g.items) {
      if (it.w === w && (it.h ?? null) === (h ?? null)) {
        return g.label + ":" + it.label;
      }
    }
  }
  return "__custom";
}
function lookupPreset(value) {
  if (value === "__fill") return { w: null, h: null };
  for (const g of PRESET_GROUPS) {
    for (const it of g.items) {
      if (g.label + ":" + it.label === value) return { w: it.w, h: it.h ?? null };
    }
  }
  return null;
}

function fmtTime(ts) {
  const d = (Date.now() - ts) / 1000;
  if (d < 60) return "just now";
  if (d < 3600) return Math.round(d/60) + "m";
  if (d < 86400) return Math.round(d/3600) + "h";
  return new Date(ts).toLocaleDateString();
}

function DeviceSeg({ w, h, lastMobile, onPickDesktop, onPickMobile }) {
  const isMobile = w != null && w <= MOBILE_WIDTH_THRESHOLD;
  const isDesktop = w == null;
  return React.createElement("div", { className: "seg", role: "group", "aria-label": "Device class" },
    React.createElement("button", {
      type: "button",
      className: isDesktop ? "is-active" : "",
      "aria-pressed": isDesktop ? "true" : "false",
      "aria-label": "Desktop (fill canvas)",
      title: "Desktop (fill canvas)",
      onClick: onPickDesktop,
    }, viewportIcon("desktop")),
    React.createElement("button", {
      type: "button",
      className: isMobile ? "is-active" : "",
      "aria-pressed": isMobile ? "true" : "false",
      "aria-label": "Mobile",
      title: "Mobile",
      onClick: () => onPickMobile(lastMobile || DEFAULT_MOBILE),
    }, viewportIcon("mobile"))
  );
}

function WidthInput({ w, onCommit }) {
  const [draft, setDraft] = useState(w == null ? "" : String(w));
  const [error, setError] = useState("");
  const timerRef = useRef(null);
  useEffect(() => {
    setDraft(w == null ? "" : String(w));
    setError("");
  }, [w]);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const flush = useCallback((raw) => {
    const trimmed = (raw || "").trim();
    if (trimmed === "") {
      setError("");
      onCommit({ w: null, h: null });
      return;
    }
    const n = parseInt(trimmed, 10);
    if (!Number.isFinite(n) || n < W_MIN || n > W_MAX) {
      setError("Width must be " + W_MIN + "–" + W_MAX);
      setDraft(w == null ? "" : String(w));
      return;
    }
    setError("");
    onCommit({ w: n, h: null });
  }, [w, onCommit]);

  const onChange = (e) => {
    const v = e.target.value;
    setDraft(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => flush(v), 250);
  };
  const onKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (timerRef.current) clearTimeout(timerRef.current);
      flush(e.currentTarget.value);
    }
  };
  const onBlur = (e) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    flush(e.currentTarget.value);
  };

  return React.createElement("div", { className: "vp-width" },
    React.createElement("input", {
      type: "number",
      className: "vp-width-input",
      min: W_MIN, max: W_MAX, step: 1,
      inputMode: "numeric",
      "aria-label": "Frame width in pixels",
      "aria-invalid": error ? "true" : "false",
      value: draft,
      onChange,
      onKeyDown,
      onBlur,
    }),
    React.createElement("span", { className: "vp-width-suffix", "aria-hidden": "true" }, "px"),
    error ? React.createElement("div", { className: "vp-width-err", role: "alert" }, error) : null
  );
}

function PresetSelect({ w, h, onCommit }) {
  const value = presetValueFor(w, h);
  return React.createElement("select", {
    className: "vp-preset",
    "aria-label": "Viewport preset",
    value,
    onChange: (e) => {
      const v = e.target.value;
      if (v === "__custom") return;
      const p = lookupPreset(v);
      if (p) onCommit(p);
    },
  },
    React.createElement("option", { value: "__fill" }, "Fill canvas"),
    React.createElement("option", { value: "__custom", disabled: true, hidden: true }, "Custom"),
    PRESET_GROUPS.map(g => React.createElement("optgroup", { key: g.label, label: g.label },
      g.items.map(it => React.createElement("option", {
        key: it.label,
        value: g.label + ":" + it.label,
      }, it.label + " (" + it.w + (it.h ? "×" + it.h : "") + ")"))
    ))
  );
}

function ModeSeg({ value, onChange }) {
  const items = [
    { k: "comment", label: "Comment", icon: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z' },
    { k: "browse",  label: "Browse",  icon: 'M5 3l14 9-7 1-3 7-4-17z' },
  ];
  return React.createElement("div", { className: "seg" },
    items.map(it => React.createElement("button", {
      key: it.k,
      className: value === it.k ? "is-active" : "",
      onClick: () => onChange(it.k),
      title: it.label + " (C)",
    },
      React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" },
        React.createElement("path", { d: it.icon })
      ),
      it.label
    ))
  );
}

function viewportIcon(kind) {
  const path = {
    desktop: 'M2 4h20v12H2zM8 20h8M12 16v4',
    mobile:  'M7 2h10v20H7zM12 18.5v.01',
  }[kind];
  return React.createElement("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" },
    React.createElement("path", { d: path })
  );
}

function ShareButton({ projectShare, w, h, openId }) {
  const [done, setDone] = useState(false);
  const onClick = async () => {
    if (!projectShare) { alert("This project has no share token yet."); return; }
    const u = new URL(location.href);
    u.searchParams.delete("token");
    u.searchParams.set("share", projectShare);
    applyViewportToUrl(u, { w, h });
    if (openId) u.searchParams.set("open", openId); else u.searchParams.delete("open");
    try {
      await navigator.clipboard.writeText(u.toString());
      setDone(true); setTimeout(() => setDone(false), 1600);
    } catch {}
  };
  return React.createElement("button", { className: "btn btn-toolbar", onClick, "aria-label": "Copy share link" },
    React.createElement("svg", { viewBox: "0 0 24 24", width: 14, height: 14, fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" },
      React.createElement("circle", { cx: 18, cy: 5, r: 3 }),
      React.createElement("circle", { cx: 6, cy: 12, r: 3 }),
      React.createElement("circle", { cx: 18, cy: 19, r: 3 }),
      React.createElement("line", { x1: 8.59, y1: 13.51, x2: 15.42, y2: 17.49 }),
      React.createElement("line", { x1: 15.41, y1: 6.51, x2: 8.59, y2: 10.49 })
    ),
    React.createElement("span", null, done ? "Copied!" : "Share")
  );
}

function fpReadSortPref() {
  try {
    const v = localStorage.getItem("fp_sort");
    if (v === "newest" || v === "oldest" || v === "unresolved") return v;
  } catch (e) {}
  return "newest";
}
function fpCommentMatchesQuery(c, qLower) {
  return ((c.change_text || "").toLowerCase().includes(qLower)
       || (c.why_text   || "").toLowerCase().includes(qLower)
       || (c.url        || "").toLowerCase().includes(qLower));
}
function fpSortComments(items, mode) {
  const copy = items.slice();
  if (mode === "oldest") {
    copy.sort((a, b) => a.created_at - b.created_at);
  } else if (mode === "unresolved") {
    copy.sort((a, b) => {
      const ao = (a.status === "open" || a.status === "in-progress") ? 0 : 1;
      const bo = (b.status === "open" || b.status === "in-progress") ? 0 : 1;
      if (ao !== bo) return ao - bo;
      return b.created_at - a.created_at;
    });
  } else {
    copy.sort((a, b) => b.created_at - a.created_at);
  }
  return copy;
}

const STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "in-progress", label: "In progress" },
  { value: "wont-fix", label: "Won't fix" },
  { value: "resolved", label: "Resolved" },
];
function statusLabel(s) {
  for (const o of STATUS_OPTIONS) if (o.value === s) return o.label;
  return s;
}
function StatusPill({ status }) {
  return React.createElement("span", {
    className: "status-pill status-" + status,
    "aria-label": "Status: " + statusLabel(status),
    title: statusLabel(status),
  });
}
function isClosedStatus(s) { return s === "resolved" || s === "wont-fix"; }

function Sidebar({ items, active, onPick, filter, setFilter, isPublic, query, setQuery, sort, setSort, totalForPlaceholder, allEmpty, hidden }) {
  const placeholder = "Search " + totalForPlaceholder + " comment" + (totalForPlaceholder === 1 ? "" : "s") + "…";
  const q = (query || "").trim();
  let emptyText;
  if (allEmpty) emptyText = "No comments yet.";
  else if (q && items.length === 0) emptyText = 'No comments matching "' + q + '".';
  else emptyText = "No comments " + (filter === "all" ? "yet." : "in this view.");
  return React.createElement("aside", { className: "sidebar" + (hidden ? " is-hidden" : ""), "aria-hidden": hidden ? "true" : "false" },
    React.createElement("div", { className: "sidebar-head" },
      React.createElement("h3", null, "Comments")
    ),
    React.createElement("div", { className: "sidebar-controls" },
      React.createElement("input", {
        type: "search", className: "search", value: query,
        onChange: (e) => setQuery(e.target.value),
        placeholder, "aria-label": "Search comments",
      }),
      React.createElement("label", { className: "visually-hidden", htmlFor: "fp-wrapper-sort" }, "Sort comments"),
      React.createElement("select", {
        id: "fp-wrapper-sort", className: "sort", value: sort,
        onChange: (e) => {
          const v = e.target.value;
          const next = (v === "newest" || v === "oldest" || v === "unresolved") ? v : "newest";
          setSort(next);
          try { localStorage.setItem("fp_sort", next); } catch (err) {}
        },
      },
        React.createElement("option", { value: "newest" }, "Newest"),
        React.createElement("option", { value: "oldest" }, "Oldest"),
        React.createElement("option", { value: "unresolved" }, "Unresolved first"),
      )
    ),
    React.createElement("div", { className: "tabs" },
      ["open", "resolved", "all"].map(k => React.createElement("button", { key: k, className: filter === k ? "is-active" : "", onClick: () => setFilter(k) }, k.charAt(0).toUpperCase() + k.slice(1)))
    ),
    React.createElement("div", { className: "list" },
      items.length === 0 ? React.createElement("div", { className: "empty" }, emptyText) : null,
      items.map((c, i) => React.createElement("div", {
        key: c.id,
        className: "item" + (isClosedStatus(c.status) ? " is-closed" : "") + (active === c.id ? " is-active" : ""),
        onClick: () => onPick(c.id),
      },
        React.createElement("div", { className: "num" }, i + 1),
        React.createElement("div", null,
          React.createElement("div", { className: "text" }, c.change_text),
          React.createElement("div", { className: "meta" },
            c.site_wide ? React.createElement("span", { className: "tag" }, "Site-wide") : null,
            React.createElement(StatusPill, { status: c.status }),
            React.createElement("span", null, fmtTime(c.created_at))
          )
        )
      ))
    )
  );
}

function App() {
  const [params, setParams] = useState(getQueryParams());
  const [project, setProject] = useState(null);
  const [comments, setComments] = useState([]);
  const [filter, setFilter] = useState("open");
  const [sidebar, setSidebar] = useState(true);
  const [err, setErr] = useState("");
  const [urlInput, setUrlInput] = useState(params.url || "");
  const [mode, setMode] = useState("comment");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState(fpReadSortPref);
  const iframeRef = useRef(null);
  const isPublic = !params.token && !!params.share;

  const sendToFrame = useCallback((msg) => {
    try { iframeRef.current?.contentWindow?.postMessage(msg, "*"); } catch {}
  }, []);
  const setModeAndSync = useCallback((m) => {
    setMode(m);
    sendToFrame({ type: "fp:set-mode", mode: m });
  }, [sendToFrame]);

  const setQ = (p) => { setUrlParams(p); setParams(getQueryParams()); };

  const refreshProject = useCallback(async () => {
    if (!params.token && !params.share) return;
    try {
      const p = isPublic
        ? await api("/v1/public/project")
        : await api("/v1/projects/me");
      setProject(p);
    } catch (e) { setErr(e.message); }
  }, [params.token, params.share, isPublic]);

  const refreshComments = useCallback(async () => {
    if (!params.url) return;
    try {
      const path = isPublic
        ? "/v1/public/comments?url=" + encodeURIComponent(params.url)
        : "/v1/comments?url=" + encodeURIComponent(params.url);
      const j = await api(path);
      setComments(j.comments || []);
    } catch (e) { setErr(e.message); }
  }, [params.url, isPublic]);

  useEffect(() => { refreshProject(); }, [refreshProject]);
  useEffect(() => { refreshComments(); }, [refreshComments]);

  useEffect(() => {
    const onMsg = (e) => {
      if (!e.data || typeof e.data !== "object") return;
      if (e.data.type === "fp:widget-ready") {
        if (e.data.mode) setMode(e.data.mode);
        sendToFrame({ type: "fp:set-mode", mode });
        refreshComments();
      } else if (e.data.type === "fp:mode-changed" && e.data.mode) {
        setMode(e.data.mode);
      } else if (e.data.type === "fp:count" || e.data.type === "fp:comments") {
        refreshComments();
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [sendToFrame, mode, refreshComments]);

  const onFrameLoad = useCallback(() => {
    sendToFrame({ type: "fp:wrapper-hello" });
    sendToFrame({ type: "fp:set-mode", mode });
  }, [sendToFrame, mode]);

  // Poll comments every 3s while iframe is loaded (cheap, local-only).
  useEffect(() => {
    if (!params.url) return;
    const t = setInterval(refreshComments, 3000);
    return () => clearInterval(t);
  }, [params.url, refreshComments]);

  const tabFilteredComments = useMemo(() => comments.filter(c => {
    if (filter === "all") return true;
    if (filter === "open") return c.status === "open" || c.status === "in-progress";
    return c.status === "resolved" || c.status === "wont-fix";
  }), [comments, filter]);
  const filteredComments = useMemo(() => {
    const q = (query || "").trim().toLowerCase();
    const searched = q ? tabFilteredComments.filter(c => fpCommentMatchesQuery(c, q)) : tabFilteredComments;
    return fpSortComments(searched, sort);
  }, [tabFilteredComments, query, sort]);
  const openCount = comments.filter(c => c.status === "open" || c.status === "in-progress").length;

  const frameW = params.w;
  const frameH = params.h;
  const isFill = frameW == null;
  const wrapStyle = isFill
    ? { width: "100%", height: "100%" }
    : { width: frameW + "px", height: frameH == null ? "100%" : frameH + "px" };

  const lastMobileRef = useRef(
    frameW != null && frameW <= MOBILE_WIDTH_THRESHOLD
      ? { w: frameW, h: frameH }
      : null
  );
  useEffect(() => {
    if (frameW != null && frameW <= MOBILE_WIDTH_THRESHOLD) {
      lastMobileRef.current = { w: frameW, h: frameH };
    }
  }, [frameW, frameH]);

  const onCommitViewport = useCallback((next) => {
    commitViewport(next);
    setParams(getQueryParams());
  }, []);

  const submitUrl = (e) => {
    e.preventDefault();
    if (!urlInput.trim()) return;
    setQ({ url: urlInput.trim() });
  };

  const setOpen = (id) => {
    setQ({ open: id });
    sendToFrame({ type: "fp:open-comment", id });
  };

  const emptyFrame = !params.url
    ? React.createElement("div", { className: "empty-frame" },
        React.createElement("div", null,
          React.createElement("h2", { style: { margin: 0, fontWeight: 600 } }, "Review any URL"),
          React.createElement("p", { style: { color: "var(--muted)", maxWidth: 420, margin: "8px 0 16px" } },
            "Paste the URL of a page that has the feedback-pin widget installed. Comments will appear in the sidebar as they arrive."),
          React.createElement("form", { onSubmit: submitUrl, style: { display: "flex", gap: 8, justifyContent: "center" } },
            React.createElement("input", { className: "url-input", value: urlInput, onChange: (e) => setUrlInput(e.target.value), placeholder: "https://example.com" }),
            React.createElement("button", { type: "submit", className: "btn btn-primary" }, "Load")
          )
        )
      )
    : null;

  return React.createElement("div", { className: "layout" },
    React.createElement("div", { className: "toolbar" },
      React.createElement("div", { className: "brand" }, project?.name || "feedback-pin"),
      React.createElement("div", { className: "url" }, params.url || "—"),
      React.createElement(ModeSeg, { value: mode, onChange: setModeAndSync }),
      React.createElement("div", { className: "spacer" }),
      // Viewport segment is rendered in the right cluster (after spacer).
      React.createElement(DeviceSeg, {
        w: frameW, h: frameH,
        lastMobile: lastMobileRef.current,
        onPickDesktop: () => onCommitViewport({ w: null, h: null }),
        onPickMobile: (m) => onCommitViewport({ w: m.w, h: m.h }),
      }),
      React.createElement(WidthInput, { w: frameW, onCommit: onCommitViewport }),
      React.createElement(PresetSelect, { w: frameW, h: frameH, onCommit: onCommitViewport }),
      React.createElement(ShareButton, { projectShare: project?.share_token, w: frameW, h: frameH, openId: params.open }),
      React.createElement("button", { className: "btn btn-toolbar", onClick: () => setSidebar(!sidebar), "aria-label": sidebar ? "Hide comments panel" : "Show comments panel" },
        React.createElement("span", null, sidebar ? "Hide comments" : "Show comments"),
        React.createElement("span", { className: "count" }, openCount)
      )
    ),
    React.createElement("div", { className: "stage" },
      React.createElement("div", { className: "stage-canvas" },
        params.url
          ? React.createElement("div", { className: "frame-wrap" + (isFill ? " is-desktop" : ""), style: wrapStyle },
              React.createElement("iframe", { ref: iframeRef, src: params.url, title: "host", onLoad: onFrameLoad, allow: "clipboard-read; clipboard-write" }))
          : emptyFrame
      ),
      React.createElement(Sidebar, {
        items: filteredComments,
        active: params.open,
        onPick: setOpen,
        filter, setFilter,
        isPublic,
        query, setQuery,
        sort, setSort,
        totalForPlaceholder: tabFilteredComments.length,
        allEmpty: comments.length === 0,
        hidden: !sidebar,
      })
    ),
    err ? React.createElement("div", { className: "err", style: { position: "fixed", bottom: 16, left: 16, right: 16, maxWidth: 480, margin: "0 auto" } }, err) : null
  );
}

createRoot(document.getElementById("root")).render(React.createElement(App, null));
</script>
</body>
</html>`;
}
