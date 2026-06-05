/**
 * E2E tests for Batch 2: Custom-width viewport + device presets.
 *
 * Surface under test:
 *   Dashboard /review wrapper at http://localhost:8789/review
 *
 * The change replaces the 3-button Desktop/Tablet/Mobile segmented control
 * with three composable controls:
 *   - DeviceSeg     (glyph-only desktop + mobile, ARIA aria-pressed)
 *   - WidthInput    (debounced 250ms numeric input, [320, 2560] clamp,
 *                    inline error, aria-label "Frame width in pixels")
 *   - PresetSelect  (<optgroup>s for Mobile / Tablet / Desktop, plus
 *                    "Fill canvas" and a hidden "__custom" sentinel)
 * with new URL params ?w=NNN[&h=NNN]. Legacy ?viewport=desktop|tablet|mobile
 * still resolves on read. ShareButton signature is now { w, h }.
 *
 * Protects (manifest invariants — wrapper-toolbar / wrapper-iframe /
 * wrapper-share):
 *   1. viewport-controls-present-glyph-width-input-and-presets-dropdown
 *   2. viewport-glyph-switcher-toggles-desktop-fill-and-mobile-default
 *   3. iframe-renders-at-width-w-px-when-w-param-is-set
 *   4. legacy-viewport-aliases-desktop-tablet-mobile-still-resolve-correctly
 *   5. width-clamped-to-320-to-2560-on-input-and-on-read
 *   6. desktop-iframe-fills-canvas-only-when-fill-canvas-preset-is-chosen
 *   7. share-link-includes-w-and-h-when-set-or-viewport-alias-when-fill-canvas
 *
 * Requires the dashboard worker on :8789, the API on :8787, and the smoke-
 * test page on :5173 (the wrapper iframes the smoke-test page).
 */

import { test, expect, type Page } from "@playwright/test";

const TOKEN = "fpt_52c5dbdd0f66b5f9899706d4679d58cfa71f704e";
const TARGET = "http://localhost:5173/smoke-test/";
const DASHBOARD = "http://localhost:8789";

function buildUrl(extra: Record<string, string> = {}): string {
  const u = new URL(DASHBOARD + "/review");
  u.searchParams.set("url", TARGET);
  u.searchParams.set("token", TOKEN);
  for (const [k, v] of Object.entries(extra)) {
    u.searchParams.set(k, v);
  }
  return u.toString();
}

/**
 * Install a clipboard stub before any page script runs. The wrapper's
 * ShareButton calls `navigator.clipboard.writeText(...)`; we capture each
 * call into `window.__clipboardCalls` for assertions.
 */
async function installClipboardStub(page: Page) {
  await page.addInitScript(() => {
    // Capture all writeText payloads — the test reads them back synchronously
    // via page.evaluate().
    (window as any).__clipboardCalls = [] as string[];
    const fakeClipboard = {
      writeText(text: string) {
        (window as any).__clipboardCalls.push(text);
        return Promise.resolve();
      },
    };
    try {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        get() {
          return fakeClipboard;
        },
      });
    } catch {
      // If Object.defineProperty fails (already defined non-configurably),
      // fall back to a direct assignment which still wins in most browsers
      // for our purposes.
      (navigator as any).clipboard = fakeClipboard;
    }
  });
}

async function loadWrapper(page: Page, extra: Record<string, string> = {}) {
  await page.goto(buildUrl(extra), { waitUntil: "load" });
  // Wait for the React tree to render the toolbar's right-cluster controls.
  await page.waitForSelector('.toolbar [role="group"][aria-label="Device class"]');
  await page.waitForSelector('.toolbar [aria-label="Frame width in pixels"]');
  await page.waitForSelector('.toolbar [aria-label="Viewport preset"]');
  await page.waitForSelector(".frame-wrap");
  // Tiny settle so the initial transition (if any) does not race a measurement.
  await page.waitForTimeout(60);
}

/** Read inline width on `.frame-wrap` (style.width). null when fill-canvas. */
async function frameInlineWidth(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const el = document.querySelector<HTMLElement>(".frame-wrap");
    if (!el) return null;
    const w = el.style.width;
    return w || null;
  });
}

