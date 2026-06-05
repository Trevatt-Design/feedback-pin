/**
 * E2E tests for Batch 1: Sidebar triage upgrade.
 *
 * Two surfaces under test:
 *   - Widget standalone sidebar (smoke-test page) — search + sort + empty states.
 *   - Dashboard /comments list — search + sort controls + URL grouping.
 *
 * The widget IIFE does NOT expose its UI instance globally, so we feed seeded
 * comments via Playwright `page.route()` interception of the API. The widget
 * fetches `${API}/v1/comments?...` on init; we return a fixture payload.
 *
 * Protects (manifest invariants — widget-sidebar-standalone & dashboard-list):
 *   (a) sidebar-renders-search-and-sort-controls
 *   (b) search-filters-by-change-text-why-text-and-url-case-insensitively
 *   (c) sort-newest-is-default-and-orders-by-created-at-desc
 *   (d) sort-preference-persists-via-localStorage
 *   (e) empty-state-distinguishes-no-comments-vs-search-miss-vs-tab-empty
 *   (f) dashboard-groups-by-url-when-multiple-urls-otherwise-flat
 *   (g) dashboard-list-controls-render-search-and-sort
 */

import { test, expect, type Page, type Route } from "@playwright/test";

const PROJECT_TOKEN = "fpt_52c5dbdd0f66b5f9899706d4679d58cfa71f704e"; // matches smoke-test fixture
const API_BASE = "http://localhost:8787";
const DASHBOARD_BASE = "http://localhost:8789";

// -----------------------------------------------------------------------------
// Fixtures
// -----------------------------------------------------------------------------

/** Three seeded comments for the widget standalone sidebar. */
const WIDGET_COMMENTS = [
  {
    id: "c_alpha",
    url: "http://localhost:5173/smoke-test/",
    selector: "h1", dom_path: "html>body>header>h1",
    x_pct: 0.5, y_pct: 0.1, viewport_w: 1280, viewport_h: 800,
    screenshot_key: null, what: "h1",
    change_text: "Make the header bigger",
    why_text: "Looks too small on desktop",
    commenter_name: null, anon_id: "u_one",
    site_wide: 0, metadata: null,
    status: "open",
    created_at: 1_700_000_000_000, // oldest
    resolved_at: null,
  },
  {
    id: "c_beta",
    url: "http://localhost:5173/smoke-test/",
    selector: "p.lede", dom_path: "html>body>header>p",
    x_pct: 0.5, y_pct: 0.2, viewport_w: 1280, viewport_h: 800,
    screenshot_key: null, what: "p.lede",
    change_text: "Tighten this copy",
    why_text: "Wording is verbose",
    commenter_name: null, anon_id: "u_two",
    site_wide: 0, metadata: null,
    status: "resolved",
    created_at: 1_700_000_001_000,
    resolved_at: 1_700_000_500_000,
  },
  {
    id: "c_gamma",
    url: "http://localhost:5173/smoke-test/",
    selector: "h2", dom_path: "html>body>main>section>h2",
    x_pct: 0.4, y_pct: 0.4, viewport_w: 1280, viewport_h: 800,
    screenshot_key: null, what: "h2",
    change_text: "Section heading needs a tweak",
    why_text: null,
    commenter_name: null, anon_id: "u_three",
    site_wide: 0, metadata: null,
    status: "open",
    created_at: 1_700_000_002_000, // newest
    resolved_at: null,
  },
];

/** Dashboard fixtures: one multi-URL set (triggers grouping) and one single-URL set. */
const DASHBOARD_MULTI_URL = [
  { ...WIDGET_COMMENTS[0], url: "http://example.com/pricing", id: "d_a" },
  { ...WIDGET_COMMENTS[2], url: "http://example.com/pricing", id: "d_b" },
  { ...WIDGET_COMMENTS[0], url: "http://example.com/about",   id: "d_c", change_text: "About copy" },
];
const DASHBOARD_SINGLE_URL = [
  { ...WIDGET_COMMENTS[0], url: "http://example.com/pricing", id: "s_a" },
  { ...WIDGET_COMMENTS[2], url: "http://example.com/pricing", id: "s_b" },
];

// -----------------------------------------------------------------------------
// Widget standalone helpers
// -----------------------------------------------------------------------------

/**
 * Stub the API so the widget loads our seeded comments instead of hitting D1.
 * Must be installed BEFORE navigation so the widget's init-time fetch is caught.
 */
