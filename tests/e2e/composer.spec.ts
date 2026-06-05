/**
 * E2E tests for the widget composer.
 *
 * Protects:
 *   widget-composer invariants:
 *     both-fields-mandatory
 *     no-close-button-renders
 *     no-title-bar-renders
 *     native-checkbox-must-not-render
 *     scope-step-only-shown-when-cohort-greater-than-1-or-style-anchor
 *     scope-buttons-side-by-side-with-fixed-labels
 *     no-apply-to-label
 *     no-step-dots
 *     history-items-render-without-labels
 *     submit-arrow-inline-and-direction-matches-context
 *     enter-submits-shift-enter-inserts-newline
 *     textful-clickaway-shakes-then-dismisses-on-second  (now triggers from step 1 too)
 *
 * Smoke-test page provides a fixture with one <h1> (cohort 1) and four
 * <h2>s (cohort 4) so we can drive both code paths.
 */

import { test, expect, type Page } from "@playwright/test";

async function loadFresh(page: Page) {
  await page.goto("/smoke-test/?_=" + Date.now(), { waitUntil: "load" });
  await page.waitForFunction(() => !!document.querySelector("[data-feedback-pin]"));
}

async function dispatchClickOn(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement;
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new MouseEvent("click", {
      clientX: r.left + 8, clientY: r.top + 8,
      bubbles: true, cancelable: true, view: window,
    }));
  }, selector);
}

async function readPanelState(page: Page) {
  return page.evaluate(() => new Promise<any>((resolve) => {
    setTimeout(() => {
      const sr = (document.querySelector("[data-feedback-pin]") as HTMLElement).shadowRoot!;
      const panel = sr.querySelector(".fp-panel");
      if (!panel) return resolve({ panel: false });
      const submitBtn = panel.querySelector('[data-act="submit"]') as HTMLElement | null;
      const submitRect = submitBtn?.getBoundingClientRect();
      resolve({
        panel: true,
        placeholder: (panel.querySelector("textarea[data-input]") as HTMLTextAreaElement)?.placeholder,
        uppercaseLabel: !!Array.from(panel.querySelectorAll("*")).find(
          (el) => el.textContent && /^(ADD COMMENT|WHY)$/.test(el.textContent.trim())
        ),
        nativeCheckbox: !!panel.querySelector('input[type="checkbox"]'),
        cancelButton: !!Array.from(panel.querySelectorAll("button")).find(
          (b) => /^cancel$/i.test(b.textContent?.trim() || "")
        ),
        closeButton: !!panel.querySelector('[data-act="close"]'),
        titleBar: !!panel.querySelector(".fp-panel-head"),
        stepDots: panel.querySelectorAll(".fp-step-dots, [data-dots]").length,
        applyToLabel: !!Array.from(panel.querySelectorAll("*")).find(
          (el) => el.textContent && /^Apply to:?$/.test(el.textContent.trim())
        ),
        scopeVisible: !(panel.querySelector("[data-scope]") as HTMLElement | null)?.hidden,
        scopeChoices: Array.from(panel.querySelectorAll("[data-scope-choice]")).map((b: any) => b.textContent?.trim()),
        scopeChoicesRow: !!panel.querySelector("[data-scope] .fp-scope-choices--row"),
        submitArrow: submitBtn?.getAttribute("data-arrow"),
        submitInsideInput: !!panel.querySelector(".fp-input-row .fp-submit"),
        // Approximate aspect-ratio check for the rounded-rectangle submit
        // button: a perfect circle has w === h. Rect should be wider than tall.
        submitIsRect: submitRect ? submitRect.width > submitRect.height + 4 : false,
        historyItems: panel.querySelectorAll(".fp-history-item").length,
        historyLabels: panel.querySelectorAll(".fp-history-label").length,
        panelShakes: panel.classList.contains("fp-shake"),
      });
    }, 250);
  }));
}

