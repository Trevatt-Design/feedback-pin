/**
 * E2E tests for Batch 7 (Triage statuses).
 *
 * Three surfaces:
 *   - Dashboard /comments (StatusPill, status <select> in detail, tab buckets)
 *   - Wrapper /review sidebar (StatusPill renders four colours)
 *   - Widget standalone sidebar (thread top <select>, pin greyout for wont-fix)
 *
 * The fp-feature pipeline expects deterministic tests, so all comment fetches
 * are stubbed via page.route() — no live D1 writes from this file.
 *
 * Protects (manifest invariants — landing in stage 7):
 *   (a) status-route-accepts-all-four-and-rejects-others-with-400
 *       — covered at the API layer; here we exercise the UI calling it
 *   (b) closed-bucket-includes-resolved-and-wont-fix-for-greyout-and-tabs
 *   (c) status-enum-allows-open-in-progress-wont-fix-resolved
 *   (d) widget-pins.thread-actions-at-top  — the new <select> sits in the
 *       top action row alongside delete (when isMine)
 */

import { test, expect, type Page, type Route } from "@playwright/test";

const PROJECT_TOKEN = "fpt_52c5dbdd0f66b5f9899706d4679d58cfa71f704e";
const SHARE_TOKEN = "shr_6314107901b64bcd1fb395e45fe6103e";
const API_BASE = "http://localhost:8787";
const DASHBOARD_BASE = "http://localhost:8789";
const SMOKE_URL = "http://localhost:5173/smoke-test/";

// -----------------------------------------------------------------------------
// Fixtures: one comment per status, sharing a stable URL for the wrapper case.
// -----------------------------------------------------------------------------

const baseComment = {
  selector: "h1", dom_path: "html>body>header>h1",
  x_pct: 0.5, y_pct: 0.1, viewport_w: 1280, viewport_h: 800,
  screenshot_key: null, what: "h1",
  why_text: "exercise pill colour",
  commenter_name: null, anon_id: "u_widgetuser",
  site_wide: 0, metadata: null,
  resolved_at: null,
};

function makeFourStateFixtures(url: string) {
  return [
    { ...baseComment, id: "c_open",   url, change_text: "Open one",         status: "open",        created_at: 1_700_000_000_000 },
    { ...baseComment, id: "c_inprog", url, change_text: "In-progress one",  status: "in-progress", created_at: 1_700_000_001_000 },
    { ...baseComment, id: "c_wf",     url, change_text: "Won't-fix one",    status: "wont-fix",    created_at: 1_700_000_002_000 },
    { ...baseComment, id: "c_res",    url, change_text: "Resolved one",     status: "resolved",    created_at: 1_700_000_003_000, resolved_at: 1_700_000_500_000 },
  ];
}

// -----------------------------------------------------------------------------
// Dashboard /comments — StatusPill in row meta, <select> in detail.
// -----------------------------------------------------------------------------

/**
 * Stub the dashboard's API:
 *   GET /v1/projects/me
 *   GET /v1/comments         (single fetch — engineer note)
 *   GET /v1/comments/:id     (detail load)
 *   POST /v1/comments/:id/status  (status mutation)
 *
 * `comments` is a live closure mutated in-place when the dashboard POSTs to
 * /status, so subsequent re-fetches reflect the new state.
 */
