# Install — feedback-pin

How to add feedback-pin to a host site.

## Script tag

Drop this just before `</body>` on every page where you want feedback enabled:

```html
<script src="https://your-cdn/feedback-pin.js"
        data-project-token="fpt_xxxxxxxxxxxxxxxxxxxxxxxx"
        data-api="https://feedback-pin-api.your-account.workers.dev"
        defer></script>
```

That's it. A "Leave feedback" button appears bottom-right. Anyone visiting the page can click any element and leave a comment.

## Programmatic init

If you don't want auto-init, omit the data-attributes and call:

```html
<script src="https://your-cdn/feedback-pin.js" defer></script>
<script>
  window.addEventListener("DOMContentLoaded", () => {
    FeedbackPin.init({
      token: "fpt_…",
      api: "https://feedback-pin-api.your-account.workers.dev",
    });
  });
</script>
```

## Project tokens

Each site gets its own token. Tokens are not user secrets — they're meant to be embedded in client-side code. If you need to rotate one, create a new project and replace the token.

To restrict where a token can be used, set an origin allowlist when you create the project:

```bash
node scripts/create-project.mjs --name "Acme" --origin "https://acme.com" --remote
```

The API will reject `POST /v1/comments` from any origin other than `https://acme.com`.

## Pin behaviour

- Pins anchor to elements via CSS selector first, DOM path second, viewport % third.
- After a layout change, the selector usually still resolves. If it doesn't, the DOM path catches it. If neither does, the pin falls back to a percentage of the viewport — visually approximate but never lost.

## Screenshots

The widget tries to capture a viewport screenshot at comment time using `html-to-image`. If the page has cross-origin images that block canvas capture, the comment still goes through without a screenshot. The dashboard handles "no screenshot" gracefully.

## Removing the widget

Delete the script tag. Existing comments stay in the database; nothing renders without the widget present.

## Privacy

- The widget collects: page URL, viewport size, the element clicked, the comment text, optional name, and an optional screenshot.
- It does not capture cookies, form contents, keystrokes, mouse trails, or any identifying data the user hasn't typed in the comment form.
- The token is visible in client HTML by design. Treat it like a public site key.
