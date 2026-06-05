/**
 * Widget UI — v2.
 *
 * Modes:
 *  - "comment": clicking elements creates a pin + comment. Default.
 *  - "browse":  widget out of the way; pins still clickable to open threads.
 *
 * Surfaces:
 *  - Bottom-centre segmented toggle (Comment / Browse), shows open count.
 *  - Right-edge sidebar listing all comments on this page.
 *  - Pin markers anchored to commented elements.
 *  - Comment composer panel near the picked element (two-step: "what" → "why").
 *  - Thread panel for clicked pins (replies, resolve, edit/delete own).
 *
 * Keyboard:
 *  - C toggles modes (when no input focused).
 *  - Esc closes the active panel; Esc twice within ~700ms exits Comment mode.
 *  - Cmd/Ctrl+Return submits.
 *
 * Anonymous attribution: every comment carries an x-fp-uid header.
 * Edit / delete is gated to the original anon_id.
 */

import { captureAnchor, resolveAnchor, findStyleTarget, cohortCount, isStyleAnchor } from "./anchor";
import type { AnchorData } from "./anchor";
import { FeedbackPinApi } from "./api";
import type { Comment, Reply } from "./api";
import { widgetCss } from "./styles";
import { captureMetadata, shortUid } from "./uid";

interface UIOptions {
  api: FeedbackPinApi;
  uid: string;
  pageUrl: string;
  defaultMode?: "comment" | "browse";
  /** When true, hide own toggle + sidebar (the wrapper provides them). */
  headless?: boolean;
}

type Mode = "comment" | "browse";
type Step = "change" | "why" | "clarify" | "scope";

export class WidgetUI {
  private host: HTMLElement;
  private root: ShadowRoot;
  private chrome!: HTMLElement;

  private toggleEl!: HTMLElement;
  private sidebarEl!: HTMLElement;
  private highlightEl!: HTMLElement;
  private stickyHighlightEl!: HTMLElement; // stays during compose
  // Dark "rest of page" overlay activated alongside the sticky highlight
  // when a target is selected. Single element with a 9999px box-shadow
  // spread paints everything outside its rect dark.
  private spotlightEl!: HTMLElement;
  // Floating mode-indicator badge that follows the OS cursor in Comment
  // mode, snaps to the composer panel when one opens, and fades out when
  // the comment is submitted (the resulting pin renders at the anchor).
  private cursorBadgeEl!: HTMLElement;
  private cursorStage: "follow" | "snap" | "hidden" = "hidden";
  private pins = new Map<string, HTMLButtonElement>();
  private comments = new Map<string, Comment>();
  private commentOrder: string[] = []; // stable numbering

  private mode: Mode = "browse"; // flipped to a neutral default so the constructor's setMode() actually runs side-effects
  private hoverEl: Element | null = null;
  private panel: HTMLElement | null = null;
  private activeId: string | null = null;
  private composer: {
    anchor: AnchorData;
    step: Step;
    whatText: string;
    whyText: string;
    siteWide: boolean;
    pendingRect: DOMRect | null;
    /** Number of similar elements on the page; >1 means scope step is shown. */
    cohort: number;
    styleAnchor: boolean;
    /** AI inference result, if any. Drives clarification step + scope default. */
    inference: { refined_target?: string; scope: "single" | "cohort" | "global"; confidence: number; clarification?: { question: string; options: string[] } } | null;
    /** The user's answer to the clarification question, if any. */
    clarificationAnswer: string | null;
    /** Has the user been warned (shake) about losing this composer's content? */
    dismissWarned: boolean;
    /** Timer that resets dismissWarned after no further attempt for ~4s. */
    dismissWarnTimer: number;
  } | null = null;

  private repositionRaf = 0;
  private escTimer = 0;
  private escCount = 0;

  private filter: "open" | "resolved" | "all" = "open";
  private sidebarVisible = true;
  private headless = false;
  private searchQuery = "";
  private sortMode: SortMode = readSortPref();
  // Existing-comment thread starts in "view" (read-only display); the author
  // can flip to "edit" via the pencil button. New threads always reset to
  // "view" — guarded inside openThread by comparing the incoming id to
  // this.activeId before assigning.
  private threadMode: "view" | "edit" = "view";

  constructor(private opts: UIOptions) {
    this.host = document.createElement("div");
    this.host.setAttribute("data-feedback-pin", "");
    this.host.style.all = "initial";
    this.root = this.host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = widgetCss;
    this.root.appendChild(style);
    this.chrome = document.createElement("div");
    this.chrome.className = "fp-root";
    this.root.appendChild(this.chrome);

    this.headless = !!opts.headless;
    if (!this.headless) {
      this.renderToggle();
      this.renderSidebar();
    }
    this.renderHighlights();

    document.body.appendChild(this.host);

    // postMessage protocol with a wrapping review frame.
    window.addEventListener("message", this.onParentMessage);

    // Reposition on scroll/resize.
    window.addEventListener("scroll", this.scheduleReposition, { passive: true, capture: true });
    window.addEventListener("resize", this.scheduleReposition);

    // Global keyboard.
    document.addEventListener("keydown", this.onGlobalKey, true);

    // Set initial mode (default Comment per product brief).
    const initial: Mode = opts.defaultMode || "comment";
    this.setMode(initial);
  }

  // ------------------------------------------------------------------
  // Render: bottom toggle, right sidebar, hover highlight overlay
  // ------------------------------------------------------------------

  private renderToggle() {
    const el = document.createElement("div");
    el.className = "fp-toggle";
    el.innerHTML = `
      <button data-mode="comment" class="fp-mode-comment is-active" aria-label="Comment mode (C)">
        ${commentIcon()}<span>Comment</span><span class="fp-count" data-count>0</span>
      </button>
      <button data-mode="browse" aria-label="Browse mode (C)">
        ${cursorIcon()}<span>Browse</span>
      </button>
    `;
    el.querySelectorAll("button").forEach(b => {
      b.addEventListener("click", () => {
        const m = b.getAttribute("data-mode") as Mode;
        this.setMode(m);
      });
    });
    this.toggleEl = el;
    this.chrome.appendChild(el);
  }

  private renderSidebar() {
    const el = document.createElement("aside");
    el.className = "fp-sidebar";
    el.innerHTML = `
      <div class="fp-sidebar-head">
        <h3>Comments</h3>
        <button class="fp-icon-btn" data-act="hide" title="Hide sidebar" aria-label="Hide sidebar">${closeIcon()}</button>
      </div>
      <div class="fp-sidebar-controls">
        <input type="search" class="fp-sidebar-search" data-search aria-label="Search comments" placeholder="Search comments…">
        <label class="fp-visually-hidden" for="fp-sidebar-sort-select">Sort comments</label>
        <select id="fp-sidebar-sort-select" class="fp-sidebar-sort" data-sort>
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="unresolved">Unresolved first</option>
        </select>
      </div>
      <div class="fp-sidebar-tabs" role="tablist">
        <button data-filter="open" class="is-active">Open</button>
        <button data-filter="resolved">Resolved</button>
        <button data-filter="all">All</button>
      </div>
      <div class="fp-sidebar-list" data-list></div>
    `;
    el.querySelector('[data-act="hide"]')!.addEventListener("click", () => this.toggleSidebar(false));
    el.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach(b => {
      b.addEventListener("click", () => {
        this.filter = b.getAttribute("data-filter") as "open" | "resolved" | "all";
        el.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach(x => x.classList.toggle("is-active", x === b));
        this.renderSidebarList();
      });
    });
    const searchInput = el.querySelector<HTMLInputElement>("[data-search]")!;
    searchInput.addEventListener("input", () => {
      this.searchQuery = searchInput.value;
      this.renderSidebarList();
    });
    const sortSelect = el.querySelector<HTMLSelectElement>("[data-sort]")!;
    sortSelect.value = this.sortMode;
    sortSelect.addEventListener("change", () => {
      const v = sortSelect.value;
      this.sortMode = (v === "newest" || v === "oldest" || v === "unresolved") ? v : "newest";
      try { localStorage.setItem("fp_sort", this.sortMode); } catch {}
      this.renderSidebarList();
    });
    this.sidebarEl = el;
    this.chrome.appendChild(el);
  }

