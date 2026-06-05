# Smoke test

End-to-end test of feedback-pin running entirely on your machine. No deploy required.

You'll run three things in three terminals:

1. The **API worker** (port 8787) — local D1 + R2 simulator via Wrangler.
2. The **dashboard worker** (port 8788) — designer side.
3. A **static server** for `smoke-test/index.html` (port 5173) — the host site.

Then open the static page, leave comments, and watch them appear in the dashboard.

---

## One-time setup

```bash
# from repo root
cd api
npm install
npx wrangler d1 create feedback-pin     # paste database_id into api/wrangler.toml
npm run db:init                          # creates the schema in local D1
cd ..
```

You don't need to create the R2 bucket for the smoke test — Wrangler simulates R2 locally.

---

## Run the smoke test

**Terminal 1 — API**
```bash
cd api
npx wrangler dev
# now serving at http://localhost:8787
```

**Terminal 2 — create a project**
```bash
# from repo root
node scripts/create-project.mjs --name "Smoke test"
# copy the printed token (starts with fpt_)
```

Edit `smoke-test/index.html` and paste the token into `data-project-token="..."` near the bottom.

**Terminal 3 — dashboard**
```bash
cd dashboard
npx wrangler dev --port 8788
```

**Terminal 4 — static server for the test page**
```bash
# from repo root (NOT inside smoke-test, so the widget script is reachable)
npx http-server . -p 5173 -c-1
# visit http://localhost:5173/smoke-test/
```

(If you don't have `http-server`, `npx serve -l 5173` or `python3 -m http.server 5173` work too — both serve the current directory.)

---

## Verify

In the browser:

1. Open `http://localhost:5173/smoke-test/`. The "Leave feedback" button should appear bottom-right.
2. Click it. Cursor changes to crosshair, a banner appears.
3. Hover over the heading — a teal outline should follow the cursor.
4. Click the heading. A panel opens with three fields (Change, Why, Name).
5. Fill in "Change" with anything, click Send. Panel closes, a numbered pin appears on the heading.
6. Refresh the page. The pin should reappear in the same place.
7. Click the pin. Thread popover opens. Type a reply, send it.

In a second tab, open `http://localhost:8788`:

8. Login screen appears. Paste the same token. Continue.
9. Sidebar shows "Open" with count 1. The comment list shows the comment you just left.
10. Click into it. Detail page shows the screenshot (if capture worked), the change/why fields, the page link, and the thread including your reply.
11. Click "Reply" as designer. Send a reply.
12. Back in the host page tab, click the pin again. The designer reply should now show.
13. Click "Mark resolved" in the dashboard. Pin on the host page goes grey on next refresh.

If all 13 work, the system is live. Note any gaps.

---

## Common issues

- **"invalid or missing token"** — you didn't update `data-project-token` in `index.html` after creating the project.
- **CORS error in browser console** — confirm the API is on `:8787` and `data-api="http://localhost:8787"` matches.
- **"NETWORK error" on screenshot** — the test page probably has a cross-origin image. Screenshot is best-effort and the comment still gets through; check the API request in DevTools.
- **Dashboard says "Unauthorised"** — token doesn't match. Recreate via `create-project.mjs` and paste the new one.
- **Pin in wrong place after layout change** — that's the test. Edit some CSS in `index.html`, refresh, and confirm the pin still anchors via DOM-path or coord fallback.