async function stubDashboard(page: Page, comments: any[]) {
  await page.route(/\/v1\/projects\/me$/, async (route: Route) => {
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ id: "p_test", name: "Test Project", share_token: SHARE_TOKEN }),
    });
  });
  // Single-fetch list (no status filter): respond with everything.
  await page.route(/\/v1\/comments(\?[^/]*)?$/, async (route: Route) => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ comments }),
    });
  });
  // Detail.
  await page.route(/\/v1\/comments\/[a-zA-Z0-9_-]+$/, async (route: Route) => {
    if (route.request().method() !== "GET") return route.continue();
    const id = route.request().url().split("/").pop()!.split("?")[0];
    const c = comments.find(x => x.id === id);
    if (!c) return route.fulfill({ status: 404, body: '{"error":"not found"}' });
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ comment: c, replies: [] }),
    });
  });
  // Status POST: parse body, mutate fixture, ack.
  await page.route(/\/v1\/comments\/[a-zA-Z0-9_-]+\/status$/, async (route: Route) => {
    if (route.request().method() !== "POST") return route.continue();
    const id = route.request().url().split("/").slice(-2, -1)[0];
    let body: any = {};
    try { body = JSON.parse(route.request().postData() || "{}"); } catch {}
    const c = comments.find(x => x.id === id);
    if (!c) return route.fulfill({ status: 404, body: '{"error":"not found"}' });
    c.status = body.status;
    c.resolved_at = body.status === "resolved" ? Date.now() : null;
    await route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
  });
}

async function loadDashboardComments(page: Page) {
  await page.addInitScript((token) => { localStorage.setItem("fp_token", token); }, PROJECT_TOKEN);
  await page.goto(DASHBOARD_BASE + "/#/comments", { waitUntil: "load" });
  await page.waitForSelector(".controls .search", { state: "visible" });
}

test.describe("dashboard /comments — triage statuses", () => {
  test("(b) Open tab buckets open + in-progress; Resolved tab buckets resolved + wont-fix", async ({ page }) => {
    const fixtures = makeFourStateFixtures("http://example.com/triage");
    await stubDashboard(page, fixtures);
    await loadDashboardComments(page);

    // Default tab is "open" — should show 2 rows (open + in-progress).
    await page.waitForSelector(".list-item");
    let texts = await page.locator(".card.list .list-item .ti").allTextContents();
    expect(texts.sort()).toEqual(["In-progress one", "Open one"].sort());

    // Switch to Resolved tab — should show 2 rows (resolved + wont-fix).
    await page.locator(".tab", { hasText: "Resolved" }).click();
    // Wait until the rows under .card.list match the resolved-bucket exactly.
    // The component re-fetches on tab change (refresh has `tab` in deps), so
    // there's a one-frame gap during which the old open-bucket rows are still
    // visible.
    await page.waitForFunction(() => {
      const items = Array.from(document.querySelectorAll<HTMLElement>(".card.list .list-item .ti"));
      const txt = items.map(e => (e.textContent || "").trim()).sort();
      return items.length === 2 && txt.join("|") === ["Resolved one", "Won't-fix one"].sort().join("|");
    });
    texts = await page.locator(".card.list .list-item .ti").allTextContents();
    expect(texts.sort()).toEqual(["Resolved one", "Won't-fix one"].sort());
  });

  test("StatusPill renders one of the four colour classes per row", async ({ page }) => {
    const fixtures = makeFourStateFixtures("http://example.com/triage");
    await stubDashboard(page, fixtures);
    await loadDashboardComments(page);

    // Open tab covers status-open + status-in-progress.
    await page.waitForSelector(".list-item .status-pill");
    const openClasses = await page.locator(".list-item .status-pill").evaluateAll(
      els => els.map(e => e.className)
    );
    expect(openClasses.some(c => c.includes("status-open"))).toBe(true);
    expect(openClasses.some(c => c.includes("status-in-progress"))).toBe(true);

    // Resolved tab covers status-wont-fix + status-resolved.
    await page.locator(".tab", { hasText: "Resolved" }).click();
    // Wait for the resolved-bucket pills to render — the tab change triggers
    // refresh() which re-fetches /v1/comments and re-renders the list.
    await page.waitForFunction(() => {
      const pills = Array.from(document.querySelectorAll<HTMLElement>(".card.list .list-item .status-pill"));
      if (pills.length !== 2) return false;
      const cls = pills.map(p => p.className).join(" ");
      return cls.includes("status-wont-fix") && cls.includes("status-resolved");
    });
    const resolvedClasses = await page.locator(".list-item .status-pill").evaluateAll(
      els => els.map(e => e.className)
    );
    expect(resolvedClasses.some(c => c.includes("status-wont-fix"))).toBe(true);
    expect(resolvedClasses.some(c => c.includes("status-resolved"))).toBe(true);
  });

  test("(a)+(c) detail-view <select> changes status, row pill updates, row moves between tabs", async ({ page }) => {
    const fixtures = makeFourStateFixtures("http://example.com/triage");
    await stubDashboard(page, fixtures);
    await loadDashboardComments(page);

    // Open the "Open one" detail.
    await page.waitForSelector(".list-item");
    await page.locator(".list-item", { hasText: "Open one" }).click();

    // Status select is present, has all four wire values, and reflects the
    // current "open" state.
    const select = page.locator("#fp-status-select");
    await expect(select).toBeVisible();
    const options = await select.locator("option").evaluateAll(
      els => (els as HTMLOptionElement[]).map(o => o.value)
    );
    expect(options).toEqual(["open", "in-progress", "wont-fix", "resolved"]);
    await expect(select).toHaveValue("open");

    // Flip to "wont-fix" via the select.
    await select.selectOption("wont-fix");
    // Detail view re-loads via load() after the POST resolves; wait for the
    // pill in the detail panel to gain the new colour.
    await page.waitForFunction(() => {
      const sel = document.querySelector("#fp-status-select") as HTMLSelectElement | null;
      return sel?.value === "wont-fix";
    });

    // Back to list — the row's pill class is now status-wont-fix and (b) it
    // moved to the "Resolved" tab bucket.
    await page.locator(".btn", { hasText: "Back to list" }).click();

    await page.locator(".tab", { hasText: "Resolved" }).click();
    await page.waitForSelector(".list-item:has-text(\"Open one\")");
    const movedRow = page.locator(".list-item", { hasText: "Open one" });
    await expect(movedRow).toBeVisible();
    // The row carries `is-closed` (greyout) since wont-fix is closed.
    await expect(movedRow).toHaveClass(/is-closed/);
    // And the pill on it is now status-wont-fix.
    const pillCls = await movedRow.locator(".status-pill").getAttribute("class");
    expect(pillCls).toMatch(/status-wont-fix/);
  });
});

