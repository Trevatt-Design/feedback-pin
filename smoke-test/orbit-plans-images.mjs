// Lists the plan-card images rendered on the local Orbit /plans page, so the
// image source (store artwork vs local editorial fallback) can be checked.
//   node ../feedback-pin/smoke-test/orbit-plans-images.mjs
import { chromium } from "@playwright/test";

const browser = await chromium.launch();
// The test store's WAF returns 403 (no CORS headers) to a HeadlessChrome UA.
const page = await browser.newPage({
  viewport: { width: 1280, height: 900 },
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
});
const failed = [];
page.on("requestfailed", (r) => failed.push(r.url() + " :: " + (r.failure()?.errorText ?? "")));
const store = [];
page.on("response", (r) => { if (r.url().includes("mindszi.io")) store.push(r.status() + " " + r.url()); });
await page.goto("http://localhost:5173/plans", { waitUntil: "networkidle" });
await page.waitForFunction(() => !/Loading prices/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(1500);
const result = await page.evaluate(() => {
  const imgs = [...document.querySelectorAll("main img")].map((i) => ({
    src: i.currentSrc || i.src,
    alt: i.alt,
    loaded: i.complete && i.naturalWidth > 0,
  }));
  return { url: location.href, count: imgs.length, imgs: imgs.slice(0, 12) };
});
await page.screenshot({ path: "../feedback-pin/smoke-test/out/plans.png", fullPage: false });
const text = await page.evaluate(() => document.querySelector("main")?.innerText.slice(0, 400));
await browser.close();
console.log(JSON.stringify({ ...result, failed: failed.slice(0, 5), store: store.slice(0, 8), text }, null, 2));
