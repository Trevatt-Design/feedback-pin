/**
 * GroupedCommentList — flat list when one URL, collapsible groups when
 * the visible set spans more than one distinct page URL. Pin numbering
 * stays global across groups (per the dashboard-list invariant
 * `pin-numbering-stays-global-across-groups`).
 *
 * Each row: screenshot thumbnail cropped to the pin, the comment, then
 * status · author · time. Rows are real <button>s (axe nested-interactive).
 */
import { useState } from "react";
import { Tag } from "primitives";
import "./GroupedCommentList.css";
import {
  isClosedStatus,
  screenshotUrl,
  statusLabel,
  type Comment,
} from "../lib/api";
import { authorName, displayPath, fmtFull, fmtShort, pinFraction } from "../lib/format";
import { StatusPill } from "./StatusPill";
import { IconImage, IconInbox } from "./icons";

export interface GroupedCommentListProps {
  items: Comment[];
  onOpen: (id: string) => void;
  emptyMessage: string;
  emptyHint?: string;
}

function Empty({ message, hint }: { message: string; hint?: string }) {
  return (
    <div className="card list">
      <div className="list-empty">
        <span className="list-empty-icon">
          <IconInbox />
        </span>
        <div className="list-empty-title">{message}</div>
        {hint ? <div className="list-empty-hint">{hint}</div> : null}
      </div>
    </div>
  );
}

export function CommentList({ items, onOpen, emptyMessage, emptyHint }: GroupedCommentListProps) {
  if (!items.length) return <Empty message={emptyMessage} hint={emptyHint} />;
  return (
    <div className="card list">
      {items.map((c, i) => (
        <CommentRow key={c.id} c={c} n={i + 1} onOpen={onOpen} showPath />
      ))}
    </div>
  );
}

function Thumb({ c }: { c: Comment }) {
  const [broken, setBroken] = useState(false);
  const x = pinFraction(c.x_pct);
  const y = pinFraction(c.y_pct);
  if (!c.screenshot_key || broken) {
    return (
      <span className="list-thumb is-empty" aria-hidden="true">
        <IconImage />
      </span>
    );
  }
  const pos = x != null && y != null ? `${(x * 100).toFixed(1)}% ${(y * 100).toFixed(1)}%` : "50% 0%";
  return (
    <span className="list-thumb" aria-hidden="true">
      <img
        src={screenshotUrl(c.screenshot_key)}
        alt=""
        loading="lazy"
        decoding="async"
        style={{ objectPosition: pos }}
        onError={() => setBroken(true)}
      />
      {x != null && y != null ? (
        <span className="list-thumb-pin" style={{ left: `${x * 100}%`, top: `${y * 100}%` }} />
      ) : null}
    </span>
  );
}

interface CommentRowProps {
  c: Comment;
  n: number;
  onOpen: (id: string) => void;
  showPath?: boolean;
}

function CommentRow({ c, n, onOpen, showPath }: CommentRowProps) {
  const closed = isClosedStatus(c.status);
  return (
    <button
      type="button"
      className={"list-item" + (closed ? " is-closed" : "")}
      data-comment-id={c.id}
      onClick={() => onOpen(c.id)}
    >
      <Thumb c={c} />
      <div className="list-body">
        <div className="ti">{c.change_text}</div>
        <div className="list-meta">
          <span className="list-status">
            <StatusPill status={c.status} />
            <span>{statusLabel(c.status)}</span>
          </span>
          {c.site_wide ? (
            <Tag scheme="brand" variant="primary">
              Site-wide
            </Tag>
          ) : null}
          <span className="list-dot" aria-hidden="true" />
          <span>{authorName(c)}</span>
          <span className="list-dot" aria-hidden="true" />
          <time dateTime={new Date(c.created_at).toISOString()} title={fmtFull(c.created_at)}>
            {fmtShort(c.created_at)}
          </time>
          {showPath ? (
            <>
              <span className="list-dot" aria-hidden="true" />
              <span className="list-meta-url">{displayPath(c.url)}</span>
            </>
          ) : null}
        </div>
      </div>
      <div className="list-num" aria-label={`Pin ${n}`}>
        {n}
      </div>
    </button>
  );
}

export function GroupedCommentList({ items, onOpen, emptyMessage, emptyHint }: GroupedCommentListProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  if (!items.length) return <Empty message={emptyMessage} hint={emptyHint} />;
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
        const path = displayPath(g.url);
        return (
          <section key={g.url} className="group">
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
              <span className="group-count">
                {g.items.length} {g.items.length === 1 ? "comment" : "comments"}
              </span>
            </button>
            {isOpen ? (
              <div className="card list">
                {g.items.map((c) => {
                  n += 1;
                  return <CommentRow key={c.id} c={c} n={n} onOpen={onOpen} />;
                })}
              </div>
            ) : (
              (() => {
                n += g.items.length;
                return null;
              })()
            )}
          </section>
        );
      })}
    </div>
  );
}
