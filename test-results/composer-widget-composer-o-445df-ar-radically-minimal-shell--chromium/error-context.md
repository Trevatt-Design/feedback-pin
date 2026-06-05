# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: composer.spec.ts >> widget-composer >> opens with no header, no close, no title bar (radically minimal shell)
- Location: tests/e2e/composer.spec.ts:82:7

# Error details

```
Error: Channel closed
```

```
Error: page.evaluate: Test ended.
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - banner [ref=e2]:
    - heading "Smoke test page" [level=1] [ref=e3]
    - paragraph [ref=e4]: A handful of varied elements to click on and comment about. None of this content matters — it's just a target for feedback-pin.
  - main [ref=e5]:
    - generic [ref=e6]:
      - heading "Card with text" [level=2] [ref=e7]
      - paragraph [ref=e9]: This card has a paragraph inside it. Try leaving a comment on the heading above, this paragraph, and the card border itself. Each should pin to a different element and resolve cleanly.
    - generic [ref=e10]:
      - heading "Two-column grid" [level=2] [ref=e11]
      - generic [ref=e12]:
        - generic [ref=e13]:
          - strong [ref=e14]: Column one
          - paragraph [ref=e15]: Some text in column one. The widget should pick the inner div, not the grid container, when you hover narrowly.
        - generic [ref=e16]:
          - strong [ref=e17]: Column two
          - paragraph [ref=e18]: Column two has a £99 price tag inside the paragraph. Try clicking that span specifically.
    - generic [ref=e19]:
      - heading "Image and call to action" [level=2] [ref=e20]
      - generic [ref=e21]: image placeholder
      - paragraph [ref=e22]:
        - link "Primary action" [ref=e23] [cursor=pointer]:
          - /url: "#"
      - blockquote [ref=e24]: "\"Feedback that doesn't survive a layout change is feedback you'll lose.\" — the whole point of hybrid anchoring."
    - generic [ref=e25]:
      - heading "List of items" [level=2] [ref=e26]
      - list [ref=e27]:
        - listitem [ref=e28]: One — a list item.
        - listitem [ref=e29]: Two — try commenting on this specific bullet.
        - listitem [ref=e30]: Three — and this one.
  - contentinfo [ref=e31]:
    - text: Open the dashboard at
    - link "http://localhost:8788" [ref=e32] [cursor=pointer]:
      - /url: http://localhost:8788
    - text: to triage comments. Edit
    - code [ref=e33]: smoke-test/index.html
    - text: to inject your local token.
  - generic [active]:
    - generic:
      - generic [ref=e34]:
        - button "Comment mode (C)" [ref=e35] [cursor=pointer]:
          - img [ref=e36]
          - generic [ref=e38]: Comment
        - button "Browse mode (C)" [ref=e39] [cursor=pointer]:
          - img [ref=e40]
          - generic [ref=e42]: Browse
      - complementary [ref=e43]:
        - generic [ref=e44]:
          - heading "Comments" [level=3] [ref=e45]
          - button "Hide sidebar" [ref=e46] [cursor=pointer]:
            - img [ref=e47]
        - generic [ref=e50]:
          - searchbox "Search comments" [ref=e51]
          - generic [ref=e52]: Sort comments
          - combobox "Sort comments" [ref=e53] [cursor=pointer]:
            - option "Newest" [selected]
            - option "Oldest"
            - option "Unresolved first"
        - tablist [ref=e54]:
          - button "Open" [ref=e55] [cursor=pointer]
          - button "Resolved" [ref=e56] [cursor=pointer]
          - button "All" [ref=e57] [cursor=pointer]
        - generic [ref=e59]: No comments yet.
      - generic:
        - img
      - generic [ref=e62]:
        - textbox "Add comment" [ref=e63]
        - button "Next (Enter)" [ref=e64] [cursor=pointer]:
          - img [ref=e65]
```

# Test source

