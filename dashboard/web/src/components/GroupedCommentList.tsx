/**
 * GroupedCommentList — flat list when one URL, collapsible groups when
 * the visible set spans more than one distinct page URL. Pin numbering
 * stays global across groups (per the dashboard-list invariant
 * `pin-numbering-stays-global-across-groups`).
 *
 * The flat fallback path is also exposed via `CommentList` for callers
 * that explicitly want flat (e.g. when grouping is disabled by data).
 *
 * Row density is compact (Stage 3 amendment): row padding =
 * --sds-size-space-200 (~8px), body text 13px, meta text body-small.
 */
import { useState } from "react";
import { Tag } from "primitives";
import "./GroupedCommentList.css";
import { fmtTime, isClosedStatus, urlPathname, type Comment } from "../lib/api";
import { StatusPill } from "./StatusPill";

export interface GroupedCommentListProps {
  items: Comment[];
  onOpen: (id: string) => void;
  emptyMessage: string;
}

export function CommentList({ items, onOpen, emptyMessage }: GroupedCommentListProps) {
  if (!items.length) {
    return (
      <div className="card list">
        <div className="list-empty">{emptyMessage}</div>
      </div>
    );
  }
  return (
    <div className="card list">
      {items.map((c, i) => (
        <CommentRow key={c.id} c={c} n={i + 1} onOpen={onOpen} />
      ))}
    </div>
  );
}

interface CommentRowProps {
  c: Comment;
  n: number;
  onOpen: (id: string) => void;
}
/**
 * Row container is a real <button>. axe's `nested-interactive` rule
 * fires when an element with role=button contains a focusable child
 * (e.g. an <a href>); the previous shape (a div with role=button
 * holding an inline page-URL anchor) tripped the rule. Now the row IS
 * a button, the URL pathname displays as static text, and there are
 * no focusable descendants.
 */
function CommentRow({ c, n, onOpen }: CommentRowProps) {
  return (
    <button
      type="button"
      className={"list-item" + (isClosedStatus(c.status) ? " is-closed" : "")}
      onClick={() => onOpen(c.id)}
    >
      <div className="list-num">{n}</div>
      <div className="list-body">
        <div className="ti">{c.change_text}</div>
        <div className="list-meta">
          {c.site_wide ? (
            <Tag scheme="brand" variant="primary">
              Site-wide
            </Tag>
          ) : null}
          <StatusPill status={c.status} />
          <span>{c.anon_id ? c.anon_id.slice(0, 6) : "Anonymous"}</span>
          <span aria-hidden="true">·</span>
          <span>{fmtTime(c.created_at)}</span>
          <span aria-hidden="true">·</span>
          <span className="list-meta-url">{urlPathname(c.url)}</span>
        </div>
      </div>
    </button>
  );
}

export function GroupedCommentList({ items, onOpen, emptyMessage }: GroupedCommentListProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  if (!items.length) {
    return (
      <div className="card list">
        <div className="list-empty">{emptyMessage}</div>
      </div>
    );
  }
  // Build groups in first-seen order (the input is already sorted).
  const groups: { url: string; items: Comment[] }[] = [];
  const idx = new Map<string, number>();
  for (const c of items) {
    const u = c.url || "";
    if (!idx.has(u)) {
      idx.set(u, groups.length);
      groups.push({ url: u, items: [] });
    }
    groups[idx.get(u)!].items.push(c);
  }
  let n = 0;
  return (
    <div>
      {groups.map((g) => {
        const isOpen = !collapsed[g.url];
        const path = urlPathname(g.url);
        return (
          <div key={g.url} className="group">
            <button
              className="group-head"
              type="button"
              aria-expanded={isOpen ? "true" : "false"}
              onClick={() => setCollapsed({ ...collapsed, [g.url]: isOpen })}
            >
              <svg
                className="group-chev"
                viewBox="0 0 12 12"
                width={10}
                height={10}
                aria-hidden="true"
              >
                <path
                  d="M2 4l4 4 4-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="path" title={g.url}>
                {path}
              </span>
              <span className="group-count">{g.items.length}</span>
            </button>
            {isOpen ? (
              <div className="card list">
                {g.items.map((c) => {
                  n += 1;
                  return <CommentRow key={c.id} c={c} n={n} onOpen={onOpen} />;
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
