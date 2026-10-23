/**
 * ListControls — search input + sort select. Persists sort to
 * localStorage under `fp_sort` (shared with widget + wrapper).
 *
 * Both controls are plain native HTML elements (input[type=search] +
 * <select>) rather than SDS primitives. The e2e suite at
 * tests/e2e/sidebar-triage.spec.ts targets `.controls .search` and
 * `#fp-comments-sort` directly, and SDS Search wraps its native input
 * inside a RAC ComboBox/Popover that breaks those structural selectors.
 *
 * "/" focuses the search from anywhere on the page.
 */
import { useEffect, useRef } from "react";
import "./ListControls.css";
import { type SortMode } from "../lib/api";
import { IconSearch } from "./icons";

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
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      ref.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const placeholder = `Search ${totalForPlaceholder} comment${
    totalForPlaceholder === 1 ? "" : "s"
  }…`;
  return (
    <div className="controls">
      <div className="controls-search">
        <IconSearch />
        <input
          ref={ref}
          type="search"
          className="input search"
          data-search
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setQuery("");
              e.currentTarget.blur();
            }
          }}
          placeholder={placeholder}
          aria-label="Search comments"
        />
        {query ? null : <span className="fp-kbd" aria-hidden="true">/</span>}
      </div>
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