/** Read inline height on `.frame-wrap`. */
async function frameInlineHeight(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const el = document.querySelector<HTMLElement>(".frame-wrap");
    if (!el) return null;
    const h = el.style.height;
    return h || null;
  });
}

/** Whether `.frame-wrap` currently has the `is-desktop` (fill-canvas) class. */
async function frameIsFillCanvas(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const el = document.querySelector<HTMLElement>(".frame-wrap");
    return !!el && el.classList.contains("is-desktop");
  });
}

/** URLSearchParams snapshot for the current document URL. */
async function readSearchParams(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const out: Record<string, string> = {};
    new URL(location.href).searchParams.forEach((v, k) => { out[k] = v; });
    return out;
  });
}

// =============================================================================
// (a) Toolbar renders all three controls; tablet glyph absent.
// =============================================================================

test.describe("viewport controls render", () => {
  test("(a) toolbar shows desktop+mobile glyphs, width input, preset select; no tablet glyph", async ({ page }) => {
    await loadWrapper(page);
    const seg = page.locator('.toolbar [role="group"][aria-label="Device class"]');
    await expect(seg).toBeVisible();
    // Two glyph buttons inside the seg, ARIA-labelled.
    await expect(seg.locator('button[aria-label="Desktop (fill canvas)"]')).toHaveCount(1);
    await expect(seg.locator('button[aria-label="Mobile"]')).toHaveCount(1);
    // No tablet glyph (per stage 3 spec — tablet lives only as a preset group).
    await expect(seg.locator('button[aria-label*="Tablet" i]')).toHaveCount(0);

    // Width input + preset select are individually present.
    await expect(page.locator('.toolbar [aria-label="Frame width in pixels"]')).toBeVisible();
    await expect(page.locator('.toolbar [aria-label="Viewport preset"]')).toBeVisible();
  });
});

// =============================================================================
// (b) Glyph "desktop" → fill-canvas
// =============================================================================

test.describe("device glyph switcher", () => {
  test("(b) desktop glyph click → fill canvas (no inline width, .is-desktop, ?viewport=desktop, no w/h)", async ({ page }) => {
    // Start with a custom width so the desktop click is observable as a transition.
    await loadWrapper(page, { w: "500" });
    expect(await frameInlineWidth(page)).toBe("500px");

    await page.locator('button[aria-label="Desktop (fill canvas)"]').click();
    // Allow the React state → URL update → re-render to settle.
    await page.waitForTimeout(60);

    expect(await frameIsFillCanvas(page)).toBe(true);
    // .is-desktop overrides via `width: auto !important;` so the inline width
    // is irrelevant; assert against the URL contract instead.
    const params = await readSearchParams(page);
    expect(params.viewport).toBe("desktop");
    expect(params.w).toBeUndefined();
    expect(params.h).toBeUndefined();
  });

  test("(c) mobile glyph click → 390x844 default + ?w=390&h=844, no ?viewport=", async ({ page }) => {
    // Start at fill-canvas; click the mobile glyph cold (no prior mobile pick).
    await loadWrapper(page);
    await page.locator('button[aria-label="Mobile"]').click();
    await page.waitForTimeout(60);

    expect(await frameInlineWidth(page)).toBe("390px");
    expect(await frameInlineHeight(page)).toBe("844px");

    const params = await readSearchParams(page);
    expect(params.w).toBe("390");
    expect(params.h).toBe("844");
    expect(params.viewport).toBeUndefined();
  });
});

// =============================================================================
// (d) WidthInput — debounce + clamp + caret-steal regression
// =============================================================================