// -----------------------------------------------------------------------------
// Wrapper /review sidebar — pills in row meta render the four colours.
// -----------------------------------------------------------------------------

async function stubWrapper(page: Page, comments: any[]) {
  await page.route(/\/v1\/projects\/me$/, async (route: Route) => {
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ id: "p_test", name: "Test Project", share_token: SHARE_TOKEN }),
    });
  });
  // Wrapper requests /v1/comments?url=...
  await page.route(/\/v1\/comments\?[^/]*url=/, async (route: Route) => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ comments }),
    });
  });
}

test.describe("wrapper /review sidebar — triage pills", () => {
  test("renders status pills with the four colour classes on the All tab", async ({ page }) => {
    const fixtures = makeFourStateFixtures(SMOKE_URL);
    await stubWrapper(page, fixtures);

    const url = `${DASHBOARD_BASE}/review?url=${encodeURIComponent(SMOKE_URL)}&token=${PROJECT_TOKEN}`;
    await page.goto(url, { waitUntil: "load" });
    await page.waitForSelector(".sidebar .tabs button");

    // Switch to "All" so all four pills are visible.
    await page.locator(".sidebar .tabs button", { hasText: "All" }).click();
    await page.waitForFunction(() => {
      return document.querySelectorAll(".sidebar .item .status-pill").length === 4;
    });

    const classes = await page.locator(".sidebar .item .status-pill").evaluateAll(
      els => els.map(e => e.className)
    );
    expect(classes.some(c => c.includes("status-open"))).toBe(true);
    expect(classes.some(c => c.includes("status-in-progress"))).toBe(true);
    expect(classes.some(c => c.includes("status-wont-fix"))).toBe(true);
    expect(classes.some(c => c.includes("status-resolved"))).toBe(true);

    // Open tab buckets open + in-progress.
    await page.locator(".sidebar .tabs button", { hasText: "Open" }).click();
    await page.waitForFunction(() => {
      const items = document.querySelectorAll(".sidebar .item");
      return items.length === 2;
    });
    const openTexts = await page.locator(".sidebar .item .text").allTextContents();
    expect(openTexts.sort()).toEqual(["In-progress one", "Open one"].sort());
  });
});

