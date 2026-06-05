# PLAN v2 — feedback-pin pivot to review-wrapper + drop-in widget

Layered on top of `PLAN.md`. Reflects feedback from 2026-04-28.

## Surfaces

1. **Drop-in widget** (existing, heavily revised). Used when client visits the live site directly.
2. **Review wrapper** (NEW). A feedback-pin URL that loads any host URL in an iframe, with a top toolbar and right sidebar around it. This is where viewport switching, share links, and the comments sidebar live. The host page inside the iframe runs the drop-in widget too — the wrapper communicates with it via postMessage.

## What changes from v1

### Widget UX
- **Default to Comment mode** when the page loads. FAB becomes a segmented toggle: Comment ⇄ Browse.
- **Cursor in Comment mode** is a comment-bubble icon.
- **Highlight colour**: chartreuse `#C7FF00` — vivid, rarely used.
- **Selected element stays highlighted** while the comment box is open and during typing.
- **Two-step comment flow:** input morphs from "Add comment" → "Why" placeholder after first submit. Both mandatory.
- **Submit:** small up-arrow icon button only. No Cancel button (X only).
- **Remove descriptive hint text** under labels.
- **Site-wide / Just this one** checkbox above submit.
- **Remove name field.** Replaced with anonymous unique ID stored in `localStorage` (`fp_uid`).
- **Keyboard:** `C` toggles modes, `Esc Esc` (within ~700ms) leaves Comment mode, `Cmd/Ctrl+Return` submits.
- **Hover on primary button:** replace `filter: brightness` with a proper background-darken.
- **Edit / delete own comments**: pencil + trash icons on sidebar items where `anon_id` matches.
- **Sidebar:** right-edge slide-out panel listing all comments on the current page. Filter (open/resolved/all), sort (newest/oldest), per-item actions.
- **Screenshot:** keep viewport screenshot, fix silent fail. Capture WITHOUT widget chrome and WITHOUT the highlight overlay.
- **Metadata capture:** UA, platform, language, screen, dpr, viewport. Sent with comment, dashboard-only.

### API additions
- New columns on `comments`: `anon_id TEXT`, `site_wide INTEGER`, `metadata TEXT (JSON)`, `updated_at INTEGER`.
- New column on `projects`: `share_token TEXT UNIQUE` (for public read-only link).
- New endpoints:
  - `PATCH /v1/comments/:id` (auth: project token + matching `x-fp-uid` header)
  - `DELETE /v1/comments/:id` (same auth)
  - `GET /v1/public/comments?project_share=TOKEN` (no project-token, returns project name + open comments only, read-only)

### Review wrapper (new Worker route)
- Lives on the dashboard worker at `/review`.
- Query params: `?url=https://target&project=fpt_xxx&viewport=desktop`
- UI: top toolbar (back, project name, segmented viewport switcher [desktop/tablet/mobile], mode toggle, share button, comment count). Right sidebar (comments list). Center: iframe with the host URL loaded.
- Host page must include the feedback-pin widget script. Wrapper detects via postMessage handshake. If the host doesn't have it, show a "host site needs the feedback-pin widget installed" empty state.
- Viewport sizes:
  - Desktop: full width
  - Tablet: 820 × 1180 (iPad)
  - Mobile: 390 × 844 (iPhone 14)
- Share button: copies a public link with `?share=<share_token>&viewport=...&open=...`. Recipient sees the wrapper in read-only mode.

### Visual design
- Move toward **FigJam UI**: chunky friendly, soft cardy shadows, segmented controls, generous radius (12–14px), a touch of personality without being childish. Inter font stack as fallback when SF Pro isn't available.
- Drop the cooler greys for warmer off-whites. Keep accent strictly on the chartreuse highlight; primary buttons stay calm.

## Build order (this iteration)

1. **Schema migration** (`schema-v2.sql`) — new columns, new index.
2. **API updates** — new endpoints, new fields, share token, anon-id check.
3. **Widget rewrite** — UX + visual restyle in place.
4. **Wrapper page** — new route on dashboard worker.
5. **Dashboard** — show site_wide, metadata, anon_id.
6. **Smoke test** — re-verify against the original 13 steps + new behaviours.

## Out of scope for this iteration

- True account system (anon ID is the bridge until then).
- AI triage.
- SPA route awareness in widget.
- Cross-origin iframe DOM access (we use postMessage instead — no DOM access needed).