async function stubWidgetApi(page: Page, comments: any[]) {
  await page.route(/\/v1\/comments(\?.*)?$/, async (route: Route) => {
    const req = route.request();
    if (req.method() !== "GET") return route.continue();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ comments }),
    });
  });
  // Block any other API call so a stray test doesn't depend on the live API.
  await page.route(/\/v1\/inference$/, (route) => route.fulfill({
    status: 503, contentType: "application/json", body: JSON.stringify({ error: "ai_unavailable" }),
  }));
}

async function loadSmokeTest(page: Page) {
  await page.goto("/smoke-test/?_=" + Date.now(), { waitUntil: "load" });
  await page.waitForFunction(() => !!document.querySelector("[data-feedback-pin]"));
  // Wait for at least one rendered list item OR an empty-state element so we
  // know the sidebar finished its first render after loadComments.
  await page.waitForFunction(() => {
    const sr = (document.querySelector("[data-feedback-pin]") as HTMLElement)?.shadowRoot;
    if (!sr) return false;
    const list = sr.querySelector("[data-list]");
    if (!list) return false;
    return list.querySelector(".fp-item") || list.querySelector(".fp-sidebar-empty");
  });
}

async function readSidebarState(page: Page) {
  return page.evaluate(() => {
    const sr = (document.querySelector("[data-feedback-pin]") as HTMLElement).shadowRoot!;
    const sidebar = sr.querySelector(".fp-sidebar");
    if (!sidebar) return { sidebar: false };
    const search = sidebar.querySelector<HTMLInputElement>("[data-search]");
    const sort = sidebar.querySelector<HTMLSelectElement>("[data-sort]");
    const list = sidebar.querySelector("[data-list]")!;
    const itemTexts = Array.from(list.querySelectorAll(".fp-item .fp-item-text")).map(
      (e) => (e.textContent || "").trim(),
    );
    const empty = list.querySelector(".fp-sidebar-empty");
    return {
      sidebar: true,
      hasSearch: !!search,
      hasSort: !!sort,
      searchPlaceholder: search?.placeholder || "",
      sortValue: sort?.value || "",
      itemTexts,
      itemCount: itemTexts.length,
      emptyText: empty ? (empty.textContent || "").trim() : null,
    };
  });
}

// -----------------------------------------------------------------------------
// Widget standalone: scenarios (a) - (e)
// -----------------------------------------------------------------------------

