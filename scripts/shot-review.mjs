// Local check: render the dashboard routes with a project token and save
// full-page screenshots to reports/review-shots/.
// usage: FP_TOKEN=... node scripts/shot-review.mjs [routes...]
//   routes default: login comments detail review review-moving
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const OUT = new URL("../reports/review-shots/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const want = process.argv.slice(2);
const routes = want.length ? want : ["login", "comments", "detail", "review", "review-moving"];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto("http://localhost:8789/#/login");
await page.evaluate((t) => localStorage.removeItem("fp_token"), null);
const report = {};
for (const r of routes) {
  if (r === "login") {
    await page.evaluate(() => localStorage.removeItem("fp_token"));
    await page.goto("http://localhost:8789/#/login");
    await page.reload();
  } else {
    await page.evaluate(([t]) => { localStorage.setItem("fp_token", t); localStorage.setItem("fp_actor", "Michael"); }, [process.env.FP_TOKEN]);
    if (r === "comments") await page.goto("http://localhost:8789/#/comments");
    if (r === "detail") {
      await page.goto("http://localhost:8789/#/comments");
      await page.waitForSelector(".list-item");
      await page.locator(".list-item").first().click();
      await page.waitForSelector(".fp-detail");
    }
    if (r.startsWith("review")) {
      await page.goto("http://localhost:8789/#/review");
      await page.waitForSelector(".fp-item, .fp-review-empty");
      if (r === "review-moving") await page.getByRole("button", { name: /^In progress/ }).click();
    }
  }
  await page.waitForTimeout(700);
  await page.screenshot({ path: OUT + r + ".png", fullPage: process.env.FULL !== "0" });
  report[r] = (await page.locator("body").innerText()).slice(0, 200).replace(/\n/g, " | ");
}
console.log(JSON.stringify({ report, errors }, null, 1));
await browser.close();
