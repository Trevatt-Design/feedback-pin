// Local visual check: render dashboard routes at 2x and save small JPGs
// for review. usage: FP_TOKEN=... node scripts/shot-check.mjs route [route...]
//   routes: login comments detail review review-moving empty
// Output: reports/jpg/<route>.png (then convert with sips).
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
const OUT = new URL("../reports/jpg/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const routes = process.argv.slice(2);
const W = Number(process.env.W || 1360);
const H = Number(process.env.H || 900);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: Number(process.env.DPR || 1) });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto("http://localhost:8789/#/login");
for (const r of routes) {
  if (r === "login") {
    await page.evaluate(() => localStorage.removeItem("fp_token"));
    await page.goto("http://localhost:8789/#/login");
    await page.reload();
  } else {
    await page.evaluate((t) => { localStorage.setItem("fp_token", t); localStorage.setItem("fp_actor", "Michael"); }, process.env.FP_TOKEN);
    if (r === "comments" || r === "search") {
      await page.goto("http://localhost:8789/#/comments");
      await page.waitForSelector(".list-item");
      if (r === "search") await page.fill(".controls .search", "zzzz nothing");
    }
    if (r === "detail" || r === "detail-web") {
      await page.goto("http://localhost:8789/#/comments");
      await page.waitForSelector(".list-item");
      if (r === "detail-web") await page.locator(".list-item", { hasText: process.env.HAS || "Missing the effect" }).first().click();
      else await page.locator(".list-item").first().click();
      await page.waitForSelector(".fp-detail");
    }
    if (r.startsWith("review")) {
      await page.goto("http://localhost:8789/#/review");
      await page.waitForSelector(".fp-item, .fp-review-empty");
      if (r === "review-moving") await page.getByRole("button", { name: /^In progress/ }).click();
    }
  }
  await page.waitForTimeout(900);
  await page.screenshot({ path: OUT + r + ".png", fullPage: process.env.FULL === "1" });
}
console.log(JSON.stringify({ errors }));
await browser.close();