test.describe("widget sidebar triage (standalone)", () => {
  test("(a) renders search input + sort select alongside the filter tabs", async ({ page }) => {
    await stubWidgetApi(page, WIDGET_COMMENTS);
    await loadSmokeTest(page);

    const s = await readSidebarState(page);
    expect(s.sidebar).toBe(true);
    expect(s.hasSearch).toBe(true);
    expect(s.hasSort).toBe(true);
  });

  test("(b) search filters by change_text / why_text / url, case-insensitively", async ({ page }) => {
    await stubWidgetApi(page, WIDGET_COMMENTS);
    await loadSmokeTest(page);

    // Default filter is "open" — c_alpha + c_gamma visible (c_beta is resolved).
    let s = await readSidebarState(page);
    expect(s.itemCount).toBe(2);
    expect(s.itemTexts).toEqual(expect.arrayContaining([
      "Make the header bigger", "Section heading needs a tweak",
    ]));

    // Type a query that matches change_text only on c_alpha (case-insensitive).
    await page.evaluate(() => {
      const sr = (document.querySelector("[data-feedback-pin]") as HTMLElement).shadowRoot!;
      const inp = sr.querySelector<HTMLInputElement>("[data-search]")!;
      inp.value = "HEADER";
      inp.dispatchEvent(new Event("input", { bubbles: true }));
    });
    s = await readSidebarState(page);
    expect(s.itemCount).toBe(1);
    expect(s.itemTexts[0]).toBe("Make the header bigger");

    // Query that matches only via why_text (open comments only — c_alpha has why_text "Looks too small on desktop").
    await page.evaluate(() => {
      const sr = (document.querySelector("[data-feedback-pin]") as HTMLElement).shadowRoot!;
      const inp = sr.querySelector<HTMLInputElement>("[data-search]")!;
      inp.value = "desktop";
      inp.dispatchEvent(new Event("input", { bubbles: true }));
    });
    s = await readSidebarState(page);
    expect(s.itemCount).toBe(1);
    expect(s.itemTexts[0]).toBe("Make the header bigger");

    // Query that matches via URL (the smoke-test page url contains "smoke-test").
    await page.evaluate(() => {
      const sr = (document.querySelector("[data-feedback-pin]") as HTMLElement).shadowRoot!;
      const inp = sr.querySelector<HTMLInputElement>("[data-search]")!;
      inp.value = "smoke-test";
      inp.dispatchEvent(new Event("input", { bubbles: true }));
    });
    s = await readSidebarState(page);
    // All open comments share this URL — both should remain visible.
    expect(s.itemCount).toBe(2);
  });

  test("(c) default sort is 'newest' and orders by created_at descending", async ({ page }) => {
    await stubWidgetApi(page, WIDGET_COMMENTS);
    await loadSmokeTest(page);

    const s = await readSidebarState(page);
    expect(s.sortValue).toBe("newest");
    // Open comments: c_gamma (newest, created_at=...002000) then c_alpha (oldest, ...000).
    expect(s.itemTexts).toEqual([
      "Section heading needs a tweak", // newer
      "Make the header bigger",        // older
    ]);
  });

  test("(c2) switching to 'oldest' inverts the order", async ({ page }) => {
    await stubWidgetApi(page, WIDGET_COMMENTS);
    await loadSmokeTest(page);

    await page.evaluate(() => {
      const sr = (document.querySelector("[data-feedback-pin]") as HTMLElement).shadowRoot!;
      const sel = sr.querySelector<HTMLSelectElement>("[data-sort]")!;
      sel.value = "oldest";
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const s = await readSidebarState(page);
    expect(s.itemTexts).toEqual([
      "Make the header bigger",        // older first
      "Section heading needs a tweak",
    ]);
  });

  test("(c3) 'unresolved' on the All tab puts open comments before resolved", async ({ page }) => {
    await stubWidgetApi(page, WIDGET_COMMENTS);
    await loadSmokeTest(page);

    // Switch to "All" so the resolved comment is visible.
    await page.evaluate(() => {
      const sr = (document.querySelector("[data-feedback-pin]") as HTMLElement).shadowRoot!;
      const allBtn = sr.querySelector<HTMLButtonElement>('[data-filter="all"]')!;
      allBtn.click();
      const sel = sr.querySelector<HTMLSelectElement>("[data-sort]")!;
      sel.value = "unresolved";
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const s = await readSidebarState(page);
    expect(s.itemTexts).toEqual([
      // Two open comments, newest first within open group.
      "Section heading needs a tweak",
      "Make the header bigger",
      // Then the single resolved comment.
      "Tighten this copy",
    ]);
  });

  test("(d) sort preference persists in localStorage across reload", async ({ page }) => {
    await stubWidgetApi(page, WIDGET_COMMENTS);
    await loadSmokeTest(page);

    // Pick "oldest" and verify localStorage was updated.
    await page.evaluate(() => {
      const sr = (document.querySelector("[data-feedback-pin]") as HTMLElement).shadowRoot!;
      const sel = sr.querySelector<HTMLSelectElement>("[data-sort]")!;
      sel.value = "oldest";
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const stored = await page.evaluate(() => localStorage.getItem("fp_sort"));
    expect(stored).toBe("oldest");

    // Reload and confirm the select restores to "oldest" and order is preserved.
    await page.reload({ waitUntil: "load" });
    await page.waitForFunction(() => !!document.querySelector("[data-feedback-pin]"));
    await page.waitForFunction(() => {
      const sr = (document.querySelector("[data-feedback-pin]") as HTMLElement)?.shadowRoot;
      return !!sr?.querySelector(".fp-item");
    });
    const after = await readSidebarState(page);
    expect(after.sortValue).toBe("oldest");
    expect(after.itemTexts).toEqual([
      "Make the header bigger",
      "Section heading needs a tweak",
    ]);
  });

  test("(e1) 'No comments yet' when the project has zero comments", async ({ page }) => {
    await stubWidgetApi(page, []);
    await loadSmokeTest(page);

    const s = await readSidebarState(page);
    expect(s.itemCount).toBe(0);
    expect(s.emptyText).toBe("No comments yet.");
  });

  test("(e2) 'No comments in this view.' when tab filter hides all", async ({ page }) => {
    // Only resolved comments exist; default "open" tab shows none.
    const onlyResolved = WIDGET_COMMENTS.filter(c => c.status === "resolved");
    await stubWidgetApi(page, onlyResolved);
    await loadSmokeTest(page);

    const s = await readSidebarState(page);
    expect(s.itemCount).toBe(0);
    expect(s.emptyText).toBe("No comments in this view.");
  });

  test('(e3) `No comments matching "..."` when search misses', async ({ page }) => {
    await stubWidgetApi(page, WIDGET_COMMENTS);
    await loadSmokeTest(page);

    await page.evaluate(() => {
      const sr = (document.querySelector("[data-feedback-pin]") as HTMLElement).shadowRoot!;
      const inp = sr.querySelector<HTMLInputElement>("[data-search]")!;
      inp.value = "zzz-nothing-matches";
      inp.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const s = await readSidebarState(page);
    expect(s.itemCount).toBe(0);
    expect(s.emptyText).toBe('No comments matching "zzz-nothing-matches".');
  });
});

// -----------------------------------------------------------------------------
// Dashboard /comments: scenarios (f) - (g)
// -----------------------------------------------------------------------------

/**
 * Stub the dashboard's API calls. As of Batch 7 the dashboard makes a single
 * unfiltered list fetch and buckets statuses client-side:
 *   GET /v1/projects/me
 *   GET /v1/comments              (no querystring; client-side bucketing)
 * It does NOT pass a url= filter on the comments listing.
 *
 * The stub still honours a ?status= filter if one is present so older tests
 * that pre-bucket their fixtures by status keep passing — the regex matches
 * `/v1/comments` with or without a querystring.
 */
async function stubDashboardApi(page: Page, comments: any[]) {
  await page.route(new RegExp(API_BASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "/v1/projects/me$"), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: "p_test", name: "Test Project", share_token: "share_xyz" }),
    });
  });
  await page.route(new RegExp(API_BASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "/v1/comments(\\?.*)?$"), async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const url = new URL(route.request().url());
    const status = url.searchParams.get("status");
    const filtered = status ? comments.filter((c) => c.status === status) : comments;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ comments: filtered }),
    });
  });
}

