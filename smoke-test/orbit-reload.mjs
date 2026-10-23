// Reload a page that has saved comments and report what the widget renders:
// the comment fetch it made, pin count/positions, sidebar item count.
//   node ../feedback-pin/smoke-test/orbit-reload.mjs [path]
import { chromium } from "@playwright/test";

const path = process.argv[2] || "/plans";
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1280, height: 900 },
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
});
const fetches = [];
page.on("response", async (r) => {
  if (r.url().includes("/v1/comments")) {
    let n = null;
    try { const j = await r.json(); n = Array.isArray(j.comments) ? j.comments.length : null; } catch {}
    fetches.push({ url: decodeURIComponent(r.url()), status: r.status(), count: n });
  }
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "warning" || m.type() === "error") errors.push(m.type() + ": " + m.text().slice(0, 200)); });

await page.goto("http://localhost:5173" + path, { waitUntil: "networkidle" });
await page.waitForFunction(() => typeof window.FeedbackPin !== "undefined", null, { timeout: 15000 });
await page.waitForFunction(() => !/Loading prices/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(1500);

const snap = (label) => page.evaluate((label) => {
  const h = [...document.body.children].find((e) => e.shadowRoot);
  const sr = h.shadowRoot;
  const pins = [...sr.querySelectorAll(".fp-pin")].map((p) => {
    const r = p.getBoundingClientRect();
    const cs = getComputedStyle(p);
    return { n: p.textContent, x: Math.round(r.x), y: Math.round(r.y), display: cs.display, visibility: cs.visibility, opacity: cs.opacity, hidden: p.hidden };
  });
  const items = sr.querySelectorAll(".fp-item").length;
  const count = sr.querySelector("[data-count]")?.textContent;
  return { label, url: location.href, pins: pins.length, items, count, sample: pins.slice(0, 4) };
}, label);

const r1 = await snap("after load");
await page.waitForTimeout(4000);
const r2 = await snap("after +4s");
await browser.close();
console.log(JSON.stringify({ fetches, r1, r2, errors: errors.slice(0, 8) }, null, 2));