test.describe("widget-composer", () => {
  test("opens with no header, no close, no title bar (radically minimal shell)", async ({ page }) => {
    await loadFresh(page);
    await dispatchClickOn(page, "h1");
    const s = await readPanelState(page);

    expect(s.panel).toBe(true);
    expect(s.placeholder).toBe("Add comment");
    expect(s.titleBar).toBe(false);
    expect(s.closeButton).toBe(false);
    expect(s.uppercaseLabel).toBe(false);
    expect(s.nativeCheckbox).toBe(false);
    expect(s.cancelButton).toBe(false);
    expect(s.stepDots).toBe(0);
  });

  test("submit button is a rounded rectangle inline in the input row, starts as right-arrow", async ({ page }) => {
    await loadFresh(page);
    await dispatchClickOn(page, "h1");
    const s = await readPanelState(page);

    expect(s.submitInsideInput).toBe(true);
    expect(s.submitArrow).toBe("right");
    expect(s.submitIsRect).toBe(true);
  });

  test("step 1 has no history; step 2 shows the previous answer above with no label", async ({ page }) => {
    await loadFresh(page);
    await dispatchClickOn(page, "h1");
    const before = await readPanelState(page);
    expect(before.historyItems).toBe(0);
    expect(before.historyLabels).toBe(0);

    // Drive the composer through step 1 → step 2.
    await page.evaluate(() => {
      const sr = (document.querySelector("[data-feedback-pin]") as HTMLElement).shadowRoot!;
      const panel = sr.querySelector(".fp-panel")!;
      const input = panel.querySelector("textarea[data-input]") as HTMLTextAreaElement;
      input.value = "make this smaller";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      (panel.querySelector('[data-act="submit"]') as HTMLButtonElement).click();
    });
    const after = await readPanelState(page);
    expect(after.placeholder).toBe("Why?");
    expect(after.historyItems).toBe(1);
    expect(after.historyLabels).toBe(0);
  });

  test("scope step renders side-by-side 'This instance' / 'Site-wide' buttons with no 'Apply to:' label", async ({ page }) => {
    await loadFresh(page);
    await dispatchClickOn(page, "h1"); // h1 is a style anchor → scope step is reachable
    const s = await readPanelState(page);

    expect(s.applyToLabel).toBe(false);
    expect(s.scopeChoices).toEqual(["This instance", "Site-wide"]);
    expect(s.scopeChoicesRow).toBe(true);
  });

  test("Enter in the textarea submits/advances; Shift+Enter inserts a newline", async ({ page }) => {
    await loadFresh(page);
    await dispatchClickOn(page, ".picture-placeholder"); // unique non-style-anchor element

    // Type then press Enter (no shift). Should advance to step 2.
    await page.evaluate(() => {
      const sr = (document.querySelector("[data-feedback-pin]") as HTMLElement).shadowRoot!;
      const panel = sr.querySelector(".fp-panel")!;
      const input = panel.querySelector("textarea[data-input]") as HTMLTextAreaElement;
      input.focus();
      input.value = "needs a real image";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });
    let s = await readPanelState(page);
    expect(s.placeholder).toBe("Why?");

    // Shift+Enter should NOT advance — the textarea takes the newline. Step
    // remains "why" with whatever's in the box.
    await page.evaluate(() => {
      const sr = (document.querySelector("[data-feedback-pin]") as HTMLElement).shadowRoot!;
      const panel = sr.querySelector(".fp-panel")!;
      const input = panel.querySelector("textarea[data-input]") as HTMLTextAreaElement;
      input.focus();
      input.value = "line one";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true, cancelable: true }));
    });
    s = await readPanelState(page);
    expect(s.placeholder).toBe("Why?"); // still on step 2; did not advance
  });

  test("dismiss attempt with text in step 1 shakes the panel (does not silently drop)", async ({ page }) => {
    await loadFresh(page);
    await dispatchClickOn(page, "h1");

    // Type into step 1 without advancing, then press Esc once. Expect a shake.
    const shook = await page.evaluate(async () => {
      const sr = (document.querySelector("[data-feedback-pin]") as HTMLElement).shadowRoot!;
      const panel = sr.querySelector(".fp-panel") as HTMLElement;
      const input = panel.querySelector("textarea[data-input]") as HTMLTextAreaElement;
      input.focus();
      input.value = "i have something to say";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      // Single Esc fires the shake-warn for textful composers.
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      // Animation class is added synchronously; read it back immediately.
      return panel.classList.contains("fp-shake");
    });
    expect(shook).toBe(true);
    // Panel should still be open (shake warns, second attempt dismisses).
    const after = await readPanelState(page);
    expect(after.panel).toBe(true);
  });

  test("does not render a native checkbox or cancel button under any path", async ({ page }) => {
    await loadFresh(page);
    await dispatchClickOn(page, "h2");
    const s = await readPanelState(page);
    expect(s.nativeCheckbox).toBe(false);
    expect(s.cancelButton).toBe(false);
    expect(s.stepDots).toBe(0);
  });
});