  private renderHighlights() {
    // The spotlight overlay is appended FIRST so widget chrome (toggle,
    // sidebar, pins, composer) — added later — stacks visually above it.
    this.spotlightEl = document.createElement("div");
    this.spotlightEl.className = "fp-spotlight";
    this.spotlightEl.hidden = true;
    this.chrome.appendChild(this.spotlightEl);

    this.highlightEl = document.createElement("div");
    this.highlightEl.className = "fp-highlight";
    this.highlightEl.style.display = "none";
    this.chrome.appendChild(this.highlightEl);

    this.stickyHighlightEl = document.createElement("div");
    this.stickyHighlightEl.className = "fp-highlight";
    this.stickyHighlightEl.style.display = "none";
    this.stickyHighlightEl.style.transition = "none";
    this.chrome.appendChild(this.stickyHighlightEl);

    this.cursorBadgeEl = document.createElement("div");
    this.cursorBadgeEl.className = "fp-cursor-badge";
    this.cursorBadgeEl.hidden = true;
    // "+" plus sign in white. Same shape and colour as the pin so the
    // visual reads as continuous when it cross-fades into the numbered pin
    // on submit.
    this.cursorBadgeEl.innerHTML = `<svg viewBox="0 0 12 12" aria-hidden="true"><line x1="6" y1="2.5" x2="6" y2="9.5" stroke="#fff" stroke-width="2" stroke-linecap="round"/><line x1="2.5" y1="6" x2="9.5" y2="6" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>`;
    this.chrome.appendChild(this.cursorBadgeEl);
  }

  private setCursorStage(stage: "follow" | "snap" | "hidden") {
    this.cursorStage = stage;
    const el = this.cursorBadgeEl;
    if (stage === "hidden") {
      el.hidden = true;
      el.removeAttribute("data-stage");
      el.style.opacity = "1"; // reset for next use
      el.style.transition = "";
      return;
    }
    el.hidden = false;
    el.style.opacity = "1";
    el.setAttribute("data-stage", stage);
    if (stage === "snap" && this.panel) {
      // Top-left corner of the panel; the 20px badge straddles the border so
      // it reads as anchored to the composer rather than floating beside it.
      const r = this.panel.getBoundingClientRect();
      // Position transition handled by CSS; size matches Phase 1.
      el.style.transition = "left 180ms ease, top 180ms ease, opacity 180ms ease";
      el.style.left = (r.left - 10) + "px";
      el.style.top = (r.top - 10) + "px";
    }
    // For "follow" stage, position is updated on every mousemove.
    if (stage === "follow") {
      el.style.transition = "opacity 120ms ease";
    }
  }

  // ------------------------------------------------------------------
  // Mode management
  // ------------------------------------------------------------------

  private setMode(m: Mode) {
    if (m === this.mode) return;
    this.mode = m;
    this.toggleEl?.querySelectorAll<HTMLButtonElement>("button[data-mode]").forEach(b => {
      b.classList.toggle("is-active", b.getAttribute("data-mode") === m);
    });
    if (m === "comment") {
      document.addEventListener("mousemove", this.onPickMove, true);
      document.addEventListener("click", this.onPickClick, true);
      if (!this.headless) this.toggleSidebar(this.sidebarVisible);
      // Badge follows the cursor unless something is already open.
      this.setCursorStage(this.panel ? (this.composer ? "snap" : "hidden") : "follow");
    } else {
      document.removeEventListener("mousemove", this.onPickMove, true);
      document.removeEventListener("click", this.onPickClick, true);
      this.highlightEl.style.display = "none";
      this.setCursorStage("hidden");
    }
    // Notify parent (wrapper) of mode changes so the toolbar can mirror.
    this.postToParent({ type: "fp:mode-changed", mode: m });
  }

  private toggleSidebar(visible: boolean) {
    this.sidebarVisible = visible;
    this.sidebarEl?.classList.toggle("is-hidden", !visible);
  }

  // ------------------------------------------------------------------
  // postMessage with parent (review wrapper)
  // ------------------------------------------------------------------

  private postToParent(msg: any) {
    try { if (window.parent && window.parent !== window) window.parent.postMessage(msg, "*"); } catch {}
  }

  private onParentMessage = (e: MessageEvent) => {
    const d = e.data;
    if (!d || typeof d !== "object") return;
    switch (d.type) {
      case "fp:wrapper-hello":
        // Wrapper announced itself — go headless and re-render.
        this.goHeadless();
        this.postToParent({ type: "fp:widget-ready", uid: this.opts.uid, pageUrl: this.opts.pageUrl, mode: this.mode, count: this.openCount() });
        break;
      case "fp:set-mode":
        if (d.mode === "comment" || d.mode === "browse") this.setMode(d.mode);
        break;
      case "fp:open-comment":
        if (typeof d.id === "string") this.scrollToAndOpen(d.id);
        break;
      case "fp:request-state":
        this.postToParent({ type: "fp:state", mode: this.mode, count: this.openCount(), comments: Array.from(this.comments.values()) });
        break;
    }
  };

  private goHeadless() {
    if (this.headless) return;
    this.headless = true;
    this.toggleEl?.remove();
    this.sidebarEl?.remove();
    this.toggleEl = undefined as any;
    this.sidebarEl = undefined as any;
  }

  private openCount(): number {
    let n = 0;
    for (const c of this.comments.values()) if (c.status === "open" || c.status === "in-progress") n++;
    return n;
  }

  private scrollToAndOpen(id: string) {
    const c = this.comments.get(id);
    if (!c) return;
    const el = resolveAnchor(c);
    if (el && (el as HTMLElement).scrollIntoView) {
      (el as HTMLElement).scrollIntoView({ behavior: "smooth", block: "center" });
      // After scroll settles, open the thread.
      setTimeout(() => this.openThread(id), 320);
    } else {
      this.openThread(id);
    }
  }

  // ------------------------------------------------------------------
  // Pick mode: hover highlight + click capture
  // ------------------------------------------------------------------

