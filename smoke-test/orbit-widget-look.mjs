// Renders the widget chrome on the local Orbit home page: hover highlight,
// a selected element with the composer open, and the sidebar. Writes
// smoke-test/out/widget-*.png and prints the resolved highlight colour.
//   node ../feedback-pin/smoke-test/orbit-widget-look.mjs
import { chromium } from "@playwright/test";

const OUT = "../feedback-pin/smoke-test/out/";
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 2,
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
});
await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
await page.waitForFunction(() => typeof window.FeedbackPin !== "undefined", null, { timeout: 15000 });
await page.waitForTimeout(800);

const host = () => [...document.body.children].find((e) => e.shadowRoot);
const resolved = await page.evaluate(() => {
  const h = [...document.body.children].find((e) => e.shadowRoot);
  const cs = getComputedStyle(h);
  const hl = h.shadowRoot.querySelector(".fp-highlight");
  const toggle = h.shadowRoot.querySelector(".fp-toggle");
  return {
    fpHl: cs.getPropertyValue("--fp-hl").trim(),
    surface: cs.getPropertyValue("--fp-surface").trim(),
    highlightBorder: hl ? getComputedStyle(hl).borderColor : null,
    toggleBg: toggle ? getComputedStyle(toggle).backgroundColor : null,
  };
});

// Hover the hero heading to show the outline highlight, then click it to open the composer.
const heading = page.locator("main h1").first();
await heading.hover();
await page.waitForTimeout(300);
await page.screenshot({ path: OUT + "widget-hover.png" });
await heading.click();
await page.waitForTimeout(500);
await page.keyboard.type("Make this heading two lines, not four.");
await page.waitForTimeout(200);
await page.screenshot({ path: OUT + "widget-composer.png" });
const composer = await page.evaluate(() => {
  const h = [...document.body.children].find((e) => e.shadowRoot);
  const panel = h.shadowRoot.querySelector(".fp-panel, .fp-composer");
  const sticky = h.shadowRoot.querySelector(".fp-highlight.is-sticky, .fp-sticky-highlight") || h.shadowRoot.querySelectorAll(".fp-highlight")[1];
  const badge = h.shadowRoot.querySelector(".fp-cursor-badge");
  return {
    panelBg: panel ? getComputedStyle(panel).backgroundColor : null,
    panelRadius: panel ? getComputedStyle(panel).borderRadius : null,
    stickyBorder: sticky ? getComputedStyle(sticky).borderColor : null,
    badgeBg: badge ? getComputedStyle(badge).backgroundColor : null,
    badgeFg: badge ? getComputedStyle(badge).color : null,
  };
});
await browser.close();
console.log(JSON.stringify({ resolved, composer }, null, 2));
