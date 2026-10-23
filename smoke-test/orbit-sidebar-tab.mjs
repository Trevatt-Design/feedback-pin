// Run from ~/Github/orbit-web-app so Playwright resolves.
import { chromium } from "playwright";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 968 }, deviceScaleFactor: 2, userAgent: UA });
await page.goto("http://localhost:5173/plans", { waitUntil: "networkidle" });
await page.waitForSelector("div[data-feedback-pin]", { state: "attached" });
await page.waitForTimeout(800);

const state = () => page.evaluate(() => {
  const r = document.querySelector("div[data-feedback-pin]").shadowRoot;
  const sb = r.querySelector(".fp-sidebar").getBoundingClientRect();
  const tab = r.querySelector(".fp-sidebar-tab").getBoundingClientRect();
  const hidden = r.querySelector(".fp-sidebar").classList.contains("is-hidden");
  const mode = r.querySelector(".fp-toggle button.is-active").getAttribute("data-mode");
  const tips = [...r.querySelectorAll(".fp-toggle [data-tip]")].map(b => b.getAttribute("data-tip"));
  return { sidebar: { top: sb.top, right: innerWidth - sb.right, bottom: innerHeight - sb.bottom, width: sb.width }, tab: { right: innerWidth - tab.right, midY: (tab.top + tab.bottom) / 2 }, hidden, mode, tips };
});

const out = { open: await state() };
await page.screenshot({ path: "../feedback-pin/smoke-test/out/sidebar-open.png" });

// Collapse via the tab, wait for the transition.
await page.evaluate(() => document.querySelector("div[data-feedback-pin]").shadowRoot.querySelector(".fp-sidebar-tab").click());
await page.waitForTimeout(400);
out.collapsed = await state();
await page.screenshot({ path: "../feedback-pin/smoke-test/out/sidebar-collapsed.png" });

// Shortcuts: v → browse, c → comment, on the page body.
await page.keyboard.press("v"); out.afterV = (await state()).mode;
await page.keyboard.press("c"); out.afterC = (await state()).mode;
// Reopen sidebar, type into its search box: v must NOT switch modes.
await page.evaluate(() => document.querySelector("div[data-feedback-pin]").shadowRoot.querySelector(".fp-sidebar-tab").click());
await page.waitForTimeout(400);
await page.evaluate(() => document.querySelector("div[data-feedback-pin]").shadowRoot.querySelector("[data-search]").focus());
await page.keyboard.type("v");
out.afterTypingVInSearch = (await state()).mode;
out.searchValue = await page.evaluate(() => document.querySelector("div[data-feedback-pin]").shadowRoot.querySelector("[data-search]").value);
// Cmd+C on body must not switch either.
await page.evaluate(() => document.activeElement.blur());
await page.keyboard.press("v");
await page.keyboard.press("Meta+c");
out.afterMetaC = (await state()).mode;

// Hover tooltip on the Comment button: measure the ::after.
await page.evaluate(() => document.querySelector("div[data-feedback-pin]").shadowRoot.querySelector('[data-mode="comment"]').dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
const btn = await page.evaluate(() => { const b = document.querySelector("div[data-feedback-pin]").shadowRoot.querySelector('[data-mode="comment"]').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, top: b.top }; });
await page.mouse.move(btn.x, btn.y);
await page.waitForTimeout(250);
out.tooltip = await page.evaluate(() => {
  const b = document.querySelector("div[data-feedback-pin]").shadowRoot.querySelector('[data-mode="comment"]');
  const cs = getComputedStyle(b, "::after");
  return { content: cs.content, opacity: cs.opacity, bg: cs.backgroundColor, color: cs.color, font: cs.fontSize };
});
await page.screenshot({ path: "../feedback-pin/smoke-test/out/tooltip.png", clip: { x: btn.x - 220, y: btn.top - 60, width: 440, height: 110 } });
console.log(JSON.stringify(out, null, 1));
await browser.close();
