# SDS vendoring provenance

- **Source repository:** https://github.com/figma/sds
- **Upstream commit SHA:** `be440d804c525a0d5654900161988edbe9754575`
- **Retrieved on:** 2026-05-01
- **License:** MIT (see `./LICENSE`)

## What was vendored

Copied verbatim from upstream `src/`:

- `theme.css` — full token set (color primitives + semantic roles, sizing,
  typography composites, shadows). Local edits at vendoring time:
  - removed `@media (prefers-color-scheme: dark)` block (lines 236–376 in
    upstream) — dark mode is intentionally not supported.
  - prepended `:root { color-scheme: light }`.
  - appended a `@media (prefers-reduced-motion: reduce)` override.
- `reset.css`
- `LICENSE`

Copied verbatim from upstream `src/ui/primitives/`:

- `Avatar/`, `Button/`, `Dialog/`, `Fieldset/`, `Icon/`, `IconButton/`,
  `Input/`, `Link/`, `ListBox/`, `Logo/`, `Menu/`, `Notification/`,
  `Search/`, `Select/`, `Switch/`, `Tab/`, `Tag/`, `Text/`, `Textarea/`,
  `Tooltip/`
- `index.ts` (trimmed locally to just the primitives above; the upstream
  barrel exports primitives feedback-pin does not vendor — `Accordion`,
  `Checkbox`, `Image`, `Navigation`, `Pagination`, `Radio`, `Slider`,
  `Table`)

Copied verbatim from upstream:

- `src/ui/icons/` — only the four icons reachable from the vendored
  primitive set (`IconCheck`, `IconChevronDown`, `IconSearch`, `IconX`).
  Upstream ships ~287 feather icons; the dashboard renders no SDS icons
  directly and the primitives only consume those four (Tag/Dialog/
  Notification/Search use IconX; Search uses IconSearch; Menu/Select use
  IconChevronDown; Select uses IconCheck). The barrel `index.ts` was
  trimmed to match. To add more icons later, copy them from upstream and
  add to the barrel.
- `src/ui/utils/` (`AnchorOrButton.tsx`, `index.ts`)
- `src/ui/hooks/` (`useMediaQuery.tsx`, `index.ts`)
- `src/ui/layout/Flex/` (depended on by `Text`)
- `src/ui/layout/index.ts` rewritten locally to export only `Flex`
  (upstream exports `Flex`, `Section`, `Grid`; we vendor only `Flex`).

## What was NOT vendored

- React app shell (`App.tsx`, `main.tsx`, `index.css`, `responsive.css`,
  `index.d.ts`, `vite-env.d.ts`)
- Storybook + stories (`src/stories/`)
- Examples (`src/examples/`, `src/data/`)
- Figma plugin source (`src/figma/`)
- Compositions (`src/ui/compositions/`)
- Layout components other than `Flex` (`Section`, `Grid`)
- Build/dev scripts (`scripts/`, `figma.config.json`, `vite.config.ts`,
  `tsconfig.json`, `package.json`)

## Type-check fixups

Upstream SDS (commit `be440d80…`) contains a handful of type-checker
mismatches against the React 18 + react-aria-components 1.10 versions
the dashboard pins. The runtime behaviour is unchanged; the edits are
purely in the type position. Documenting them here so a future
re-vendor can re-apply or replace as needed.

- `ui/primitives/Text/Text.tsx` — added `import React`; cast 9× style
  object literals carrying `--text-truncate-line-clamp` to
  `React.CSSProperties`.
- `ui/layout/Flex/Flex.tsx` — added `import React`; cast the inline
  style object (CSS custom properties) to `React.CSSProperties`.
- `ui/primitives/Button/Button.tsx` — both `Button` and `ButtonDanger`:
  cast `sharedProps` to `React.ComponentProps<typeof RACLink>` /
  `<typeof RACButton>` at the JSX boundary; renamed unused destructured
  `style` to `_style` to satisfy `noUnusedLocals`.
- `ui/utils/AnchorOrButton.tsx` — same pattern as Button.tsx.

## Audit notes

Each vendored file was scanned at copy time for `fetch(`, `eval(`,
`gtag`, `analytics`, `telemetry`, and `sendBeacon` references — none
were found. The primitives are pure presentational React components on
top of `react-aria-components`.

## Editing rule

Do not edit primitives or `theme.css` directly. Local additions go into
`dashboard/web/src/components/` (e.g. the project-layer `IconButton`
wrapper in `dashboard/web/src/components/IconButton.tsx`). Token additions
go into a sibling `tokens.local.css` if needed. When upstream SDS issues
a meaningful bugfix, re-vendor by re-running the steps above and bumping
the SHA in this document.
