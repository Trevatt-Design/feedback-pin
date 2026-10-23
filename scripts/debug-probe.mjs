// Local probe: computed styles of selects on the dashboard, and widget pin
// positions on the host page. usage: FP_TOKEN=... node scripts/debug-probe.mjs
import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
await page.goto("http://localhost:8789/#/login");
await page.evaluate((t) => { localStorage.setItem("fp_token", t); localStorage.setItem("fp_actor", "Michael"); }, process.env.FP_TOKEN);
await page.goto("http://localhost:8789/#/comments");
await page.waitForSelector(".list-item");
const sel = await page.evaluate(() => {
  const s = document.querySelector("#fp-comments-sort");
  const cs = getComputedStyle(s);
  const r = s.getBoundingClientRect();
  return { h: r.height, lh: cs.lineHeight, pt: cs.paddingTop, pb: cs.paddingBottom, disp: cs.display, app: cs.appearance, font: cs.font, align: cs.alignItems, va: cs.verticalAlign };
});
console.log("select", JSON.stringify(sel));
const w = await browser.newPage({ viewport: { width: 1360, height: 860 } });
await w.goto("http://localhost:5173/", { waitUntil: "networkidle" });
await w.waitForTimeout(2000);
const pins = await w.evaluate(() => {
  const sr = document.querySelector("[data-feedback-pin]")?.shadowRoot;
  if (!sr) return "no shadow";
  return Array.from(sr.querySelectorAll("*")).filter((e) => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.width < 40 && r.left < 30 && r.top < 30;
  }).map((e) => ({ cls: e.className, tag: e.tagName, r: e.getBoundingClientRect().toJSON(), disp: getComputedStyle(e).display, op: getComputedStyle(e).opacity }));
});
console.log("topleft", JSON.stringify(pins));
await browser.close();