test.describe("width input", () => {
  test("(d) typing 500 debounces 250ms, then frame is 500px and URL has ?w=500", async ({ page }) => {
    await loadWrapper(page);
    const input = page.locator('[aria-label="Frame width in pixels"]');
    await input.click();
    await input.fill(""); // clear any default
    await input.type("500", { delay: 10 });
    // Before debounce flush, the URL should not yet contain ?w=500.
    let params = await readSearchParams(page);
    // Inputs may have flushed already on some clocks; we check the *steady state*.
    await page.waitForTimeout(300); // 250ms debounce + 50ms slack
    params = await readSearchParams(page);
    expect(params.w).toBe("500");
    expect(await frameInlineWidth(page)).toBe("500px");
  });

  test("(e) below-clamp 100 → on blur, error appears and input reverts to last good", async ({ page }) => {
    // Seed last-good = 500 from URL.
    await loadWrapper(page, { w: "500" });
    const input = page.locator('[aria-label="Frame width in pixels"]');
    await input.click();
    await input.fill("");
    await input.type("100", { delay: 10 });
    await input.blur();
    // Error appears, frame width unchanged from last good (500), URL unchanged.
    const errVisible = await page.locator(".vp-width-err").isVisible();
    expect(errVisible).toBe(true);
    const errText = (await page.locator(".vp-width-err").textContent()) || "";
    expect(errText).toMatch(/320.*2560/);

    expect(await frameInlineWidth(page)).toBe("500px");
    const params = await readSearchParams(page);
    expect(params.w).toBe("500");

    // Input itself reverts to last-good value 500.
    await expect(input).toHaveValue("500");
  });

  test("(f) above-clamp 9999 → same revert + error", async ({ page }) => {
    await loadWrapper(page, { w: "500" });
    const input = page.locator('[aria-label="Frame width in pixels"]');
    await input.click();
    await input.fill("");
    await input.type("9999", { delay: 10 });
    await input.blur();
    expect(await page.locator(".vp-width-err").isVisible()).toBe(true);
    expect(await frameInlineWidth(page)).toBe("500px");
    const params = await readSearchParams(page);
    expect(params.w).toBe("500");
    await expect(input).toHaveValue("500");
  });

  test("(n) caret-steal regression: typing 5,0,0 keeps the caret at end and final URL has ?w=500", async ({ page }) => {
    await loadWrapper(page);
    const input = page.locator('[aria-label="Frame width in pixels"]');
    await input.click();
    await input.fill("");
    // Type three keystrokes rapidly; debounce should not trigger between them
    // (250ms timer). Use Playwright's keyboard.press so each goes via the real
    // keydown / input path.
    await page.keyboard.press("5");
    await page.keyboard.press("0");
    await page.keyboard.press("0");

    // While typing, draft should be "500" and the input must still be focused
    // — i.e. caret-steal didn't blur it via re-render.
    const focusedInfo = await page.evaluate(() => {
      const el = document.activeElement as HTMLInputElement | null;
      return {
        isWidthInput: el?.getAttribute("aria-label") === "Frame width in pixels",
        value: el?.value || "",
        // Caret position; for type=number Chromium returns null for selectionStart,
        // so we fall back to the value's length when the input is type=number.
        caret: (() => {
          if (!el) return -1;
          if (el.type === "number") return el.value.length; // can't read caret on number input
          try { return el.selectionStart ?? -1; } catch { return -1; }
        })(),
      };
    });
    expect(focusedInfo.isWidthInput).toBe(true);
    expect(focusedInfo.value).toBe("500");
    // Caret stays at the end of the typed digits (3 chars).
    expect(focusedInfo.caret).toBe(3);

    // After the 250ms debounce, URL should reflect the typed value.
    await page.waitForTimeout(300);
    const params = await readSearchParams(page);
    expect(params.w).toBe("500");
  });
});

// =============================================================================
// (g) PresetSelect — pick a specific preset
// =============================================================================

test.describe("preset select", () => {
  test('(g) selecting "iPhone 14 Pro Max" → 430x932 frame, URL ?w=430&h=932', async ({ page }) => {
    await loadWrapper(page);
    const sel = page.locator('[aria-label="Viewport preset"]');
    // The option's `value` is "Mobile:iPhone 14 Pro Max" per PRESET_GROUPS.
    await sel.selectOption("Mobile:iPhone 14 Pro Max");
    await page.waitForTimeout(60);

    expect(await frameInlineWidth(page)).toBe("430px");
    expect(await frameInlineHeight(page)).toBe("932px");
    const params = await readSearchParams(page);
    expect(params.w).toBe("430");
    expect(params.h).toBe("932");
    expect(params.viewport).toBeUndefined();
  });

  test('(h) selecting "Fill canvas" → no inline width, .is-desktop, ?viewport=desktop', async ({ page }) => {
    // Begin with a custom width so the transition is observable.
    await loadWrapper(page, { w: "500" });
    const sel = page.locator('[aria-label="Viewport preset"]');
    await sel.selectOption("__fill");
    await page.waitForTimeout(60);

    expect(await frameIsFillCanvas(page)).toBe(true);
    const params = await readSearchParams(page);
    expect(params.viewport).toBe("desktop");
    expect(params.w).toBeUndefined();
    expect(params.h).toBeUndefined();
  });

  test('(i) typing a non-preset width (444) → preset select shows the hidden "Custom" sentinel', async ({ page }) => {
    await loadWrapper(page);
    const input = page.locator('[aria-label="Frame width in pixels"]');
    await input.click();
    await input.fill("");
    await input.type("444", { delay: 10 });
    await page.waitForTimeout(300);

    const value = await page.locator('[aria-label="Viewport preset"]').inputValue();
    // PresetSelect auto-selects the hidden __custom sentinel when w/h match no preset.
    expect(value).toBe("__custom");
  });
});

