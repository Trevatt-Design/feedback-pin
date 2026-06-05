/**
 * E2E tests for the existing-comment thread panel in the widget.
 *
 * Protects:
 *   widget-pins invariants:
 *     thread-opens-in-view-mode-by-default
 *     edit-button-renders-only-for-author
 *     edit-and-delete-only-on-own-comments  (kept; now mode-gated rather
 *                                            than per-field-inline)
 *     edit-mode-renders-cancel-and-save-only
 *     edit-mode-site-wide-is-checkbox
 *     edit-form-fields-are-fully-clickable-via-label-wrapper
 *     no-text-fields-contenteditable-in-view-mode
 *
 *   universal-rules invariants:
 *     icon-only-buttons-have-title-attribute
 */

import { test, expect, type Page, type Route } from "@playwright/test";

const ME = "u_me";
const OTHER = "u_other";

const COMMENTS = [
  {
    id: "c_mine",
    project_id: "p_test",
    url: "http://localhost:5173/smoke-test/",
    selector: "h1",
    dom_path: "html>body>header>h1",
    x_pct: 0.5, y_pct: 0.1,
    viewport_w: 1280, viewport_h: 720,
    screenshot_key: null,
    change_text: "Make this bigger",
    why_text: "It's the page title",
    site_wide: 0,
    status: "open",
    created_at: Date.now() - 60_000,
    resolved_at: null,
    commenter_name: null,
    anon_id: ME,
  },
  {
    id: "c_theirs",
    project_id: "p_test",
    url: "http://localhost:5173/smoke-test/",
    selector: ".picture-placeholder",
    dom_path: "html>body>main>section:nth-of-type(3)>div",
    x_pct: 0.5, y_pct: 0.5,
    viewport_w: 1280, viewport_h: 720,
    screenshot_key: null,
    change_text: "Use a real image",
    why_text: "Placeholder is unprofessional",
    site_wide: 1,
    status: "open",
    created_at: Date.now() - 120_000,
    resolved_at: null,
    commenter_name: null,
    anon_id: OTHER,
  },
];

async function stubApi(page: Page) {
  await page.addInitScript((uid) => {
    try { localStorage.setItem("fp_uid", uid); } catch {}
  }, ME);

  await page.route(/\/v1\/comments(\?.*)?$/, async (route: Route) => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ comments: COMMENTS }) });
  });
  await page.route(/\/v1\/comments\/c_mine$/, async (route: Route) => {
    const m = route.request().method();
    if (m === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ comment: COMMENTS[0], replies: [] }) });
    } else if (m === "PATCH") {
      const body = route.request().postDataJSON?.() || {};
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ comment: { ...COMMENTS[0], ...body } }) });
    } else {
      await route.continue();
    }
  });
  await page.route(/\/v1\/comments\/c_theirs$/, async (route: Route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ comment: COMMENTS[1], replies: [] }) });
    } else {
      await route.continue();
    }
  });
  await page.route(/\/v1\/inference$/, (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "ai_unavailable" }) }));
}

async function loadAndOpen(page: Page, commentId: string) {
  await page.goto("/smoke-test/?_=" + Date.now(), { waitUntil: "load" });
  await page.waitForFunction(() => !!document.querySelector("[data-feedback-pin]"));
  // Wait for the sidebar to finish first render.
  await page.waitForFunction(() => {
    const sr = (document.querySelector("[data-feedback-pin]") as HTMLElement)?.shadowRoot;
    return !!sr?.querySelector("[data-list] .fp-item, [data-list] .fp-sidebar-empty");
  });
  // Click the sidebar row for this comment to open its thread.
  await page.evaluate((id) => {
    const sr = (document.querySelector("[data-feedback-pin]") as HTMLElement).shadowRoot!;
    const rows = Array.from(sr.querySelectorAll<HTMLElement>(".fp-item"));
    // The fixture loads comments in created_at desc order, so find by index
    // matching our seed: c_mine (newer) is first, c_theirs (older) is second.
    const order = id === "c_mine" ? 0 : 1;
    rows[order].click();
  }, commentId);
  // Settle.
  await page.waitForTimeout(120);
}

async function readPanelState(page: Page) {
  return page.evaluate(() => {
    const sr = (document.querySelector("[data-feedback-pin]") as HTMLElement).shadowRoot!;
    const panel = sr.querySelector(".fp-panel");
    if (!panel) return { panel: false };
    return {
      panel: true,
      hasEditBtn: !!panel.querySelector('[data-act="edit"]'),
      hasDeleteBtn: !!panel.querySelector('[data-act="delete"]'),
      hasStatusSelect: !!panel.querySelector('[data-act="status"]'),
      hasCancelBtn: !!panel.querySelector('[data-act="cancel"]'),
      hasSaveBtn: !!panel.querySelector('[data-act="save"]'),
      hasReplyInput: !!panel.querySelector('[data-reply]'),
      contenteditableCount: panel.querySelectorAll('[contenteditable="true"]').length,
      changeText: (panel.querySelector('[data-edit="change_text"]') as HTMLTextAreaElement | null)?.value
                  ?? Array.from(panel.querySelectorAll('.fp-history-value')).map(e => (e.textContent || "").trim()).join(" | "),
      siteWideCheckbox: !!panel.querySelector('input[type="checkbox"][data-edit="site_wide"]'),
      editFormFieldsAreLabels: Array.from(panel.querySelectorAll('.fp-edit-field')).every(el => el.tagName === "LABEL"),
    };
  });
}

