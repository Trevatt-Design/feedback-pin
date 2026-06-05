// Trimmed icon barrel — only the icons reachable from the SDS primitives
// vendored for feedback-pin. Upstream SDS ships ~287 feather icons; the
// dashboard surface only requires four (X, Check, ChevronDown, Search) via
// its primitive set, and the dashboard components themselves render no
// SDS icons directly. See dashboard/web/src/sds/PROVENANCE.md.
export { IconCheck } from "./IconCheck.tsx";
export { IconChevronDown } from "./IconChevronDown.tsx";
export { IconSearch } from "./IconSearch.tsx";
export { IconX } from "./IconX.tsx";