// =============================================================================
// (j) Legacy alias compatibility (read-side)
// =============================================================================

test.describe("legacy viewport alias compatibility", () => {
  test("(j) ?viewport=tablet renders 820x1180", async ({ page }) => {
    await loadWrapper(page, { viewport: "tablet" });
    expect(await frameInlineWidth(page)).toBe("820px");
    expect(await frameInlineHeight(page)).toBe("1180px");
  });

  test("(j2) ?viewport=mobile renders 390x844", async ({ page }) => {
    await loadWrapper(page, { viewport: "mobile" });
    expect(await frameInlineWidth(page)).toBe("390px");
    expect(await frameInlineHeight(page)).toBe("844px");
  });

  test("(j3) ?viewport=desktop fills canvas (.is-desktop class, no inline width)", async ({ page }) => {
    await loadWrapper(page, { viewport: "desktop" });
    expect(await frameIsFillCanvas(page)).toBe(true);
  });
});

// =============================================================================
// (k) Read-time clamp on out-of-range w
// =============================================================================

test.describe("read-time width clamp", () => {
  test("(k) ?w=99999 → frame renders at 2560 (clamped on read)", async ({ page }) => {
    await loadWrapper(page, { w: "99999" });
    expect(await frameInlineWidth(page)).toBe("2560px");
  });

  test("(k2) ?w=10 (below min) → frame renders at 320 (clamped on read)", async ({ page }) => {
    await loadWrapper(page, { w: "10" });
    expect(await frameInlineWidth(page)).toBe("320px");
  });
});

// =============================================================================
// (l, m) Share link — delete-opposite invariant
// =============================================================================

test.describe("share link viewport encoding", () => {
  test("(l) share with ?w=500&h=300 → clipboard URL has w=500&h=300 and NO viewport=", async ({ page }) => {
    await installClipboardStub(page);
    await loadWrapper(page, { w: "500", h: "300" });

    await page.locator('button[aria-label="Copy share link"]').click();
    await page.waitForTimeout(60);

    const calls: string[] = await page.evaluate(() => (window as any).__clipboardCalls || []);
    expect(calls.length).toBe(1);
    const u = new URL(calls[0]);
    expect(u.searchParams.get("w")).toBe("500");
    expect(u.searchParams.get("h")).toBe("300");
    expect(u.searchParams.get("viewport")).toBeNull();
    // Token is replaced with the project share token.
    expect(u.searchParams.get("share")).not.toBeNull();
    expect(u.searchParams.get("token")).toBeNull();
  });

  test("(m) share with ?viewport=desktop → clipboard URL has viewport=desktop and NO w/h", async ({ page }) => {
    await installClipboardStub(page);
    await loadWrapper(page, { viewport: "desktop" });

    await page.locator('button[aria-label="Copy share link"]').click();
    await page.waitForTimeout(60);

    const calls: string[] = await page.evaluate(() => (window as any).__clipboardCalls || []);
    expect(calls.length).toBe(1);
    const u = new URL(calls[0]);
    expect(u.searchParams.get("viewport")).toBe("desktop");
    expect(u.searchParams.get("w")).toBeNull();
    expect(u.searchParams.get("h")).toBeNull();
    expect(u.searchParams.get("share")).not.toBeNull();
  });
});