```ts
  1   | /**
  2   |  * E2E tests for the widget composer.
  3   |  *
  4   |  * Protects:
  5   |  *   widget-composer invariants:
  6   |  *     both-fields-mandatory
  7   |  *     no-close-button-renders
  8   |  *     no-title-bar-renders
  9   |  *     native-checkbox-must-not-render
  10  |  *     scope-step-only-shown-when-cohort-greater-than-1-or-style-anchor
  11  |  *     scope-buttons-side-by-side-with-fixed-labels
  12  |  *     no-apply-to-label
  13  |  *     no-step-dots
  14  |  *     history-items-render-without-labels
  15  |  *     submit-arrow-inline-and-direction-matches-context
  16  |  *     enter-submits-shift-enter-inserts-newline
  17  |  *     textful-clickaway-shakes-then-dismisses-on-second  (now triggers from step 1 too)
  18  |  *
  19  |  * Smoke-test page provides a fixture with one <h1> (cohort 1) and four
  20  |  * <h2>s (cohort 4) so we can drive both code paths.
  21  |  */
  22  | 
  23  | import { test, expect, type Page } from "@playwright/test";
  24  | 
  25  | async function loadFresh(page: Page) {
  26  |   await page.goto("/smoke-test/?_=" + Date.now(), { waitUntil: "load" });
  27  |   await page.waitForFunction(() => !!document.querySelector("[data-feedback-pin]"));
  28  | }
  29  | 
  30  | async function dispatchClickOn(page: Page, selector: string) {
  31  |   return page.evaluate((sel) => {
  32  |     const el = document.querySelector(sel) as HTMLElement;
  33  |     const r = el.getBoundingClientRect();
  34  |     el.dispatchEvent(new MouseEvent("click", {
  35  |       clientX: r.left + 8, clientY: r.top + 8,
  36  |       bubbles: true, cancelable: true, view: window,
  37  |     }));
  38  |   }, selector);
  39  | }
  40  | 
  41  | async function readPanelState(page: Page) {
> 42  |   return page.evaluate(() => new Promise<any>((resolve) => {
      |               ^ Error: page.evaluate: Test ended.
  43  |     setTimeout(() => {
  44  |       const sr = (document.querySelector("[data-feedback-pin]") as HTMLElement).shadowRoot!;
  45  |       const panel = sr.querySelector(".fp-panel");
  46  |       if (!panel) return resolve({ panel: false });
  47  |       const submitBtn = panel.querySelector('[data-act="submit"]') as HTMLElement | null;
  48  |       const submitRect = submitBtn?.getBoundingClientRect();
  49  |       resolve({
  50  |         panel: true,
  51  |         placeholder: (panel.querySelector("textarea[data-input]") as HTMLTextAreaElement)?.placeholder,
  52  |         uppercaseLabel: !!Array.from(panel.querySelectorAll("*")).find(
  53  |           (el) => el.textContent && /^(ADD COMMENT|WHY)$/.test(el.textContent.trim())
  54  |         ),
  55  |         nativeCheckbox: !!panel.querySelector('input[type="checkbox"]'),
  56  |         cancelButton: !!Array.from(panel.querySelectorAll("button")).find(
  57  |           (b) => /^cancel$/i.test(b.textContent?.trim() || "")
  58  |         ),
  59  |         closeButton: !!panel.querySelector('[data-act="close"]'),
  60  |         titleBar: !!panel.querySelector(".fp-panel-head"),
  61  |         stepDots: panel.querySelectorAll(".fp-step-dots, [data-dots]").length,
  62  |         applyToLabel: !!Array.from(panel.querySelectorAll("*")).find(
  63  |           (el) => el.textContent && /^Apply to:?$/.test(el.textContent.trim())
  64  |         ),
  65  |         scopeVisible: !(panel.querySelector("[data-scope]") as HTMLElement | null)?.hidden,
  66  |         scopeChoices: Array.from(panel.querySelectorAll("[data-scope-choice]")).map((b: any) => b.textContent?.trim()),
  67  |         scopeChoicesRow: !!panel.querySelector("[data-scope] .fp-scope-choices--row"),
  68  |         submitArrow: submitBtn?.getAttribute("data-arrow"),
  69  |         submitInsideInput: !!panel.querySelector(".fp-input-row .fp-submit"),
  70  |         // Approximate aspect-ratio check for the rounded-rectangle submit
  71  |         // button: a perfect circle has w === h. Rect should be wider than tall.
  72  |         submitIsRect: submitRect ? submitRect.width > submitRect.height + 4 : false,
  73  |         historyItems: panel.querySelectorAll(".fp-history-item").length,
  74  |         historyLabels: panel.querySelectorAll(".fp-history-label").length,
  75  |         panelShakes: panel.classList.contains("fp-shake"),
  76  |       });
  77  |     }, 250);
  78  |   }));
  79  | }
  80  | 
  81  | test.describe("widget-composer", () => {
  82  |   test("opens with no header, no close, no title bar (radically minimal shell)", async ({ page }) => {
  83  |     await loadFresh(page);
  84  |     await dispatchClickOn(page, "h1");
  85  |     const s = await readPanelState(page);
  86  | 
  87  |     expect(s.panel).toBe(true);
  88  |     expect(s.placeholder).toBe("Add comment");
  89  |     expect(s.titleBar).toBe(false);
  90  |     expect(s.closeButton).toBe(false);
  91  |     expect(s.uppercaseLabel).toBe(false);
  92  |     expect(s.nativeCheckbox).toBe(false);
  93  |     expect(s.cancelButton).toBe(false);
  94  |     expect(s.stepDots).toBe(0);
  95  |   });
  96  | 
  97  |   test("submit button is a rounded rectangle inline in the input row, starts as right-arrow", async ({ page }) => {
  98  |     await loadFresh(page);
  99  |     await dispatchClickOn(page, "h1");
  100 |     const s = await readPanelState(page);
  101 | 
  102 |     expect(s.submitInsideInput).toBe(true);
  103 |     expect(s.submitArrow).toBe("right");
  104 |     expect(s.submitIsRect).toBe(true);
  105 |   });
  106 | 
  107 |   test("step 1 has no history; step 2 shows the previous answer above with no label", async ({ page }) => {
  108 |     await loadFresh(page);
  109 |     await dispatchClickOn(page, "h1");
  110 |     const before = await readPanelState(page);
  111 |     expect(before.historyItems).toBe(0);
  112 |     expect(before.historyLabels).toBe(0);
  113 | 
  114 |     // Drive the composer through step 1 → step 2.
  115 |     await page.evaluate(() => {
  116 |       const sr = (document.querySelector("[data-feedback-pin]") as HTMLElement).shadowRoot!;
  117 |       const panel = sr.querySelector(".fp-panel")!;
  118 |       const input = panel.querySelector("textarea[data-input]") as HTMLTextAreaElement;
  119 |       input.value = "make this smaller";
  120 |       input.dispatchEvent(new Event("input", { bubbles: true }));
  121 |       (panel.querySelector('[data-act="submit"]') as HTMLButtonElement).click();
  122 |     });
  123 |     const after = await readPanelState(page);
  124 |     expect(after.placeholder).toBe("Why?");
  125 |     expect(after.historyItems).toBe(1);
  126 |     expect(after.historyLabels).toBe(0);
  127 |   });
  128 | 
  129 |   test("scope step renders side-by-side 'This instance' / 'Site-wide' buttons with no 'Apply to:' label", async ({ page }) => {
  130 |     await loadFresh(page);
  131 |     await dispatchClickOn(page, "h1"); // h1 is a style anchor → scope step is reachable
  132 |     const s = await readPanelState(page);
  133 | 
  134 |     expect(s.applyToLabel).toBe(false);
  135 |     expect(s.scopeChoices).toEqual(["This instance", "Site-wide"]);
  136 |     expect(s.scopeChoicesRow).toBe(true);
  137 |   });
  138 | 
  139 |   test("Enter in the textarea submits/advances; Shift+Enter inserts a newline", async ({ page }) => {
  140 |     await loadFresh(page);
  141 |     await dispatchClickOn(page, ".picture-placeholder"); // unique non-style-anchor element
  142 | 
```