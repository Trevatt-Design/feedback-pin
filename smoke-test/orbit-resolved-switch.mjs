// Run from ~/Github/orbit-web-app.
import { chromium } from "playwright";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 968 }, deviceScaleFactor: 2, userAgent: UA });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
await page.waitForSelector("div[data-feedback-pin]", { state: "attached" });
await page.waitForTimeout(1000);
const state = () => page.evaluate(() => {
  const r = document.querySelector("div[data-feedback-pin]").shadowRoot;
  const pins = [...r.querySelectorAll(".fp-pin")];
  return {
    items: r.querySelectorAll(".fp-item").length,
    closedItems: r.querySelectorAll(".fp-item.is-closed").length,
    pinsTotal: pins.length,
    pinsVisible: pins.filter(p => getComputedStyle(p).display !== "none").length,
    switchOn: r.querySelector("[data-show-resolved]").checked,
    count: r.querySelector("[data-resolved-count]").textContent,
    headCount: r.querySelector("[data-head-count]").textContent,
  };
});
const off = await state();
await page.screenshot({ path: "../feedback-pin/smoke-test/out/resolved-off.png", clip: { x: 1580, y: 0, width: 340, height: 300 } });
await page.evaluate(() => { const r = document.querySelector("div[data-feedback-pin]").shadowRoot; r.querySelector(".fp-switch").click(); });
await page.waitForTimeout(300);
const on = await state();
await page.screenshot({ path: "../feedback-pin/smoke-test/out/resolved-on.png", clip: { x: 1580, y: 0, width: 340, height: 300 } });
console.log(JSON.stringify({ off, on }));
await browser.close();