// -----------------------------------------------------------------------------
// Widget standalone sidebar — thread top <select> drives /status, pin greys
// out for wont-fix via the renamed `is-closed` class.
// -----------------------------------------------------------------------------

async function stubWidgetApi(page: Page, comments: any[]) {
  // Widget GET /v1/comments — return seeded fixtures.
  await page.route(/\/v1\/comments(\?[^/]*)?$/, async (route: Route) => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ comments }),
    });
  });
  // Detail GET (thread).
  await page.route(/\/v1\/comments\/[a-zA-Z0-9_-]+$/, async (route: Route) => {
    if (route.request().method() !== "GET") return route.continue();
    const id = route.request().url().split("/").pop()!.split("?")[0];
    const c = comments.find(x => x.id === id);
    if (!c) return route.fulfill({ status: 404, body: '{"error":"not found"}' });
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ comment: c, replies: [] }),
    });
  });
  // POST /status — mutate fixture and ack.
  await page.route(/\/v1\/comments\/[a-zA-Z0-9_-]+\/status$/, async (route: Route) => {
    if (route.request().method() !== "POST") return route.continue();
    const id = route.request().url().split("/").slice(-2, -1)[0];
    let body: any = {};
    try { body = JSON.parse(route.request().postData() || "{}"); } catch {}
    const c = comments.find(x => x.id === id);
    if (!c) return route.fulfill({ status: 404, body: '{"error":"not found"}' });
    c.status = body.status;
    c.resolved_at = body.status === "resolved" ? Date.now() : null;
    await route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
  });
  // Block any other API call so a stray test doesn't depend on the live API.
  await page.route(/\/v1\/inference$/, (route) => route.fulfill({
    status: 503, contentType: "application/json", body: JSON.stringify({ error: "ai_unavailable" }),
  }));
}

async function loadSmokeTest(page: Page) {
  await page.goto("/smoke-test/?_=" + Date.now(), { waitUntil: "load" });
  await page.waitForFunction(() => !!document.querySelector("[data-feedback-pin]"));
  await page.waitForFunction(() => {
    const sr = (document.querySelector("[data-feedback-pin]") as HTMLElement)?.shadowRoot;
    if (!sr) return false;
    const list = sr.querySelector("[data-list]");
    if (!list) return false;
    return list.querySelector(".fp-item") || list.querySelector(".fp-sidebar-empty");
  });
}

