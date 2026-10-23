// Run from ~/Github/orbit-web-app. Opens a composer, answers step 1, shows step 2.
import { chromium } from "playwright";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 968 }, deviceScaleFactor: 2, userAgent: UA });
await page.goto("http://localhost:5173/plans", { waitUntil: "networkidle" });
await page.waitForSelector("div[data-feedback-pin]", { state: "attached" });
await page.waitForTimeout(800);
const h1 = await page.locator("h1").first().boundingBox();
await page.mouse.move(h1.x + 40, h1.y + 20); await page.waitForTimeout(100);
await page.mouse.click(h1.x + 40, h1.y + 20); await page.waitForTimeout(500);
await page.keyboard.type("sadf");
await page.keyboard.press("Enter"); await page.waitForTimeout(500);
const m = await page.evaluate(() => {
  const r = document.querySelector("div[data-feedback-pin]").shadowRoot;
  const ta = r.querySelector(".fp-input-row textarea").getBoundingClientRect();
  const btn = r.querySelector(".fp-submit").getBoundingClientRect();
  const p = r.querySelector(".fp-panel").getBoundingClientRect();
  return { panel: { x: p.x, y: p.y, w: p.width, h: p.height }, textarea: { h: ta.height }, button: { top: btn.top - ta.top, bottom: ta.bottom - btn.bottom, right: ta.right - btn.right, h: btn.height }, placeholder: r.querySelector(".fp-input-row textarea").placeholder };
});
await page.screenshot({ path: "../feedback-pin/smoke-test/out/composer-why.png", clip: { x: m.panel.x - 20, y: m.panel.y - 20, width: m.panel.w + 40, height: m.panel.h + 40 } });
await page.keyboard.type("because it is in the design file and this is a long reason that wraps onto a second line");
await page.waitForTimeout(200);
const m2 = await page.evaluate(() => { const r = document.querySelector("div[data-feedback-pin]").shadowRoot; const ta = r.querySelector(".fp-input-row textarea"); return { h: ta.getBoundingClientRect().height, scroll: ta.scrollHeight, client: ta.clientHeight }; });
const p2 = await page.evaluate(() => { const b = document.querySelector("div[data-feedback-pin]").shadowRoot.querySelector(".fp-panel").getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
await page.screenshot({ path: "../feedback-pin/smoke-test/out/composer-why-long.png", clip: { x: p2.x - 20, y: p2.y - 20, width: p2.w + 40, height: p2.h + 40 } });
console.log(JSON.stringify({ step2: m, long: m2 }));
await browser.close();