  private onPickMove = (ev: MouseEvent) => {
    // Cursor badge follower: only updates when the badge is in "follow"
    // stage. The mode indicator hides while hovering widget chrome (toggle,
    // sidebar) so it doesn't visually compete with those controls.
    if (this.cursorStage === "follow") {
      const overChrome = ev.target instanceof Element && this.host.contains(ev.target);
      if (overChrome) {
        this.cursorBadgeEl.style.opacity = "0";
      } else {
        this.cursorBadgeEl.style.opacity = "1";
        this.cursorBadgeEl.style.left = (ev.clientX + 14) + "px";
        this.cursorBadgeEl.style.top = (ev.clientY + 14) + "px";
      }
    }
    if (this.composer) return; // don't track hover while composing
    const target = this.findHostElement(ev.target);
    if (!target || target === this.hoverEl) return;
    this.hoverEl = target;
    const r = target.getBoundingClientRect();
    this.highlightEl.style.display = "block";
    this.highlightEl.style.left = r.left + "px";
    this.highlightEl.style.top = r.top + "px";
    this.highlightEl.style.width = r.width + "px";
    this.highlightEl.style.height = r.height + "px";
  };

  private onPickClick = (ev: MouseEvent) => {
    if (this.composer) return; // ignore extra clicks while composing
    const target = this.findHostElement(ev.target);
    if (!target) return;
    ev.preventDefault();
    ev.stopPropagation();
    const anchor = captureAnchor(target);
    const rect = target.getBoundingClientRect();
    this.highlightEl.style.display = "none";
    this.openComposer(anchor, rect, ev.clientX, ev.clientY, target);
  };

  /** Reject events landing on our own shadow host. */
  private findHostElement(t: EventTarget | null): Element | null {
    if (!(t instanceof Element)) return null;
    if (t === this.host || this.host.contains(t)) return null;
    if (t.closest("[data-feedback-pin]")) return null;
    return t;
  }

  // ------------------------------------------------------------------
  // Composer (two-step: change → why)
  // ------------------------------------------------------------------

