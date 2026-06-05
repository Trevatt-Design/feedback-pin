/**
 * E2E tests for the cursor mode-indicator badge.
 *
 * Protects:
 *   widget-mode-toggle invariants:
 *     os-cursor-not-overridden-in-comment-mode
 *     comment-mode-renders-badge-following-cursor
 *     badge-snaps-to-composer-on-open
 *     badge-hides-on-thread-open
 */

import { test, expect, type Page, type Route } from "@playwright/test";

const ME = "u_me";

const ONE_COMMENT = [
  {
    id: "c_only",
    project_id: "p_test",
    url: "http://localhost:5173/smoke-test/",
    selector: "h1",
    dom_path: "html>body>header>h1",
    x_pct: 0.5, y_pct: 0.1,
    viewport_w: 1280, viewport_h: 720,
    screenshot_key: null,
    change_text: "Existing comment",
    why_text: "to drive thread-open",
    site_wide: 0, status: "open",
    created_at: Date.now() - 60_000,
    resolved_at: null,
    commenter_name: null,
    anon_id: ME,
  },
];

async function stub(page: Page, comments: any[]) {
  await page.addInitScript((uid) => {
    try { localStorage.setItem("fp_uid", uid); } catch {}
  }, ME);
  await page.route(/\/v1\/comments(\?.*)?$/, async (route: Route) => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ comments }) });
  });
  await page.route(/\/v1\/comments\/c_only$/, async (route: Route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ comment: comments[0], replies: [] }) });
    } else {
      await route.continue();
    }
  });
  await page.route(/\/v1\/inference$/, (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "ai_unavailable" }) }));
}

async function load(page: Page, comments: any[]) {
  await stub(page, comments);
  await page.goto("/smoke-test/?_=" + Date.now(), { waitUntil: "load" });
  await page.waitForFunction(() => !!document.querySelector("[data-feedback-pin]"));
  // Wait for first sidebar render so we know the widget has fully booted.
  await page.waitForFunction(() => {
    const sr = (document.querySelector("[data-feedback-pin]") as HTMLElement)?.shadowRoot;
    return !!sr?.querySelector("[data-list] .fp-item, [data-list] .fp-sidebar-empty");
  });
}

async function readBadge(page: Page) {
  return page.evaluate(() => {
    const sr = (document.querySelector("[data-feedback-pin]") as HTMLElement).shadowRoot!;
    const b = sr.querySelector(".fp-cursor-badge") as HTMLElement | null;
    if (!b) return { exists: false };
    const r = b.getBoundingClientRect();
    return {
      exists: true,
      hidden: b.hidden,
      stage: b.getAttribute("data-stage"),
      opacity: b.style.opacity,
      left: Math.round(r.left),
      top: Math.round(r.top),
    };
  });
}

test.describe("cursor mode-indicator badge", () => {
  test("Comment mode does NOT override the OS cursor (documentElement.style.cursor is empty)", async ({ page }) => {
    await load(page, []);
    const cursor = await page.evaluate(() => document.documentElement.style.cursor);
    // Empty string means we're using the OS default — not a url(...) override.
    expect(cursor).toBe("");
  });

  test("Phase 1 — badge renders in 'follow' stage with cursor offset on mousemove", async ({ page }) => {
    await load(page, []);
    // Initial state: stage should be "follow".
    let s = await readBadge(page);
    expect(s.exists).toBe(true);
    expect(s.hidden).toBe(false);
    expect(s.stage).toBe("follow");

    // Move the mouse over a content area (not widget chrome).
    await page.mouse.move(400, 400);
    await page.waitForTimeout(60);
    s = await readBadge(page);
    // The badge offset is +14, +14 from the cursor.
    expect(Math.abs(s.left! - (400 + 14))).toBeLessThanOrEqual(2);
    expect(Math.abs(s.top!  - (400 + 14))).toBeLessThanOrEqual(2);
  });

  test("Phase 2 — clicking an element snaps the badge to the composer panel (data-stage='snap')", async ({ page }) => {
    await load(page, []);
    // Click the H1 to open the composer.
    await page.evaluate(() => {
      const el = document.querySelector("h1") as HTMLElement;
      const r = el.getBoundingClientRect();
      el.dispatchEvent(new MouseEvent("click", { clientX: r.left + 8, clientY: r.top + 8, bubbles: true, cancelable: true, view: window }));
    });
    await page.waitForTimeout(220); // past the snap transition
    const s = await readBadge(page);
    expect(s.exists).toBe(true);
    expect(s.hidden).toBe(false);
    expect(s.stage).toBe("snap");

    // Mousemove should NOT move it any more (snap is anchored to the panel).
    const before = { left: s.left, top: s.top };
    await page.mouse.move(900, 500);
    await page.waitForTimeout(60);
    const after = await readBadge(page);
    expect(after.left).toBe(before.left);
    expect(after.top).toBe(before.top);
  });

  test("Phase 3 — opening an existing comment thread hides the badge (the pin is the anchor)", async ({ page }) => {
    await load(page, ONE_COMMENT);
    // Click the sidebar row to open the thread for the existing comment.
    await page.evaluate(() => {
      const sr = (document.querySelector("[data-feedback-pin]") as HTMLElement).shadowRoot!;
      (sr.querySelector(".fp-item") as HTMLElement).click();
    });
    await page.waitForTimeout(120);
    const s = await readBadge(page);
    expect(s.hidden).toBe(true);
  });
});
