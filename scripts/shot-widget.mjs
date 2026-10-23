// Local check: open a host page that loads the widget, open the sidebar
// and a comment thread, and save viewport screenshots.
// usage: node scripts/shot-widget.mjs [url]
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const OUT = new URL("../reports/review-shots/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const url = process.argv[2] || "http://localhost:5173/";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1360, height: 860 } });
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForFunction(() => !!document.querySelector("[data-feedback-pin]"), null, { timeout: 15000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: OUT + "widget-sidebar.png" });
// Open the first comment's thread from the sidebar list if present.
const opened = await page.evaluate(() => {
  const sr = document.querySelector("[data-feedback-pin]")?.shadowRoot;
  const item = sr?.querySelector(".fp-item");
  if (item) { item.dispatchEvent(new MouseEvent("click", { bubbles: true })); return true; }
  return false;
});
await page.waitForTimeout(800);
await page.screenshot({ path: OUT + "widget-thread.png" });
console.log(JSON.stringify({ opened }));
await browser.close();