  private openComposer(anchor: AnchorData, rect: DOMRect, px: number, py: number, originalEl: Element | null) {
    this.closePanel();

    // Decide whether step 3 (scope picker) will appear. Two signals:
    //   1. Cohort > 1 — multiple visible instances on the page (clear "global" candidate)
    //   2. Style anchor — h1-h6, p, button, a, li are inherently themed even
    //      when only one exists on the page (e.g. the H1 represents a token
    //      that applies sitewide). Catching these prevents the H1 case from
    //      being incorrectly treated as local-only.
    let cohort = 1;
    let styleAnchor = false;
    if (originalEl) {
      try {
        const styleTarget = findStyleTarget(originalEl);
        cohort = cohortCount(styleTarget);
        styleAnchor = isStyleAnchor(styleTarget);
      } catch { cohort = 1; }
    }
    const showScope = cohort > 1 || styleAnchor;

    this.composer = { anchor, step: "change", whatText: "", whyText: "", siteWide: false, pendingRect: rect, cohort, styleAnchor, inference: null, clarificationAnswer: null, dismissWarned: false, dismissWarnTimer: 0 };
    this.showStickyHighlight(rect);

    // Whether a scope step (step 3) will be reachable after step 2.
    const stepCount = showScope ? 3 : 2;

    const panel = this.makePanel(px, py);
    panel.innerHTML = `
      <div class="fp-panel-body">
        <div class="fp-history" data-history></div>
        <div class="fp-input-row" data-input-row>
          <textarea data-input placeholder="Add comment" rows="1"></textarea>
          <button class="fp-submit" data-act="submit" title="Next (Enter)" aria-label="Next (Enter)" data-arrow="right">${arrowRightIcon()}</button>
        </div>
        <div class="fp-thinking" data-thinking hidden>
          <span class="fp-spinner" aria-hidden="true"></span>
          <span>Reading your comment…</span>
        </div>
        <div class="fp-clarify" data-clarify hidden>
          <div class="fp-scope-q" data-clarify-q></div>
          <div class="fp-scope-choices" data-clarify-choices></div>
        </div>
        <div class="fp-scope" data-scope hidden>
          <div class="fp-scope-choices fp-scope-choices--row">
            <button type="button" class="fp-scope-btn is-on" data-scope-choice="one" aria-pressed="true">This instance</button>
            <button type="button" class="fp-scope-btn" data-scope-choice="all" aria-pressed="false">Site-wide</button>
          </div>
        </div>
        <div class="fp-error" data-err hidden></div>
      </div>
    `;

    const input = panel.querySelector<HTMLTextAreaElement>("[data-input]")!;
    const inputRow = panel.querySelector<HTMLElement>("[data-input-row]")!;
    const scopeRow = panel.querySelector<HTMLElement>("[data-scope]")!;
    const historyEl = panel.querySelector<HTMLElement>("[data-history]")!;
    const errEl = panel.querySelector<HTMLElement>("[data-err]")!;
    const submit = panel.querySelector<HTMLButtonElement>('[data-act="submit"]')!;
    const scopeButtons = panel.querySelectorAll<HTMLButtonElement>("[data-scope-choice]");

    /** Swap submit icon between right-arrow ("next step") and up-arrow ("submit final"). */
    const setSubmitArrow = (kind: "right" | "up") => {
      const label = kind === "up" ? "Submit (Enter)" : "Next (Enter)";
      submit.setAttribute("data-arrow", kind);
      submit.innerHTML = kind === "up" ? arrowUpIcon() : arrowRightIcon();
      submit.setAttribute("aria-label", label);
      submit.setAttribute("title", label);
    };

    // Click-to-submit for scope step: a single tap picks the scope and saves
    // the comment. No separate submit button needed.
    scopeButtons.forEach(b => b.addEventListener("click", async () => {
      const choice = b.getAttribute("data-scope-choice");
      this.composer!.siteWide = choice === "all";
      scopeButtons.forEach(other => {
        const isOn = other === b;
        other.classList.toggle("is-on", isOn);
        other.setAttribute("aria-pressed", String(isOn));
      });
      // Disable both buttons to prevent double-submit while in flight.
      scopeButtons.forEach(x => (x.disabled = true));
      await this.submitComposer(submit, errEl);
    }));

    const autosize = () => {
      input.style.height = "38px";
      input.style.height = Math.min(200, input.scrollHeight) + "px";
    };
    input.addEventListener("input", autosize);

    setTimeout(() => input.focus(), 30);
    // Initial arrow direction is "next" since step 1 always advances.
    setSubmitArrow("right");
    // Step 1 has no history yet.
    this.renderHistory(historyEl);

    const advanceOrSubmit = async () => {
      errEl.hidden = true;
      const c = this.composer!;
      if (c.step === "scope") {
        // No further input on step 3 — submit immediately.
        await this.submitComposer(submit, errEl);
        return;
      }
      const val = input.value.trim();
      if (!val) {
        errEl.textContent = c.step === "change" ? "Please add a comment." : "Please add a reason.";
        errEl.hidden = false; input.focus(); return;
      }
      if (c.step === "change") {
        c.whatText = val;
        c.step = "why";
        input.value = "";
        input.placeholder = "Why?";
        autosize();
        // After step 2, will there be more steps? If yes (step 3 or clarify),
        // keep right-arrow. Otherwise switch to up-arrow ("submit final").
        const moreToCome = stepCount === 3;
        setSubmitArrow(moreToCome ? "right" : "up");
        // Render history above the current input (Comment).
        this.renderHistory(historyEl);
        setTimeout(() => input.focus(), 20);
      } else if (c.step === "why") {
        c.whyText = val;
        // Show a "thinking…" state while we ask the AI for an inference.
        // We never block save on this — if AI is unavailable, the heuristic
        // path takes over.
        submit.disabled = true;
        const thinkingPanel = panel.querySelector<HTMLElement>("[data-thinking]");
        if (thinkingPanel) thinkingPanel.hidden = false;
        c.inference = await this.opts.api.inference({
          comment: c.whatText,
          why: c.whyText,
          target: this.targetDescriptionFor(originalEl),
          cohortCount: c.cohort,
          isStyleAnchor: c.styleAnchor,
          surroundingContext: this.surroundingContextFor(originalEl),
        }).catch(() => null);
        if (thinkingPanel) thinkingPanel.hidden = true;
        submit.disabled = false;

        // Branch on AI's answer:
        //   - clarification with confidence < 0.7 → show a clarify step
        //   - otherwise apply scope and either save (single+confident) or show scope step
        if (c.inference?.clarification && c.inference.confidence < 0.7) {
          c.step = "clarify";
          this.renderHistory(historyEl);
          this.renderClarifyStep(panel, c.inference.clarification);
        } else if (stepCount === 3 || (c.inference && c.inference.scope !== "single")) {
          // Default scope from AI when present; otherwise leave at "This instance".
          if (c.inference?.scope === "global" || c.inference?.scope === "cohort") {
            c.siteWide = true;
            scopeButtons.forEach(b => {
              const isAll = b.getAttribute("data-scope-choice") === "all";
              b.classList.toggle("is-on", isAll);
              b.setAttribute("aria-pressed", String(isAll));
            });
          }
          c.step = "scope";
          inputRow.style.display = "none";
          scopeRow.hidden = false;
          this.renderHistory(historyEl);
          setTimeout(() => scopeButtons[0]?.focus(), 20);
        } else {
          // Local-only element AND AI says single: save now.
          await this.submitComposer(submit, errEl);
        }
      }
    };

    submit.onclick = advanceOrSubmit;

    // Enter submits/advances; Shift+Enter inserts a newline (default behaviour).
    // Cmd/Ctrl+Enter also submits (kept as a familiar alias).
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        advanceOrSubmit();
      }
    });
    // Snap the cursor badge to the composer panel so the mode indicator
    // becomes the comment-in-progress anchor.
    this.setCursorStage("snap");
  }

  /**
   * Render the prior step answers as inline-editable text above the current
   * input. On step 1: nothing. On step 2: shows the Comment. On scope or
   * clarify step: shows Comment and Why. No labels — the placeholder
   * (which appears only when the field is emptied) is the only fallback hint.
   */
  private renderHistory(host: HTMLElement) {
    const c = this.composer;
    if (!host) return;
    if (!c) { host.innerHTML = ""; return; }
    const items: Array<{ placeholder: string; value: string; key: "what" | "why" }> = [];
    const showWhat = c.step !== "change";
    const showWhy = c.step === "scope" || c.step === "clarify";
    if (showWhat) items.push({ placeholder: "Add comment", value: c.whatText, key: "what" });
    if (showWhy) items.push({ placeholder: "Why?", value: c.whyText, key: "why" });
    if (items.length === 0) { host.innerHTML = ""; return; }
    host.innerHTML = items.map(it => `
      <div class="fp-history-item" data-history-key="${it.key}">
        <div class="fp-history-value" contenteditable="true" data-placeholder="${escapeHtml(it.placeholder)}">${escapeHtml(it.value)}</div>
      </div>
    `).join("");
    // Persist edits back into composer state on blur.
    host.querySelectorAll<HTMLElement>(".fp-history-value").forEach(el => {
      const key = (el.parentElement?.getAttribute("data-history-key") || "") as "what" | "why" | "";
      el.addEventListener("blur", () => {
        if (!this.composer || !key) return;
        const val = (el.textContent || "").trim();
        if (key === "what") this.composer.whatText = val;
        if (key === "why") this.composer.whyText = val;
      });
      // Enter saves and blurs (does NOT add a newline).
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); el.blur(); }
      });
    });
  }

  /**
   * Centralised composer-dismiss logic. Returns true if dismissal happened,
   * false if it was deferred to a "shake warning".
   *
   *   - Empty composer or no panel: dismiss silently.
   *   - Non-empty composer, first attempt: shake the panel, set warning,
   *     return false. (Resets after ~4s of no further attempts.)
   *   - Non-empty composer, second attempt within the window: dismiss.
   */
  private tryDismissComposer(): boolean {
    const c = this.composer;
    if (!c) {
      // No composer — but there might be a thread panel; close it.
      this.closeActive();
      return true;
    }
    // Also consider whatever the user has typed into the visible textarea but
    // not yet committed by advancing the step. Without this, hitting Esc on
    // step 1 with text in the box would silently dismiss instead of warning.
    const liveInput = this.panel?.querySelector<HTMLTextAreaElement>("[data-input]");
    const liveText = (liveInput?.value || "").trim();
    const hasContent = !!(liveText || c.whatText.trim() || c.whyText.trim() || (c.step === "scope" && c.siteWide) || c.clarificationAnswer);
    if (!hasContent || c.dismissWarned) {
      // Empty or already warned — dismiss for real.
      window.clearTimeout(c.dismissWarnTimer);
      this.cancelComposer();
      return true;
    }
    // First warning: shake the panel and set the timer.
    if (this.panel) {
      this.panel.classList.remove("fp-shake");
      // Force reflow so the animation restarts cleanly.
      void this.panel.offsetWidth;
      this.panel.classList.add("fp-shake");
    }
    c.dismissWarned = true;
    window.clearTimeout(c.dismissWarnTimer);
    c.dismissWarnTimer = window.setTimeout(() => {
      if (this.composer) this.composer.dismissWarned = false;
    }, 4000);
    return false;
  }

  /** Click-outside listener installed while a panel is open. */
  private onDocumentClickOutside = (e: MouseEvent) => {
    const t = e.target as Element | null;
    if (!t) return;
    // Inside the widget host? — ignore.
    if (this.host.contains(t)) return;
    // Composer? — apply shake-then-dismiss.
    if (this.composer) {
      this.tryDismissComposer();
      return;
    }
    // Otherwise (existing-comment thread, etc.) — dismiss silently.
    this.closeActive();
  };

  /** Build a compact description of the click target for the AI. */
  private targetDescriptionFor(el: Element | null): { tag?: string; classes?: string[]; text?: string; description?: string } {
    if (!el) return {};
    const tag = el.tagName.toLowerCase();
    const classes = el.classList ? Array.from(el.classList).slice(0, 6) : [];
    const text = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 200);
    return { tag, classes, text, description: `<${tag}${classes.length ? "." + classes.join(".") : ""}>` };
  }

  /** A small slice of context around the element to help the AI disambiguate. */
  private surroundingContextFor(el: Element | null): string {
    if (!el || !el.parentElement) return "";
    const parent = el.parentElement;
    const siblings = Array.from(parent.children).slice(0, 8).map(c => {
      const t = (c.textContent || "").trim().replace(/\s+/g, " ").slice(0, 60);
      return `<${c.tagName.toLowerCase()}>${t}`;
    }).join(" | ");
    return `parent <${parent.tagName.toLowerCase()}>: ${siblings}`;
  }

  /** Render the clarify step's question + option buttons inside an open composer panel. */
  private renderClarifyStep(panel: HTMLElement, clarification: { question: string; options: string[] }) {
    const inputRow = panel.querySelector<HTMLElement>("[data-input-row]")!;
    const clarifyRow = panel.querySelector<HTMLElement>("[data-clarify]")!;
    const q = panel.querySelector<HTMLElement>("[data-clarify-q]")!;
    const choices = panel.querySelector<HTMLElement>("[data-clarify-choices]")!;
    inputRow.style.display = "none";
    q.textContent = clarification.question;
    choices.innerHTML = "";
    clarification.options.forEach((opt, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "fp-scope-btn" + (i === 0 ? " is-on" : "");
      b.setAttribute("aria-pressed", i === 0 ? "true" : "false");
      b.textContent = opt;
      b.addEventListener("click", () => this.onClarifyChosen(panel, opt));
      choices.appendChild(b);
    });
    clarifyRow.hidden = false;
    // Focus the first option so Enter chooses it.
    setTimeout(() => (choices.querySelector("button") as HTMLButtonElement | null)?.focus(), 20);
  }

  /** Handle the user picking an option in the clarify step. */
  private async onClarifyChosen(panel: HTMLElement, answer: string) {
    const c = this.composer;
    if (!c) return;
    c.clarificationAnswer = answer;
    const clarifyRow = panel.querySelector<HTMLElement>("[data-clarify]")!;
    const scopeRow = panel.querySelector<HTMLElement>("[data-scope]")!;
    const scopeButtons = panel.querySelectorAll<HTMLButtonElement>("[data-scope-choice]");
    clarifyRow.hidden = true;

    // Move to scope picker. The answer adjusts the default scope if it
    // contains an obvious global hint, otherwise keep "This instance".
    if (/site|global|all|every|across/i.test(answer)) {
      c.siteWide = true;
      scopeButtons.forEach(b => {
        const isAll = b.getAttribute("data-scope-choice") === "all";
        b.classList.toggle("is-on", isAll);
        b.setAttribute("aria-pressed", String(isAll));
      });
    }
    c.step = "scope";
    scopeRow.hidden = false;
    setTimeout(() => scopeButtons[0]?.focus(), 20);
  }

  private cancelComposer() {
    this.composer = null;
    this.hideStickyHighlight();
    this.closePanel();
    // Return the cursor badge to follow mode (or hide if not in Comment).
    this.setCursorStage(this.mode === "comment" ? "follow" : "hidden");
  }

  private async submitComposer(submitBtn: HTMLButtonElement, errEl: HTMLElement) {
    const c = this.composer!;
    submitBtn.disabled = true;
    try {
      const screenshotKey = await this.tryScreenshot();
      // Bundle AI inference + clarification answer into metadata so the dashboard
      // can show the designer how the comment was disambiguated. We never store
      // raw inference output as a top-level comment field; it's diagnostic only.
      const meta = {
        ...captureMetadata(),
        ai: c.inference ? {
          scope: c.inference.scope,
          confidence: c.inference.confidence,
          refined_target: c.inference.refined_target ?? null,
          clarification: c.inference.clarification ?? null,
          answer: c.clarificationAnswer ?? null,
        } : null,
      };
      const res = await this.opts.api.createComment({
        url: this.opts.pageUrl,
        selector: c.anchor.selector,
        dom_path: c.anchor.dom_path,
        x_pct: c.anchor.x_pct,
        y_pct: c.anchor.y_pct,
        viewport_w: c.anchor.viewport_w,
        viewport_h: c.anchor.viewport_h,
        screenshot_key: screenshotKey,
        what: c.anchor.what,
        change_text: c.whatText,
        why_text: c.whyText,
        site_wide: c.siteWide,
        metadata: meta,
      });
      const created: Comment = {
        id: res.id,
        url: this.opts.pageUrl,
        selector: c.anchor.selector,
        dom_path: c.anchor.dom_path,
        x_pct: c.anchor.x_pct,
        y_pct: c.anchor.y_pct,
        viewport_w: c.anchor.viewport_w,
        viewport_h: c.anchor.viewport_h,
        screenshot_key: screenshotKey,
        what: c.anchor.what,
        change_text: c.whatText,
        why_text: c.whyText,
        commenter_name: null,
        anon_id: this.opts.uid,
        site_wide: c.siteWide ? 1 : 0,
        metadata: null,
        status: "open",
        created_at: Date.now(),
        resolved_at: null,
      };
      this.addComment(created);
      this.composer = null;
      this.hideStickyHighlight();
      this.closePanel();
      // Cross-fade the cursor badge to the new pin: badge fades out over
      // 150ms while the pin renders at the element's anchor (different
      // position, so it's a fade rather than a position transform).
      const badge = this.cursorBadgeEl;
      badge.style.transition = "opacity 150ms ease";
      badge.style.opacity = "0";
      window.setTimeout(() => {
        this.setCursorStage(this.mode === "comment" ? "follow" : "hidden");
      }, 160);
    } catch (e) {
      errEl.textContent = (e as Error).message || "Could not save comment.";
      errEl.hidden = false;
      submitBtn.disabled = false;
    }
  }

  private showStickyHighlight(r: DOMRect) {
    const el = this.stickyHighlightEl;
    el.style.display = "block";
    el.style.left = r.left + "px";
    el.style.top = r.top + "px";
    el.style.width = r.width + "px";
    el.style.height = r.height + "px";
    // Mirror the rect onto the spotlight so the rest of the viewport dims.
    const sp = this.spotlightEl;
    sp.hidden = false;
    sp.style.left = r.left + "px";
    sp.style.top = r.top + "px";
    sp.style.width = r.width + "px";
    sp.style.height = r.height + "px";
  }
  private hideStickyHighlight() {
    this.stickyHighlightEl.style.display = "none";
    this.spotlightEl.hidden = true;
  }

  /**
   * Capture the current viewport via html2canvas-pro.
   *
   * html2canvas walks the real DOM and rasterises directly to canvas without
   * the SVG/foreignObject roundtrip that html-to-image uses (and that fails
   * opaquely with "Event(error on IMG)" in modern Chrome). Works on most
   * pages including ones with linear-gradient and aspect-ratio.
   */
  private async tryScreenshot(): Promise<string | null> {
    const prevHostVis = this.host.style.visibility;
    this.host.style.visibility = "hidden";
    try {
      const { default: html2canvas }: any = await import("html2canvas-pro");
      const canvas: HTMLCanvasElement = await html2canvas(document.body, {
        backgroundColor: "#ffffff",
        scale: 1,
        useCORS: true,
        logging: false,
        windowWidth: document.documentElement.clientWidth,
        windowHeight: document.documentElement.clientHeight,
        x: window.scrollX,
        y: window.scrollY,
        width: window.innerWidth,
        height: window.innerHeight,
        ignoreElements: (el: Element) => el.hasAttribute && el.hasAttribute("data-feedback-pin"),
      });
      const blob: Blob = await new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error("blob failed")), "image/png"));
      const r = await this.opts.api.uploadScreenshot(blob);
      return r.key;
    } catch (e: any) {
      const detail = e instanceof Event ? `Event(${(e as any).type ?? "?"} on ${(e as any).target?.tagName ?? "?"})` : (e?.message ?? String(e));
      console.warn("[feedback-pin] screenshot failed:", detail, e);
      return null;
    } finally {
      this.host.style.visibility = prevHostVis;
    }
  }

  // ------------------------------------------------------------------
  // Pin & sidebar rendering
  // ------------------------------------------------------------------

  loadComments(comments: Comment[]) {
    for (const c of comments) this.addComment(c, false);
    this.renderSidebarList();
    this.refreshCount();
  }

  private addComment(c: Comment, render = true) {
    if (!this.comments.has(c.id)) {
      this.comments.set(c.id, c);
      this.commentOrder.push(c.id);
    } else {
      this.comments.set(c.id, c);
    }
    this.renderPin(c);
    if (render) {
      this.renderSidebarList();
      this.refreshCount();
    }
  }

  private removeCommentLocal(id: string) {
    this.comments.delete(id);
    this.commentOrder = this.commentOrder.filter(x => x !== id);
    const pin = this.pins.get(id);
    pin?.remove();
    this.pins.delete(id);
    this.renderSidebarList();
    this.refreshCount();
  }

  private indexOf(id: string): number {
    return this.commentOrder.indexOf(id);
  }

  private renderPin(c: Comment) {
    let pin = this.pins.get(c.id);
    if (!pin) {
      pin = document.createElement("button");
      pin.className = "fp-pin";
      pin.type = "button";
      pin.addEventListener("click", (e) => {
        e.stopPropagation();
        this.openThread(c.id);
      });
      this.chrome.appendChild(pin);
      this.pins.set(c.id, pin);
    }
    pin.setAttribute("aria-label", `Open comment ${this.indexOf(c.id) + 1}`);
    pin.textContent = String(this.indexOf(c.id) + 1);
    pin.classList.toggle("is-closed", isClosedStatus(c.status));
    pin.classList.toggle("is-active", this.activeId === c.id);
    this.positionPin(c);
  }

  private positionPin(c: Comment) {
    const pin = this.pins.get(c.id);
    if (!pin) return;
    const el = resolveAnchor(c);
    let x: number, y: number;
    if (el) {
      const r = el.getBoundingClientRect();
      x = r.left + r.width / 2;
      y = r.top + r.height / 2;
    } else {
      x = c.x_pct * window.innerWidth;
      y = c.y_pct * window.innerHeight;
    }
    pin.style.left = x + "px";
    pin.style.top = y + "px";
    pin.style.display = "flex";
  }

  private scheduleReposition = () => {
    if (this.repositionRaf) return;
    this.repositionRaf = requestAnimationFrame(() => {
      this.repositionRaf = 0;
      for (const c of this.comments.values()) this.positionPin(c);
    });
  };

  private refreshCount() {
    const open = this.openCount();
    if (this.toggleEl) {
      const el = this.toggleEl.querySelector<HTMLElement>("[data-count]");
      if (el) {
        el.textContent = String(open);
        el.style.display = open ? "" : "none";
      }
    }
    this.postToParent({ type: "fp:count", count: open });
  }

  private renderSidebarList() {
    if (!this.sidebarEl) {
      // Headless: notify parent so wrapper sidebar can refresh.
      this.postToParent({ type: "fp:comments", comments: Array.from(this.comments.values()) });
      return;
    }
    const host = this.sidebarEl.querySelector<HTMLElement>("[data-list]")!;
    const allComments = this.commentOrder.map(id => this.comments.get(id)!);
    // Tab filter first. Tabs are still binary (Open / Resolved); the four
    // statuses bucket into them: open+in-progress → "open"; resolved+wont-fix
    // → "resolved".
    const tabFiltered = allComments.filter(c => {
      if (this.filter === "all") return true;
      if (this.filter === "open") return c.status === "open" || c.status === "in-progress";
      return c.status === "resolved" || c.status === "wont-fix";
    });

    // Update search placeholder using the count visible *before* search applies.
    const searchInput = this.sidebarEl.querySelector<HTMLInputElement>("[data-search]");
    if (searchInput) {
      const ph = `Search ${tabFiltered.length} comment${tabFiltered.length === 1 ? "" : "s"}…`;
      if (searchInput.placeholder !== ph) searchInput.placeholder = ph;
    }

    // Search filter.
    const q = this.searchQuery.trim().toLowerCase();
    const searched = q
      ? tabFiltered.filter(c => commentMatchesQuery(c, q))
      : tabFiltered;

    // Sort.
    const items = sortComments(searched, this.sortMode);

    // Three empty states:
    //   1. No comments at all yet (regardless of tab/search) → "No comments yet."
    //   2. Search query matches nothing → No comments matching "...".
    //   3. Tab filter hides all (no search active) → "No comments in this view."
    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "fp-sidebar-empty";
      if (allComments.length === 0) {
        empty.textContent = "No comments yet.";
      } else if (q) {
        empty.textContent = `No comments matching "${this.searchQuery.trim()}".`;
      } else {
        empty.textContent = "No comments in this view.";
      }
      host.innerHTML = "";
      host.appendChild(empty);
      return;
    }
    host.innerHTML = "";
    for (const c of items) {
      const row = document.createElement("div");
      const isClosed = isClosedStatus(c.status);
      row.className = "fp-item" + (isClosed ? " is-closed" : "") + (this.activeId === c.id ? " is-active" : "");
      const isMine = c.anon_id === this.opts.uid;
      row.innerHTML = `
        <div class="fp-item-num">${this.indexOf(c.id) + 1}</div>
        <div class="fp-item-body">
          <div class="fp-item-text">${escapeHtml(c.change_text)}</div>
          <div class="fp-item-meta">
            ${c.site_wide ? `<span class="fp-item-tag">Site-wide</span>` : ``}
            <span class="fp-status-pill fp-status-${escapeHtml(c.status)}" aria-label="Status: ${escapeHtml(statusLabel(c.status))}"></span>
            <span>${formatTime(c.created_at)}</span>
            <span>·</span>
            <span title="Author ID">${escapeHtml(shortUid(c.anon_id || "anon"))}</span>
          </div>
        </div>
        <div class="fp-item-actions">
          ${isMine ? `<button data-act="delete" title="Delete">${trashIcon()}</button>` : ""}
        </div>
      `;
      row.addEventListener("click", (e) => {
        const action = (e.target as Element).closest("[data-act]")?.getAttribute("data-act");
        if (action === "delete") { e.stopPropagation(); this.deleteOwn(c.id); return; }
        this.openThread(c.id);
      });
      host.appendChild(row);
    }
  }

  // ------------------------------------------------------------------
  // Thread / detail
  // ------------------------------------------------------------------

  private async openThread(id: string) {
    const c = this.comments.get(id);
    if (!c) return;
    // Switching to a different thread always resets to view mode; rerendering
    // the same thread (e.g. after a status change) preserves the current mode.
    if (this.activeId !== id) this.threadMode = "view";
    this.activeId = id;
    this.renderPin(c); // refresh active state
    this.renderSidebarList();
    this.closePanel();
    // Hide the cursor badge: existing pins already mark their comments;
    // the follower would be visual noise on top of an already-anchored pin.
    this.setCursorStage("hidden");

    const pin = this.pins.get(id);
    const r = pin?.getBoundingClientRect();
    const px = r ? r.right + 8 : window.innerWidth / 2;
    const py = r ? r.top : window.innerHeight / 2;
    const panel = this.makePanel(px, py);
    const isMine = c.anon_id === this.opts.uid;

    if (this.threadMode === "edit" && isMine) {
      // ---- Edit state ----------------------------------------------------
      // Cancel + Save replace the status select; replies + reply input are
      // hidden so the modal is squarely about editing this comment.
      panel.innerHTML = `
        <div class="fp-edit-actions">
          <button type="button" class="fp-btn-text" data-act="cancel">Cancel</button>
          <button type="button" class="fp-btn-text fp-btn-text--primary" data-act="save">Save</button>
        </div>
        <div class="fp-panel-body">
          <div class="fp-edit-form">
            <label class="fp-edit-field">
              <span class="fp-edit-label">Comment</span>
              <textarea data-edit="change_text" rows="2">${escapeHtml(c.change_text)}</textarea>
            </label>
            <label class="fp-edit-field">
              <span class="fp-edit-label">Why</span>
              <textarea data-edit="why_text" rows="2">${escapeHtml(c.why_text || "")}</textarea>
            </label>
            <label class="fp-edit-checkbox">
              <input type="checkbox" data-edit="site_wide"${c.site_wide ? " checked" : ""}>
              <span>Site-wide</span>
            </label>
          </div>
          <div class="fp-error" data-err hidden></div>
        </div>
      `;

      const errEl = panel.querySelector<HTMLElement>("[data-err]")!;
      const changeTa = panel.querySelector<HTMLTextAreaElement>('[data-edit="change_text"]')!;
      const whyTa = panel.querySelector<HTMLTextAreaElement>('[data-edit="why_text"]')!;
      const siteCb = panel.querySelector<HTMLInputElement>('[data-edit="site_wide"]')!;
      const cancelBtn = panel.querySelector<HTMLButtonElement>('[data-act="cancel"]')!;
      const saveBtn = panel.querySelector<HTMLButtonElement>('[data-act="save"]')!;

      cancelBtn.onclick = () => {
        this.threadMode = "view";
        this.openThread(id);
      };
      saveBtn.onclick = async () => {
        const change_text = changeTa.value.trim();
        const why_text = whyTa.value.trim();
        if (!change_text || !why_text) {
          errEl.textContent = "Comment and Why are both required.";
          errEl.hidden = false;
          return;
        }
        saveBtn.disabled = true;
        try {
          await this.opts.api.updateComment(id, { change_text, why_text, site_wide: siteCb.checked });
          const updated: Comment = { ...c, change_text, why_text, site_wide: siteCb.checked ? 1 : 0 };
          this.comments.set(id, updated);
          this.threadMode = "view";
          this.openThread(id);
        } catch (e) {
          errEl.textContent = (e as Error).message;
          errEl.hidden = false;
          saveBtn.disabled = false;
        }
      };

      setTimeout(() => changeTa.focus(), 30);
      return;
    }

    // ---- View state (read-only) ------------------------------------------
    // Top actions: status select, then (author only) Edit + Delete.
    const statusOptions = STATUS_OPTIONS.map(o =>
      `<option value="${o.value}"${o.value === c.status ? " selected" : ""}>${escapeHtml(o.label)}</option>`
    ).join("");
    panel.innerHTML = `
      <div class="fp-top-actions">
        <select class="fp-status-select" data-act="status" aria-label="Status" title="Status">${statusOptions}</select>
        ${isMine ? `<button class="fp-icon-btn" data-act="edit" title="Edit" aria-label="Edit">${pencilIcon()}</button>` : ""}
        ${isMine ? `<button class="fp-icon-btn" data-act="delete" title="Delete" aria-label="Delete">${trashIcon()}</button>` : ""}
      </div>
      <div class="fp-panel-body">
        <div class="fp-history">
          <div class="fp-history-item">
            <div class="fp-history-label">Comment</div>
            <div class="fp-history-value">${escapeHtml(c.change_text)}</div>
          </div>
          <div class="fp-history-item">
            <div class="fp-history-label">Why</div>
            <div class="fp-history-value">${escapeHtml(c.why_text || "")}</div>
          </div>
          ${c.site_wide ? `
          <div class="fp-history-item">
            <div class="fp-history-label">Apply to</div>
            <div class="fp-history-value">Site-wide</div>
          </div>` : ""}
        </div>
        <div class="fp-thread" data-replies></div>
      </div>
      <div class="fp-panel-body" style="padding-top: 0">
        <div class="fp-input-row">
          <textarea data-reply placeholder="Reply" rows="1"></textarea>
          <button class="fp-submit" data-act="reply" title="Reply" aria-label="Reply">${arrowUpIcon()}</button>
        </div>
        <div class="fp-error" data-err hidden></div>
      </div>
    `;

    const statusSelect = panel.querySelector<HTMLSelectElement>('[data-act="status"]');
    statusSelect?.addEventListener("change", () => {
      const next = statusSelect.value as Comment["status"];
      this.setStatus(id, next);
    });
    panel.querySelector('[data-act="edit"]')?.addEventListener("click", () => {
      this.threadMode = "edit";
      this.openThread(id);
    });
    panel.querySelector('[data-act="delete"]')?.addEventListener("click", () => this.deleteOwn(id));

    const repliesHost = panel.querySelector<HTMLElement>("[data-replies]")!;
    const errEl = panel.querySelector<HTMLElement>("[data-err]")!;
    const replyInput = panel.querySelector<HTMLTextAreaElement>("[data-reply]")!;
    const replyBtn = panel.querySelector<HTMLButtonElement>('[data-act="reply"]')!;

    try {
      const got = await this.opts.api.getComment(id);
      for (const r of got.replies) repliesHost.appendChild(this.makeReplyEl(r));
    } catch { /* swallow */ }

    const sendReply = async () => {
      const body = replyInput.value.trim();
      if (!body) return;
      replyBtn.disabled = true;
      try {
        await this.opts.api.reply(id, body, "client");
        const synthetic: Reply = { id: "tmp_" + Date.now(), comment_id: id, author: "client", body, anon_id: this.opts.uid, created_at: Date.now() };
        repliesHost.appendChild(this.makeReplyEl(synthetic));
        replyInput.value = "";
      } catch (e) { errEl.textContent = (e as Error).message; errEl.hidden = false; }
      replyBtn.disabled = false;
    };
    replyBtn.onclick = sendReply;
    replyInput.addEventListener("keydown", e => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); sendReply(); } });
  }

  private makeReplyEl(r: Reply): HTMLElement {
    const m = document.createElement("div");
    m.className = "fp-msg" + (r.author === "designer" ? " is-designer" : "");
    m.innerHTML = `
      <div class="fp-msg-meta"><span>${escapeHtml(r.author)}</span><span>·</span><span>${formatTime(r.created_at)}</span></div>
      <div class="fp-msg-body">${escapeHtml(r.body)}</div>`;
    return m;
  }

  private async deleteOwn(id: string) {
    const c = this.comments.get(id);
    if (!c) return;
    if (!confirm("Delete this comment?")) return;
    try {
      await this.opts.api.deleteComment(id);
      this.removeCommentLocal(id);
      if (this.activeId === id) this.closeActive();
    } catch (e) { alert((e as Error).message); }
  }

  private async setStatus(id: string, status: Comment["status"]) {
    const c = this.comments.get(id);
    if (!c) return;
    try {
      await this.opts.api.setStatus(id, status);
      const updated: Comment = {
        ...c,
        status,
        resolved_at: status === "resolved" ? Date.now() : null,
      };
      this.comments.set(id, updated);
      this.renderPin(updated);
      this.renderSidebarList();
      this.refreshCount();
      if (this.panel && this.activeId === id) this.openThread(id); // refresh thread chrome
    } catch (e) { alert((e as Error).message); }
  }

  // ------------------------------------------------------------------
  // Panel chrome
  // ------------------------------------------------------------------

  private makePanel(px: number, py: number): HTMLElement {
    const panel = document.createElement("div");
    panel.className = "fp-panel";
    const w = 340, h = 280;
    const sidebarOffset = (this.sidebarEl && this.sidebarVisible) ? 360 : 12;
    const left = Math.max(12, Math.min(window.innerWidth - w - sidebarOffset, px + 12));
    const top = Math.max(12, Math.min(window.innerHeight - h - 12, py));
    panel.style.left = left + "px";
    panel.style.top = top + "px";
    this.chrome.appendChild(panel);
    this.panel = panel;
    // Listen for click-outside to drive dismissal (with shake on first attempt
    // when the composer has content). Capture phase so it fires before any
    // host click handlers.
    document.addEventListener("mousedown", this.onDocumentClickOutside, true);
    return panel;
  }

  private closePanel() {
    this.panel?.remove();
    this.panel = null;
    document.removeEventListener("mousedown", this.onDocumentClickOutside, true);
  }
  private closeActive() {
    if (this.composer) this.cancelComposer();
    this.closePanel();
    if (this.activeId) {
      const c = this.comments.get(this.activeId);
      this.activeId = null;
      // Reset thread mode so the next thread opens in view, not edit.
      this.threadMode = "view";
      if (c) this.renderPin(c);
      this.renderSidebarList();
    }
    // Bring the cursor badge back to follow mode if Comment mode is still on.
    if (this.mode === "comment") this.setCursorStage("follow");
  }

  // ------------------------------------------------------------------
  // Global keyboard
  // ------------------------------------------------------------------

  private onGlobalKey = (e: KeyboardEvent) => {
    const target = e.target as Element | null;
    const inField = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || (target as HTMLElement).isContentEditable);
    if (e.key === "Escape") {
      e.preventDefault();
      // Esc mirrors click-outside semantics:
      //   - composer with content: first Esc shakes (warns), second Esc dismisses
      //   - composer empty OR thread panel OR no panel: dismisses immediately
      //   - no panel and Comment mode active: double-Esc exits Comment mode
      if (this.composer || this.panel) {
        if (this.composer) {
          // tryDismissComposer handles shake-or-dismiss.
          this.tryDismissComposer();
        } else {
          this.closeActive();
        }
        return;
      }
      // No panel, no composer — Esc-Esc exits Comment mode.
      this.escCount += 1;
      if (this.escCount >= 2 && this.mode === "comment") {
        this.setMode("browse");
        this.escCount = 0;
        clearTimeout(this.escTimer);
        return;
      }
      clearTimeout(this.escTimer);
      this.escTimer = window.setTimeout(() => { this.escCount = 0; }, 700);
      return;
    }
    if ((e.key === "c" || e.key === "C") && !inField && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      this.setMode(this.mode === "comment" ? "browse" : "comment");
    }
  };
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

