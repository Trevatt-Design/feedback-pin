/**
 * ListControls — search input + sort select. Persists sort to
 * localStorage under `fp_sort` (shared with widget + wrapper).
 *
 * Both controls are plain native HTML elements (input[type=search] +
 * <select>) rather than SDS primitives. The e2e suite at
 * tests/e2e/sidebar-triage.spec.ts targets `.controls .search` and
 * `#fp-comments-sort` directly, and SDS Search wraps its native input
 * inside a RAC ComboBox/Popover that breaks those structural selectors.
 * Sort using a native <select> also matches the wrapper sidebar.
 */
import "./ListControls.css";
import { type SortMode } from "../lib/api";

export interface ListControlsProps {
  query: string;
  setQuery: (q: string) => void;
  sort: SortMode;
  setSort: (s: SortMode) => void;
  totalForPlaceholder: number;
}

export function ListControls({
  query,
  setQuery,
  sort,
  setSort,
  totalForPlaceholder,
}: ListControlsProps) {
  const placeholder = `Search ${totalForPlaceholder} comment${
    totalForPlaceholder === 1 ? "" : "s"
  }…`;
  return (
    <div className="controls">
      <input
        type="search"
        className="input search"
        data-search
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
        placeholder={placeholder}
        aria-label="Search comments"
      />
      <label className="fp-visually-hidden" htmlFor="fp-comments-sort">
        Sort comments
      </label>
      <select
        id="fp-comments-sort"
        className="sort"
        value={sort}
        onChange={(e) => {
          const v = e.currentTarget.value;
          const next: SortMode =
            v === "newest" || v === "oldest" || v === "unresolved" ? v : "newest";
          setSort(next);
          try {
            localStorage.setItem("fp_sort", next);
          } catch {
            /* swallow */
          }
        }}
      >
        <option value="newest">Newest</option>
        <option value="oldest">Oldest</option>
        <option value="unresolved">Unresolved first</option>
      </select>
    </div>
  );
}
