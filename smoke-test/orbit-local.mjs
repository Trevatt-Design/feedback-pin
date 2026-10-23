// Proves the widget loads on the Orbit dev server and follows client-side
// navigation. Run from orbit-web-app so its Playwright install is used:
//   node ../feedback-pin/smoke-test/orbit-local.mjs
import { chromium } from "@playwright/test";

const API = "http://localhost:8787";
const SITE = "http://localhost:5173";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const commentCalls = [];
page.on("request", (r) => {
  if (r.url().startsWith(API + "/v1/comments")) commentCalls.push(r.url());
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

await page.goto(SITE + "/", { waitUntil: "networkidle" });
await page.waitForFunction(() => typeof window.FeedbackPin !== "undefined", null, { timeout: 15000 });
const mounted = await page.evaluate(() =>
  [...document.body.children].filter((e) => e.shadowRoot).map((e) => e.tagName + "." + e.className),
);
const toggle = await page.evaluate(() => {
  const host = [...document.body.children].find((e) => e.shadowRoot);
  return host?.shadowRoot?.textContent?.replace(/\s+/g, " ").trim().slice(0, 120) ?? null;
});

// Client-side navigation: click the Explore plans link, no full reload.
await page.evaluate(() => { window.__fpMarker = 1; });
// Comment -> Browse via the toggle so host links are clickable.
await page.evaluate(() => {
  const host = [...document.body.children].find((e) => e.shadowRoot);
  host.shadowRoot.querySelector('button[data-mode="browse"]').click();
});
await page.waitForTimeout(200);
await page.getByRole("link", { name: /explore plans/i }).first().click();
await page.waitForURL(/plans/, { timeout: 15000, waitUntil: "commit" });
await page.waitForTimeout(800);
const afterNav = await page.evaluate(() => ({
  url: location.href,
  sameDocument: window.__fpMarker === 1,
  stillMounted: [...document.body.children].some((e) => e.shadowRoot),
}));

await browser.close();
const result = { mounted, toggleText: toggle, afterNav, commentCalls, errors };
console.log(JSON.stringify(result, null, 2));
const ok =
  mounted.length === 1 &&
  afterNav.sameDocument &&
  afterNav.stillMounted &&
  commentCalls.some((u) => u.includes(encodeURIComponent(SITE + "/plans")) || u.includes("plans")) &&
  errors.length === 0;
console.log(ok ? "PASS" : "FAIL");
process.exit(ok ? 0 : 1);
