/**
 * feedback-pin widget entry (v2).
 *
 * Install:
 *   <script src="https://cdn.example.com/feedback-pin.js"
 *           data-project-token="proj_xxx"
 *           data-api="https://api.example.com"
 *           data-default-mode="comment"></script>
 */

import { FeedbackPinApi } from "./api";
import { WidgetUI } from "./ui";
import { getUid } from "./uid";

interface InitOptions {
  token: string;
  api?: string;
  pageUrl?: string;
  defaultMode?: "comment" | "browse";
}

let started = false;
let ui: WidgetUI | null = null;

async function init(opts: InitOptions) {
  if (started) return;
  if (!opts.token) { console.warn("[feedback-pin] missing token"); return; }
  started = true;

  const uid = getUid();
  const api = new FeedbackPinApi(opts.api || "", opts.token, uid);
  const pageUrl = opts.pageUrl || normalisedPageUrl();

  await whenBodyReady();
  // Auto-headless when running inside an iframe (likely the review wrapper).
  const inIframe = (() => { try { return window.self !== window.top; } catch { return true; } })();
  ui = new WidgetUI({ api, uid, pageUrl, defaultMode: opts.defaultMode || "comment", headless: inIframe });

  try {
    const existing = await api.listComments(pageUrl, "all");
    ui.loadComments(existing);
  } catch (e) {
    console.warn("[feedback-pin] failed to load comments:", (e as Error).message);
  }

  // postMessage handshake for review-wrapper detection.
  // Wrapper sends { type: "fp:wrapper-hello" }; we respond with { type: "fp:widget-ready" }.
  window.addEventListener("message", (e) => {
    if (!e.data || typeof e.data !== "object") return;
    if (e.data.type === "fp:wrapper-hello") {
      try { e.source && (e.source as Window).postMessage({ type: "fp:widget-ready", uid, pageUrl }, e.origin || "*"); } catch {}
    }
  });
  // Announce presence to a parent if there is one.
  try { if (window.parent && window.parent !== window) window.parent.postMessage({ type: "fp:widget-ready", uid, pageUrl }, "*"); } catch {}
}

function normalisedPageUrl(): string {
  const u = new URL(window.location.href);
  u.hash = "";
  return u.toString();
}

function whenBodyReady(): Promise<void> {
  if (document.body) return Promise.resolve();
  return new Promise(resolve => {
    document.addEventListener("DOMContentLoaded", () => resolve(), { once: true });
  });
}

function autoInit() {
  const script = (document.currentScript as HTMLScriptElement | null)
    ?? (document.querySelector('script[data-project-token]') as HTMLScriptElement | null);
  if (!script) return;
  const token = script.getAttribute("data-project-token");
  const api = script.getAttribute("data-api") || "";
  const defaultMode = (script.getAttribute("data-default-mode") as "comment" | "browse" | null) || undefined;
  if (token) init({ token, api, defaultMode });
}

const exported = { init };
(globalThis as any).FeedbackPin = exported;
export default exported;

autoInit();
