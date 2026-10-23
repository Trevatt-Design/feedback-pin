// Run from ~/Github/orbit-web-app. Renders the restyled widget: sidebar,
// toggle, pins, then a composer opened on the hero heading, then a thread.
import { chromium } from "playwright";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 968 }, deviceScaleFactor: 2, userAgent: UA });
await page.goto("http://localhost:5173/plans", { waitUntil: "networkidle" });
await page.waitForSelector("div[data-feedback-pin]", { state: "attached" });
await page.waitForTimeout(800);
const sr = () => document.querySelector("div[data-feedback-pin]").shadowRoot;

await page.screenshot({ path: "../feedback-pin/smoke-test/out/restyle-page.png" });
await page.screenshot({ path: "../feedback-pin/smoke-test/out/restyle-sidebar.png", clip: { x: 1500, y: 0, width: 420, height: 968 } });

// Open a thread on pin 1.
await page.evaluate(() => { const r = document.querySelector("div[data-feedback-pin]").shadowRoot; r.querySelector(".fp-pin").click(); });
await page.waitForTimeout(400);
const panel = await page.evaluate(() => { const p = document.querySelector("div[data-feedback-pin]").shadowRoot.querySelector(".fp-panel"); if (!p) return null; const b = p.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
if (panel) await page.screenshot({ path: "../feedback-pin/smoke-test/out/restyle-thread.png", clip: { x: Math.max(0, panel.x - 40), y: Math.max(0, panel.y - 40), width: panel.w + 80, height: panel.h + 80 } });
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

// Open a composer on the hero heading (comment mode is on by default).
const h1 = await page.locator("h1").first().boundingBox();
await page.mouse.move(h1.x + 40, h1.y + 20);
await page.waitForTimeout(150);
await page.screenshot({ path: "../feedback-pin/smoke-test/out/restyle-hover.png", clip: { x: h1.x - 60, y: h1.y - 60, width: h1.width + 120, height: h1.height + 120 } });
await page.mouse.click(h1.x + 40, h1.y + 20);
await page.waitForTimeout(500);
await page.keyboard.type("Heading should use the display weight from the brand file");
await page.waitForTimeout(200);
const comp = await page.evaluate(() => { const p = document.querySelector("div[data-feedback-pin]").shadowRoot.querySelector(".fp-panel"); if (!p) return null; const b = p.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
if (comp) await page.screenshot({ path: "../feedback-pin/smoke-test/out/restyle-composer.png", clip: { x: Math.max(0, comp.x - 40), y: Math.max(0, comp.y - 40), width: comp.w + 80, height: comp.h + 80 } });

const measured = await page.evaluate(() => {
  const r = document.querySelector("div[data-feedback-pin]").shadowRoot;
  const cs = (sel, prop) => { const el = r.querySelector(sel); return el ? getComputedStyle(el)[prop] : null; };
  return {
    hl: cs(".fp-highlight", "borderColor"), hlBg: cs(".fp-highlight", "backgroundColor"),
    pinBg: cs(".fp-pin", "backgroundColor"), pinFg: cs(".fp-pin", "color"), pinSize: cs(".fp-pin", "width"),
    submit: [cs(".fp-submit", "width"), cs(".fp-submit", "height"), cs(".fp-submit", "borderRadius")],
    sidebarBg: cs(".fp-sidebar", "backgroundColor"), font: cs(".fp-item-text", "fontFamily").split(",")[0],
    headCount: r.querySelector("[data-head-count]")?.textContent,
  };
});
console.log(JSON.stringify({ panel: !!panel, composer: !!comp, measured }, null, 1));
await browser.close();
