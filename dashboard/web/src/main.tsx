/**
 * Vite entry. Mounts <App /> on #root.
 *
 * Side-effect imports (in order):
 *   1. Inter + Roboto Mono — self-hosted via @fontsource (no Google Fonts,
 *      Stage 3 amendment).
 *   2. Vendored SDS reset.css → theme.css.
 *   3. Project-level app.css (color-scheme, body background, focus reset).
 *
 * The `package.json` `sideEffects: ["**\/*.css"]` field keeps these CSS
 * imports from being tree-shaken away while still allowing unused JS
 * primitives to be dropped.
 */
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/roboto-mono/400.css";

import "./sds/reset.css";
import "./sds/theme.css";
import "./app.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("#root element missing — index.html shell broken");
}
createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