test.describe("widget thread — view / edit state machine", () => {
  test.beforeEach(async ({ page }) => { await stubApi(page); });

  test("opens in view mode for own comment: read-only fields, Edit + Delete visible, no contenteditable", async ({ page }) => {
    await loadAndOpen(page, "c_mine");
    const s = await readPanelState(page);

    expect(s.panel).toBe(true);
    expect(s.hasStatusSelect).toBe(true);
    expect(s.hasEditBtn).toBe(true);
    expect(s.hasDeleteBtn).toBe(true);
    // No editing affordance until Edit is clicked.
    expect(s.hasCancelBtn).toBe(false);
    expect(s.hasSaveBtn).toBe(false);
    expect(s.contenteditableCount).toBe(0);
    // Reply input still available in view mode.
    expect(s.hasReplyInput).toBe(true);
  });

  test("opens in view mode for someone else's comment: no Edit, no Delete (ownership-gated)", async ({ page }) => {
    await loadAndOpen(page, "c_theirs");
    const s = await readPanelState(page);

    expect(s.panel).toBe(true);
    expect(s.hasEditBtn).toBe(false);
    expect(s.hasDeleteBtn).toBe(false);
    // Status select stays — designers + the author may need to change it.
    expect(s.hasStatusSelect).toBe(true);
  });

  test("clicking Edit opens edit mode: form inputs, checkbox for site-wide, Cancel + Save (and Cancel returns to view)", async ({ page }) => {
    await loadAndOpen(page, "c_mine");
    // Click Edit.
    await page.evaluate(() => {
      const sr = (document.querySelector("[data-feedback-pin]") as HTMLElement).shadowRoot!;
      (sr.querySelector('[data-act="edit"]') as HTMLButtonElement).click();
    });
    await page.waitForTimeout(60);
    const editState = await readPanelState(page);

    expect(editState.hasCancelBtn).toBe(true);
    expect(editState.hasSaveBtn).toBe(true);
    expect(editState.hasStatusSelect).toBe(false);
    expect(editState.hasDeleteBtn).toBe(false);
    expect(editState.hasReplyInput).toBe(false);
    expect(editState.siteWideCheckbox).toBe(true);
    // Whole field is clickable: each .fp-edit-field is a <label>.
    expect(editState.editFormFieldsAreLabels).toBe(true);
    // Textarea is pre-filled with the comment's change_text.
    expect(editState.changeText).toBe("Make this bigger");

    // Click Cancel → back to view mode.
    await page.evaluate(() => {
      const sr = (document.querySelector("[data-feedback-pin]") as HTMLElement).shadowRoot!;
      (sr.querySelector('[data-act="cancel"]') as HTMLButtonElement).click();
    });
    await page.waitForTimeout(60);
    const back = await readPanelState(page);
    expect(back.hasEditBtn).toBe(true);
    expect(back.hasCancelBtn).toBe(false);
  });
});

test.describe("universal-rules — icon-only buttons have a title attribute", () => {
  test("every icon-only button rendered in the standalone widget exposes a tooltip", async ({ page }) => {
    await stubApi(page);
    await loadAndOpen(page, "c_mine");
    // Also drive the composer open so its submit button is on-screen.
    await page.evaluate(() => {
      const el = document.querySelector("h1") as HTMLElement;
      const r = el.getBoundingClientRect();
      el.dispatchEvent(new MouseEvent("click", { clientX: r.left + 8, clientY: r.top + 8, bubbles: true, cancelable: true, view: window }));
    });
    await page.waitForTimeout(120);

    const offenders = await page.evaluate(() => {
      const sr = (document.querySelector("[data-feedback-pin]") as HTMLElement).shadowRoot!;
      const list: Array<{ html: string; ariaLabel: string | null }> = [];
      sr.querySelectorAll<HTMLButtonElement>("button").forEach(b => {
        // Treat as icon-only if visible text content is empty (only SVG inside).
        const text = (b.textContent || "").trim();
        if (text.length > 0) return;
        const title = b.getAttribute("title");
        if (!title || !title.trim()) {
          list.push({ html: b.outerHTML.slice(0, 200), ariaLabel: b.getAttribute("aria-label") });
        }
      });
      return list;
    });
    expect(offenders, `Icon-only buttons missing a 'title' attribute: ${JSON.stringify(offenders, null, 2)}`).toEqual([]);
  });
});
