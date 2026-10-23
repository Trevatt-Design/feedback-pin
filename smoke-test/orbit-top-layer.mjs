// Run from ~/Github/orbit-web-app. Opens a native modal on a plan page and
// checks the widget renders above it, stays clickable, can comment inside it,
// and returns to <body> when the modal closes.
import { chromium } from "playwright";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, userAgent: UA });
await page.goto("http://localhost:5173/plans/turkey", { waitUntil: "networkidle" });
await page.waitForSelector("div[data-feedback-pin]", { state: "attached" });
await page.waitForTimeout(800);

const probe = () => page.evaluate(() => {
  const host = document.querySelector("div[data-feedback-pin]");
  const r = host.shadowRoot;
  const tab = r.querySelector(".fp-sidebar-tab");
  const tb = tab.getBoundingClientRect();
  const toggle = r.querySelector("[data-tip]");
  const gb = toggle.getBoundingClientRect();
  const hitTab = document.elementFromPoint(tb.x + tb.width / 2, tb.y + tb.height / 2);
  const hitToggle = document.elementFromPoint(gb.x + gb.width / 2, gb.y + gb.height / 2);
  return {
    parent: host.parentElement.tagName,
    popoverOpen: host.matches(":popover-open"),
    modalOpen: !!document.querySelector("dialog:modal"),
    tabOnTop: hitTab === host,
    toggleOnTop: hitToggle === host,
    hostInert: host.closest("[inert]") !== null,
  };
});

const before = await probe();
// Browse mode so the page's own buttons respond.
await page.keyboard.press("v");
const opened = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const buttons = [...document.querySelectorAll("main button, main a[role=button]")];
  for (const b of buttons) {
    if (!b.getClientRects().length) continue;
    b.click();
    await sleep(250);
    const d = document.querySelector("dialog:modal");
    if (d) return (b.textContent || "").trim().slice(0, 40);
  }
  return null;
});
await page.waitForTimeout(400);
const during = await probe();

// Sidebar tab still toggles while the modal is open.
const tabToggle = await page.evaluate(() => {
  const t = document.querySelector("div[data-feedback-pin]").shadowRoot.querySelector(".fp-sidebar-tab");
  const a = t.getAttribute("aria-expanded");
  t.click();
  const b = t.getAttribute("aria-expanded");
  t.click();
  return `${a} -> ${b} -> ${t.getAttribute("aria-expanded")}`;
});

// Comment on something inside the modal with a real pointer click.
await page.keyboard.press("c");
await page.waitForTimeout(200);
const target = await page.evaluate(() => {
  const d = document.querySelector("dialog:modal");
  const el = d.querySelector("h1, h2, h3, p, button") || d;
  const b = el.getBoundingClientRect();
  return { x: b.x + Math.min(20, b.width / 2), y: b.y + b.height / 2, tag: el.tagName };
});
await page.mouse.click(target.x, target.y);
await page.waitForTimeout(500);
const composer = await page.evaluate(() => {
  const r = document.querySelector("div[data-feedback-pin]").shadowRoot;
  const ta = [...r.querySelectorAll("textarea")].filter((t) => t.getClientRects().length);
  return ta.length;
});
await page.screenshot({ path: "../feedback-pin/smoke-test/out/top-layer-modal.png" });

// Close without saving, then close the modal.
await page.evaluate(() => {
  const r = document.querySelector("div[data-feedback-pin]").shadowRoot;
  r.querySelectorAll("textarea").forEach((t) => (t.value = ""));
});
await page.keyboard.press("Escape");
await page.evaluate(() => document.querySelector("dialog:modal")?.close());
await page.waitForTimeout(300);
const after = await probe();

console.log(JSON.stringify({ opened, before, during, tabToggle, target: target.tag, composerOpen: composer, after }, null, 1));
await browser.close();