test.describe("widget standalone sidebar — triage statuses", () => {
  test("Open tab buckets open + in-progress; pin for wont-fix has is-closed", async ({ page }) => {
    // The widget seeds its own anon_id, so we override the fixture anon_id
    // dynamically once the widget reports it. For this test we only need to
    // exercise tab bucketing (anon_id-independent) and pin classes.
    const fixtures = makeFourStateFixtures(SMOKE_URL);
    await stubWidgetApi(page, fixtures);
    await loadSmokeTest(page);

    // Default "Open" tab — confirm bucketing matches: open + in-progress only.
    const openTexts = await page.evaluate(() => {
      const sr = (document.querySelector("[data-feedback-pin]") as HTMLElement).shadowRoot!;
      return Array.from(sr.querySelectorAll(".fp-item .fp-item-text")).map(e => (e.textContent || "").trim());
    });
    expect(openTexts.sort()).toEqual(["In-progress one", "Open one"].sort());

    // Switch to "All" so the wont-fix pin is observable in the DOM.
    await page.evaluate(() => {
      const sr = (document.querySelector("[data-feedback-pin]") as HTMLElement).shadowRoot!;
      const allBtn = sr.querySelector<HTMLButtonElement>('[data-filter="all"]')!;
      allBtn.click();
    });

    // Resolved tab buckets resolved + wont-fix.
    await page.evaluate(() => {
      const sr = (document.querySelector("[data-feedback-pin]") as HTMLElement).shadowRoot!;
      const btn = sr.querySelector<HTMLButtonElement>('[data-filter="resolved"]')!;
      btn.click();
    });
    const resolvedTexts = await page.evaluate(() => {
      const sr = (document.querySelector("[data-feedback-pin]") as HTMLElement).shadowRoot!;
      return Array.from(sr.querySelectorAll(".fp-item .fp-item-text")).map(e => (e.textContent || "").trim());
    });
    expect(resolvedTexts.sort()).toEqual(["Resolved one", "Won't-fix one"].sort());

    // Pin greyout (is-closed) applies to BOTH wont-fix and resolved entries —
    // the rename from is-resolved → is-closed is broadened, not weakened.
    const pinClasses = await page.evaluate(() => {
      const sr = (document.querySelector("[data-feedback-pin]") as HTMLElement).shadowRoot!;
      const pins = Array.from(sr.querySelectorAll<HTMLElement>(".fp-pin"));
      return pins.map(p => ({ aria: p.getAttribute("aria-label") || "", cls: p.className }));
    });
    // We only know there should be at least one wont-fix and one resolved pin
    // with `is-closed`, and at least one open/in-progress pin without it.
    const closedPins = pinClasses.filter(p => p.cls.includes("is-closed"));
    const openPins = pinClasses.filter(p => !p.cls.includes("is-closed"));
    expect(closedPins.length).toBeGreaterThanOrEqual(2); // wont-fix + resolved
    expect(openPins.length).toBeGreaterThanOrEqual(2);   // open + in-progress
  });

  test("thread top <select> updates status (status-change-via-thread-top-select)", async ({ page }) => {
    // Make the open comment authored by the widget's own anon_id so the
    // delete button is wired (proving the top action row is rendered) — but
    // the <select> renders regardless of authorship, so this is belt-and-
    // braces. The widget reads its uid from localStorage; we seed it.
    const widgetUid = "u_widgetuser_e2e";
    await page.addInitScript((uid) => {
      try { localStorage.setItem("fp_uid", uid); } catch {}
    }, widgetUid);

    const fixtures = makeFourStateFixtures(SMOKE_URL).map(c => ({ ...c, anon_id: widgetUid }));
    await stubWidgetApi(page, fixtures);
    await loadSmokeTest(page);

    // Click the first list row to open the thread panel.
    await page.evaluate(() => {
      const sr = (document.querySelector("[data-feedback-pin]") as HTMLElement).shadowRoot!;
      const row = sr.querySelector<HTMLElement>(".fp-item")!;
      row.click();
    });

    // Wait for the thread panel + status select.
    await page.waitForFunction(() => {
      const sr = (document.querySelector("[data-feedback-pin]") as HTMLElement)?.shadowRoot;
      return !!sr?.querySelector(".fp-panel [data-act=\"status\"]");
    });

    // Confirm the four wire values are present, in order.
    const opts = await page.evaluate(() => {
      const sr = (document.querySelector("[data-feedback-pin]") as HTMLElement).shadowRoot!;
      const sel = sr.querySelector<HTMLSelectElement>('[data-act="status"]')!;
      return Array.from(sel.options).map(o => o.value);
    });
    expect(opts).toEqual(["open", "in-progress", "wont-fix", "resolved"]);

    // Capture the API call and confirm the mutation goes through /status with
    // the chosen wire value (status-change-via-thread-top-select).
    const statusReq = page.waitForRequest(req =>
      req.url().includes("/status") && req.method() === "POST"
    );
    await page.evaluate(() => {
      const sr = (document.querySelector("[data-feedback-pin]") as HTMLElement).shadowRoot!;
      const sel = sr.querySelector<HTMLSelectElement>('[data-act="status"]')!;
      sel.value = "wont-fix";
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const req = await statusReq;
    expect(req.url()).toMatch(/\/v1\/comments\/[^/]+\/status$/);
    const body = JSON.parse(req.postData() || "{}");
    expect(body.status).toBe("wont-fix");
  });
});