async function loadDashboardComments(page: Page) {
  // Seed token before navigation so the SPA skips /login.
  await page.addInitScript((token) => {
    localStorage.setItem("fp_token", token);
  }, PROJECT_TOKEN);

  await page.goto(DASHBOARD_BASE + "/#/comments", { waitUntil: "load" });
  // Wait for the controls to render (search + sort) — proves the React tree mounted.
  await page.waitForSelector(".controls .search", { state: "visible" });
  await page.waitForSelector("#fp-comments-sort", { state: "attached" });
}

test.describe("dashboard /comments triage", () => {
  test("(g) renders search input and sort select in the controls row", async ({ page }) => {
    await stubDashboardApi(page, DASHBOARD_SINGLE_URL);
    await loadDashboardComments(page);

    const search = page.locator(".controls .search");
    const sort = page.locator("#fp-comments-sort");
    await expect(search).toBeVisible();
    await expect(sort).toBeAttached();

    // Sort options match the documented whitelist.
    const opts = await sort.locator("option").allTextContents();
    expect(opts).toEqual(["Newest", "Oldest", "Unresolved first"]);
  });

  test("(f1) groups comments by URL when more than one URL is present", async ({ page }) => {
    await stubDashboardApi(page, DASHBOARD_MULTI_URL);
    await loadDashboardComments(page);

    // Wait for the grouped view to render — it uses .group-head with [aria-expanded].
    await page.waitForSelector(".group-head");
    const groupHeads = page.locator(".group-head");
    const count = await groupHeads.count();
    // Two distinct URLs in fixture → two groups.
    expect(count).toBe(2);

    // Each group has a path label and a count badge.
    const paths = await page.locator(".group-head .path").allTextContents();
    expect(paths).toEqual(expect.arrayContaining(["/pricing", "/about"]));
  });

  test("(f2) renders a flat list (no group headings) when only one URL is present", async ({ page }) => {
    await stubDashboardApi(page, DASHBOARD_SINGLE_URL);
    await loadDashboardComments(page);

    // Wait for at least one list-item to render.
    await page.waitForSelector(".list-item");
    const groupHeads = page.locator(".group-head");
    expect(await groupHeads.count()).toBe(0);

    // Both items present, in the flat .card.list.
    const items = page.locator(".card.list .list-item");
    expect(await items.count()).toBe(2);
  });

  test("(f3) collapsing a group hides its rows", async ({ page }) => {
    await stubDashboardApi(page, DASHBOARD_MULTI_URL);
    await loadDashboardComments(page);

    await page.waitForSelector(".group-head");
    const firstHead = page.locator(".group-head").first();
    // Initially expanded.
    await expect(firstHead).toHaveAttribute("aria-expanded", "true");
    await firstHead.click();
    await expect(firstHead).toHaveAttribute("aria-expanded", "false");
  });
});