type SortMode = "newest" | "oldest" | "unresolved";

/**
 * Read the user's stored sort preference. Whitelist-validate against the three
 * allowed values; anything else (corrupt, stale, missing) → "newest".
 */
function readSortPref(): SortMode {
  try {
    const v = localStorage.getItem("fp_sort");
    if (v === "newest" || v === "oldest" || v === "unresolved") return v;
  } catch {}
  return "newest";
}

/** Case-insensitive substring match against change_text, why_text, url. */
function commentMatchesQuery(c: Comment, qLower: string): boolean {
  const fields = [c.change_text || "", c.why_text || "", c.url || ""];
  for (const f of fields) {
    if (f.toLowerCase().includes(qLower)) return true;
  }
  return false;
}

/**
 * Sort a list of comments by the chosen mode. Returns a new array; does not
 * mutate the input. Apply *after* search/tab filtering.
 */
function sortComments(items: Comment[], mode: SortMode): Comment[] {
  const copy = items.slice();
  if (mode === "oldest") {
    copy.sort((a, b) => a.created_at - b.created_at);
  } else if (mode === "unresolved") {
    // open + in-progress bucket before resolved + wont-fix; within each
    // group, newest first.
    copy.sort((a, b) => {
      const ao = (a.status === "open" || a.status === "in-progress") ? 0 : 1;
      const bo = (b.status === "open" || b.status === "in-progress") ? 0 : 1;
      if (ao !== bo) return ao - bo;
      return b.created_at - a.created_at;
    });
  } else {
    // newest (default)
    copy.sort((a, b) => b.created_at - a.created_at);
  }
  return copy;
}

