/**
 * E2E for dashboard-review (the #/review route).
 *
 * Invariants covered:
 *   - review-defaults-to-needs-decision: only items awaiting a decision or
 *     under discussion show on load.
 *   - review-card-shows-context: a card shows the comment text, the design
 *     reference (screen key, Figma link, quoted Notion) and the verdict.
 *   - review-decision-sends-actor: Approve posts /decision with the
 *     reviewer's name in x-fp-actor.
 *   - review-decline-needs-note: Decline with an empty note does not call
 *     the API and shows an error.
 *   - axe wcag2aa serious+critical clean on #/review.
 *
 * API is stubbed so the spec doesn't depend on a seeded D1.
 */
import { test, expect, type Page, type Route } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const DASHBOARD = "http://localhost:8789";

const PROJECT = { id: "p_rev", name: "Review Test", share_token: "shr", approvers: ["Michael"] };
const COMMENTS = [
  {
    id: "c_one", url: "app://delete-account", change_text: "This should be a sheet.", why_text: null,
    status: "in-progress", created_at: Date.now() - 60_000, resolved_at: null, screenshot_key: null,
    metadata: null, anon_id: null, site_wide: 0,
  },
  {
    id: "c_two", url: "app://wallet", change_text: "Wallet broken.", why_text: null,
    status: "in-progress", created_at: Date.now() - 50_000, resolved_at: null, screenshot_key: null,
    metadata: null, anon_id: null, site_wide: 0,
  },
];
const now = Date.now();
const ITEMS = [
  {
    id: "i_flag", ref: "FB-001", round: "r1", title: "Delete account as a sheet", kind: "command",
    outcome: "conflict", verdict: "F12-09 is a full screen in the design.",
    design: JSON.stringify({
      screen_key: "F12-09",
      figma_url: "https://www.figma.com/design/abcDEF123/?node-id=1-2",
      notion: [{ label: "Links database", url: "https://example.com/links", quote: "F12-20 Delete account Navigate F12-09" }],
    }),
    proposal: JSON.stringify({ summary: "Make F12-09 a sheet.", effects: ["Figma: rebuild F12-09"] }),
    stage: "awaiting-decision", decision: null, decided_by: null, decided_at: null,
    created_at: now, updated_at: now, comment_ids: "c_one",
  },
  {
    id: "i_fix", ref: "FB-002", round: "r1", title: "Wallet sheet", kind: "command",
    outcome: "build-fix", verdict: "Design has it.", design: null, proposal: null,
    stage: "ready-to-build", decision: null, decided_by: null, decided_at: null,
    created_at: now, updated_at: now, comment_ids: "c_two",
  },
];

async function load(page: Page, posts: Array<{ url: string; actor: string | null; body: string }>) {
  await page.addInitScript(() => {
    try { localStorage.setItem("fp_token", "fpt_test_review"); localStorage.setItem("fp_actor", "Michael"); } catch {}
  });
  await page.route(/\/v1\/projects\/me$/, (r: Route) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(PROJECT) }));
  await page.route(/\/v1\/comments(\?.*)?$/, (r: Route) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ comments: COMMENTS }) }));
  await page.route(/\/v1\/items(\?.*)?$/, (r: Route) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: ITEMS, rounds: [{ round: "r1", items: 2, waiting: 1 }] }) }),
  );
  await page.route(/\/v1\/items\/[^/]+\/(decision|stage)$/, async (r: Route) => {
    const req = r.request();
    posts.push({ url: req.url(), actor: (await req.allHeaders())["x-fp-actor"] ?? null, body: req.postData() || "" });
    await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
  await page.goto(`${DASHBOARD}/#/review`, { waitUntil: "load" });
  await page.waitForSelector(".fp-item, .fp-review-empty");
}

test.describe("dashboard review route", () => {
  test("defaults to items needing a decision, with full context", async ({ page }) => {
    await load(page, []);
    const cards = page.locator(".fp-item");
    await expect(cards).toHaveCount(1);
    const card = cards.first();
    await expect(card).toContainText("FB-001");
    await expect(card).toContainText("This should be a sheet.");
    await expect(card).toContainText("F12-09");
    await expect(card).toContainText("F12-20 Delete account Navigate F12-09");
    await expect(card).toContainText("F12-09 is a full screen in the design.");
    await expect(card).toContainText("Make F12-09 a sheet.");
    await expect(card.getByRole("link", { name: "Open in Figma" })).toHaveAttribute("href", /figma\.com/);
  });

  test("In progress filter shows the build fix with its stage action", async ({ page }) => {
    await load(page, []);
    await page.getByRole("button", { name: /^In progress/ }).click();
    const card = page.locator(".fp-item");
    await expect(card).toHaveCount(1);
    await expect(card).toContainText("FB-002");
    await expect(card.getByRole("button", { name: "Mark built" })).toBeVisible();
  });

  test("Approve posts the decision with the reviewer as actor", async ({ page }) => {
    const posts: Array<{ url: string; actor: string | null; body: string }> = [];
    await load(page, posts);
    await page.getByRole("button", { name: "Approve" }).click();
    await expect.poll(() => posts.length).toBe(1);
    expect(posts[0].url).toMatch(/\/v1\/items\/i_flag\/decision$/);
    expect(posts[0].actor).toBe("Michael");
    expect(JSON.parse(posts[0].body).decision).toBe("approve");
  });

  test("Decline without a note does not call the API", async ({ page }) => {
    const posts: Array<{ url: string; actor: string | null; body: string }> = [];
    await load(page, posts);
    await page.getByRole("button", { name: "Decline" }).click();
    await expect(page.locator(".fp-item .fp-err")).toContainText("Add a note");
    expect(posts.length).toBe(0);
  });

  test("axe: zero serious or critical wcag2aa violations on #/review", async ({ page }) => {
    await load(page, []);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const blocking = results.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => ({ id: v.id, help: v.help, first: v.nodes[0]?.target }));
    expect(blocking).toEqual([]);
  });
});
