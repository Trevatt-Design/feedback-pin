/**
 * E2E tests for the review wrapper at /review on the dashboard worker.
 *
 * Protects:
 *   wrapper-toolbar invariants:
 *     viewport-segment-rendered-in-right-cluster-after-spacer
 *     toolbar-button-widths-stable-across-state-toggles
 *   wrapper-sidebar invariants:
 *     sidebar-overlays-canvas-without-reflowing-iframe
 *
 * Requires the dashboard worker on :8789, the API on :8787, and the smoke-
 * test page on :5173. The wrapper iframes the smoke-test page so the widget
 * runs inside it.
 */

import { test, expect, type Page } from "@playwright/test";

const TOKEN = "fpt_52c5dbdd0f66b5f9899706d4679d58cfa71f704e";
const WRAPPER_URL = `http://localhost:8789/review?url=${encodeURIComponent("http://localhost:5173/smoke-test/")}&token=${TOKEN}`;

async function loadWrapper(page: Page) {
  await page.goto(WRAPPER_URL, { waitUntil: "load" });
  // Wait for the React app to render its toolbar.
  await page.waitForSelector(".toolbar .btn-toolbar");
  // Tiny settle so any transitions finish before measuring.
  await page.waitForTimeout(60);
}

test.describe("wrapper-toolbar layout", () => {
  test("viewport segment is grouped with share + hide on the right cluster (after the spacer)", async ({ page }) => {
    await loadWrapper(page);
    const order = await page.evaluate(() => {
      const tb = document.querySelector(".toolbar")!;
      return Array.from(tb.children).map(el => ({
        cls: el.className || "",
        // Identify the device segmented switcher unambiguously by its
        // role+aria-label rather than visible text — the new DeviceSeg
        // renders glyph-only buttons (no "Desktop" / "Mobile" labels).
        isDeviceSeg:
          el.getAttribute("role") === "group" &&
          el.getAttribute("aria-label") === "Device class",
        text: (el.textContent || "").trim().slice(0, 30),
      }));
    });
    const spacerIdx = order.findIndex(c => c.cls.split(/\s+/).includes("spacer"));
    const viewportIdx = order.findIndex(c => c.isDeviceSeg);
    expect(spacerIdx).toBeGreaterThan(-1);
    expect(viewportIdx).toBeGreaterThan(spacerIdx);
  });

  test("hide-comments button width is stable across toggle (no top-strip reflow)", async ({ page }) => {
    await loadWrapper(page);
    const widths = await page.evaluate(async () => {
      const btns = document.querySelectorAll<HTMLButtonElement>(".toolbar .btn-toolbar");
      const hide = btns[btns.length - 1]; // hide-comments is the last toolbar button
      // Round to integer pixels — sub-pixel jitter in text rendering is
      // not what the invariant is about.
      const before = Math.round(hide.getBoundingClientRect().width);
      hide.click();
      await new Promise(r => setTimeout(r, 60));
      const after = Math.round(hide.getBoundingClientRect().width);
      hide.click(); // restore
      await new Promise(r => setTimeout(r, 60));
      return { before, after };
    });
    expect(widths.after).toBe(widths.before);
  });
});

test.describe("wrapper-sidebar overlay", () => {
  test("toggling the sidebar does not change the iframe's bounding rect (overlay, not push)", async ({ page }) => {
    await loadWrapper(page);
    // Wait for the iframe to mount.
    await page.waitForSelector(".frame-wrap iframe");
    const dims = await page.evaluate(async () => {
      const iframe = document.querySelector(".frame-wrap iframe") as HTMLIFrameElement;
      const btns = document.querySelectorAll<HTMLButtonElement>(".toolbar .btn-toolbar");
      const hide = btns[btns.length - 1];
      const r1 = iframe.getBoundingClientRect();
      const before = { w: Math.round(r1.width), h: Math.round(r1.height) };
      hide.click();
      // Wait past the 220ms slide transition.
      await new Promise(r => setTimeout(r, 280));
      const r2 = iframe.getBoundingClientRect();
      const after = { w: Math.round(r2.width), h: Math.round(r2.height) };
      hide.click(); // restore
      await new Promise(r => setTimeout(r, 280));
      return { before, after };
    });
    expect(dims.after.w).toBe(dims.before.w);
    expect(dims.after.h).toBe(dims.before.h);
  });
});
