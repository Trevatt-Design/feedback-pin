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

  // Follow client-side navigation (React Router, Next, etc). History pushes
  // and pops don't reload the page, so re-derive the URL and swap the
  // comment set whenever it changes. Explicit pageUrl opts out.
  if (!opts.pageUrl) watchNavigation(api, () => ui);

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

function watchNavigation(api: FeedbackPinApi, getUi: () => WidgetUI | null) {
  let timer: number | undefined;
  let inFlight = 0;
  const check = () => {
    window.clearTimeout(timer);
    // Let the router commit the new DOM before anchors are resolved.
    timer = window.setTimeout(async () => {
      const u = getUi();
      if (!u) return;
      const next = normalisedPageUrl();
      if (next === u.pageUrl) return;
      const seq = ++inFlight;
      let comments: Awaited<ReturnType<FeedbackPinApi["listComments"]>> = [];
      try { comments = await api.listComments(next, "all"); }
      catch (e) { console.warn("[feedback-pin] failed to load comments:", (e as Error).message); }
      if (seq !== inFlight || normalisedPageUrl() !== next) return; // superseded
      u.setPage(next, comments);
    }, 250);
  };
  const wrap = (name: "pushState" | "replaceState") => {
    const orig = history[name];
    history[name] = function (this: History, ...args: Parameters<History["pushState"]>) {
      const r = orig.apply(this, args);
      check();
      return r;
    } as History[typeof name];
  };
  wrap("pushState");
  wrap("replaceState");
  window.addEventListener("popstate", check);
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
