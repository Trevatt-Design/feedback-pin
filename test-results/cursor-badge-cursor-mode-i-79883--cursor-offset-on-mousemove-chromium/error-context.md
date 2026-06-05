# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: cursor-badge.spec.ts >> cursor mode-indicator badge >> Phase 1 — badge renders in 'follow' stage with cursor offset on mousemove
- Location: tests/e2e/cursor-badge.spec.ts:90:7

# Error details

```
Error: Channel closed
```

```
Error: page.waitForTimeout: Test ended.
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
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
  - generic:
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
```

# Test source

```ts
  1   | /**
  2   |  * E2E tests for the cursor mode-indicator badge.
  3   |  *
  4   |  * Protects:
  5   |  *   widget-mode-toggle invariants:
  6   |  *     os-cursor-not-overridden-in-comment-mode
  7   |  *     comment-mode-renders-badge-following-cursor
  8   |  *     badge-snaps-to-composer-on-open
  9   |  *     badge-hides-on-thread-open
  10  |  */
  11  | 
  12  | import { test, expect, type Page, type Route } from "@playwright/test";
  13  | 
  14  | const ME = "u_me";
  15  | 
  16  | const ONE_COMMENT = [
  17  |   {
  18  |     id: "c_only",
  19  |     project_id: "p_test",
  20  |     url: "http://localhost:5173/smoke-test/",
  21  |     selector: "h1",
  22  |     dom_path: "html>body>header>h1",
  23  |     x_pct: 0.5, y_pct: 0.1,
  24  |     viewport_w: 1280, viewport_h: 720,
  25  |     screenshot_key: null,
  26  |     change_text: "Existing comment",
  27  |     why_text: "to drive thread-open",
  28  |     site_wide: 0, status: "open",
  29  |     created_at: Date.now() - 60_000,
  30  |     resolved_at: null,
  31  |     commenter_name: null,
  32  |     anon_id: ME,
  33  |   },
  34  | ];
  35  | 
  36  | async function stub(page: Page, comments: any[]) {
  37  |   await page.addInitScript((uid) => {
  38  |     try { localStorage.setItem("fp_uid", uid); } catch {}
  39  |   }, ME);
  40  |   await page.route(/\/v1\/comments(\?.*)?$/, async (route: Route) => {
  41  |     if (route.request().method() !== "GET") return route.continue();
  42  |     await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ comments }) });
  43  |   });
  44  |   await page.route(/\/v1\/comments\/c_only$/, async (route: Route) => {
  45  |     if (route.request().method() === "GET") {
  46  |       await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ comment: comments[0], replies: [] }) });
  47  |     } else {
  48  |       await route.continue();
  49  |     }
  50  |   });
  51  |   await page.route(/\/v1\/inference$/, (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "ai_unavailable" }) }));
  52  | }
  53  | 
  54  | async function load(page: Page, comments: any[]) {
  55  |   await stub(page, comments);
  56  |   await page.goto("/smoke-test/?_=" + Date.now(), { waitUntil: "load" });
  57  |   await page.waitForFunction(() => !!document.querySelector("[data-feedback-pin]"));
  58  |   // Wait for first sidebar render so we know the widget has fully booted.
  59  |   await page.waitForFunction(() => {
  60  |     const sr = (document.querySelector("[data-feedback-pin]") as HTMLElement)?.shadowRoot;
  61  |     return !!sr?.querySelector("[data-list] .fp-item, [data-list] .fp-sidebar-empty");
  62  |   });
  63  | }
  64  | 
  65  | async function readBadge(page: Page) {
  66  |   return page.evaluate(() => {
  67  |     const sr = (document.querySelector("[data-feedback-pin]") as HTMLElement).shadowRoot!;
  68  |     const b = sr.querySelector(".fp-cursor-badge") as HTMLElement | null;
  69  |     if (!b) return { exists: false };
  70  |     const r = b.getBoundingClientRect();
  71  |     return {
  72  |       exists: true,
  73  |       hidden: b.hidden,
  74  |       stage: b.getAttribute("data-stage"),
  75  |       opacity: b.style.opacity,
  76  |       left: Math.round(r.left),
  77  |       top: Math.round(r.top),
  78  |     };
  79  |   });
  80  | }
  81  | 
  82  | test.describe("cursor mode-indicator badge", () => {
  83  |   test("Comment mode does NOT override the OS cursor (documentElement.style.cursor is empty)", async ({ page }) => {
  84  |     await load(page, []);
  85  |     const cursor = await page.evaluate(() => document.documentElement.style.cursor);
  86  |     // Empty string means we're using the OS default — not a url(...) override.
  87  |     expect(cursor).toBe("");
  88  |   });
  89  | 
  90  |   test("Phase 1 — badge renders in 'follow' stage with cursor offset on mousemove", async ({ page }) => {
  91  |     await load(page, []);
  92  |     // Initial state: stage should be "follow".
  93  |     let s = await readBadge(page);
  94  |     expect(s.exists).toBe(true);
  95  |     expect(s.hidden).toBe(false);
  96  |     expect(s.stage).toBe("follow");
  97  | 
  98  |     // Move the mouse over a content area (not widget chrome).
  99  |     await page.mouse.move(400, 400);
> 100 |     await page.waitForTimeout(60);
      |                ^ Error: page.waitForTimeout: Test ended.
  101 |     s = await readBadge(page);
  102 |     // The badge offset is +14, +14 from the cursor.
  103 |     expect(Math.abs(s.left! - (400 + 14))).toBeLessThanOrEqual(2);
  104 |     expect(Math.abs(s.top!  - (400 + 14))).toBeLessThanOrEqual(2);
  105 |   });
  106 | 
  107 |   test("Phase 2 — clicking an element snaps the badge to the composer panel (data-stage='snap')", async ({ page }) => {
  108 |     await load(page, []);
  109 |     // Click the H1 to open the composer.
  110 |     await page.evaluate(() => {
  111 |       const el = document.querySelector("h1") as HTMLElement;
  112 |       const r = el.getBoundingClientRect();
  113 |       el.dispatchEvent(new MouseEvent("click", { clientX: r.left + 8, clientY: r.top + 8, bubbles: true, cancelable: true, view: window }));
  114 |     });
  115 |     await page.waitForTimeout(220); // past the snap transition
  116 |     const s = await readBadge(page);
  117 |     expect(s.exists).toBe(true);
  118 |     expect(s.hidden).toBe(false);
  119 |     expect(s.stage).toBe("snap");
  120 | 
  121 |     // Mousemove should NOT move it any more (snap is anchored to the panel).
  122 |     const before = { left: s.left, top: s.top };
  123 |     await page.mouse.move(900, 500);
  124 |     await page.waitForTimeout(60);
  125 |     const after = await readBadge(page);
  126 |     expect(after.left).toBe(before.left);
  127 |     expect(after.top).toBe(before.top);
  128 |   });
  129 | 
  130 |   test("Phase 3 — opening an existing comment thread hides the badge (the pin is the anchor)", async ({ page }) => {
  131 |     await load(page, ONE_COMMENT);
  132 |     // Click the sidebar row to open the thread for the existing comment.
  133 |     await page.evaluate(() => {
  134 |       const sr = (document.querySelector("[data-feedback-pin]") as HTMLElement).shadowRoot!;
  135 |       (sr.querySelector(".fp-item") as HTMLElement).click();
  136 |     });
  137 |     await page.waitForTimeout(120);
  138 |     const s = await readBadge(page);
  139 |     expect(s.hidden).toBe(true);
  140 |   });
  141 | });
  142 | 
```