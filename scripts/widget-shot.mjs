// Local probe: screenshot the widget on the orbit-web-app host page and
// report any visible widget element parked at the top-left corner, plus any
// pin that paints over the sidebar. usage: node scripts/widget-shot.mjs
import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1360, height: 860 }, deviceScaleFactor: 2 });
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log("console:", m.text().slice(0, 200)); });
page.on("pageerror", (e) => console.log("pageerror:", String(e).slice(0, 200)));
await page.goto(process.env.URL || "http://localhost:5173/", { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
// The host dev server may run without the widget settings, so inject it.
await page.evaluate(({ token }) => new Promise((done) => {
  if (document.querySelector("div[data-feedback-pin]")) return done();
  const s = document.createElement("script");
  s.src = "http://localhost:8790/feedback-pin.js";
  s.onload = () => { window.FeedbackPin.init({ token, api: "http://localhost:8787" }); done(); };
  document.body.appendChild(s);
}), { token: process.env.FP_TOKEN });
await page.waitForTimeout(2500);

const report = await page.evaluate(() => {
  const sr = document.querySelector("div[data-feedback-pin]")?.shadowRoot;
  if (!sr) return { error: "no widget" };
  const visible = (e) => {
    const cs = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    return cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity) > 0 && r.width > 0;
  };
  const topLeft = Array.from(sr.querySelectorAll("*")).filter((e) => {
    const r = e.getBoundingClientRect();
    return visible(e) && r.width < 40 && r.right < 30 && r.bottom < 30;
  }).map((e) => e.className);
  const side = sr.querySelector(".fp-sidebar")?.getBoundingClientRect();
  const pins = Array.from(sr.querySelectorAll(".fp-pin")).filter(visible);
  const overSidebar = side ? pins.filter((p) => {
    const r = p.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (cx < side.left) return false;
    return sr.elementFromPoint(cx, cy) === p;
  }).length : 0;
  const rows = Array.from(sr.querySelectorAll(".fp-item-meta")).slice(0, 3).map((m) => m.textContent.replace(/\s+/g, " ").trim());
  return { pinsVisible: pins.length, topLeft, overSidebar, rows };
});
console.log(JSON.stringify(report));
await page.screenshot({ path: "reports/jpg/widget.png" });
await browser.close();