/** Wire values + display labels for the four triage statuses. The wire value
 *  for "Won't fix" is `wont-fix`; the UI label keeps the apostrophe. */
const STATUS_OPTIONS: ReadonlyArray<{ value: Comment["status"]; label: string }> = [
  { value: "open", label: "Open" },
  { value: "in-progress", label: "In progress" },
  { value: "wont-fix", label: "Won't fix" },
  { value: "resolved", label: "Resolved" },
];

function statusLabel(s: Comment["status"]): string {
  for (const o of STATUS_OPTIONS) if (o.value === s) return o.label;
  return s;
}

/**
 * "Closed" = resolved OR wont-fix. Drives the `is-closed` greyout class on
 * pins and rows, and the bucketing of the "Resolved" sidebar tab.
 */
function isClosedStatus(s: Comment["status"]): boolean {
  return s === "resolved" || s === "wont-fix";
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function formatTime(ts: number): string {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.round(diff / 60)}m`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h`;
  return new Date(ts).toLocaleDateString();
}

function commentIcon() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`;
}
function cursorIcon() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 3l14 9-7 1-3 7-4-17z"/></svg>`;
}
function closeIcon() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
}
function arrowUpIcon() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>`;
}
function arrowRightIcon() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`;
}
function pencilIcon() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>`;
}
function trashIcon() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;
}

/**
 * Test-only surface. Re-exports pure helpers used by tests/unit/sort-search.test.ts.
 * Tree-shakes out of production builds because the widget IIFE never imports __test.
 */
export const __test = { readSortPref, commentMatchesQuery, sortComments, STATUS_OPTIONS, statusLabel, isClosedStatus };
export type { SortMode };
