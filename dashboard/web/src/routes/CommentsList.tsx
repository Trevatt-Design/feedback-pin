/**
 * CommentsList route: page head with the Open / Resolved switch, the
 * search + sort bar, then either `GroupedCommentList` (more than one URL
 * in view) or the flat `CommentList`.
 *
 * Keyboard: "/" search, j / k move between rows, Enter opens.
 * The visible order is saved to sessionStorage so the detail page can
 * step to the previous and next comment.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  readSortPref,
  sortComments,
  commentMatchesQuery,
  type Comment,
  type Project,
  type SortMode,
} from "../lib/api";
import { AppShell } from "../components/AppShell";
import { ListControls } from "../components/ListControls";
import {
  CommentList,
  GroupedCommentList,
} from "../components/GroupedCommentList";
import "./CommentsList.css";

type SidebarTab = "open" | "resolved";
export const LIST_ORDER_KEY = "fp_list_order";
const TAB_KEY = "fp_list_tab";

function readTab(): SidebarTab {
  try {
    return sessionStorage.getItem(TAB_KEY) === "resolved" ? "resolved" : "open";
  } catch {
    return "open";
  }
}

export interface CommentsListProps {
  onOpen: (id: string) => void;
}

export function CommentsList({ onOpen }: CommentsListProps) {
  const [project, setProject] = useState<Project | null>(null);
  const [tab, setTabState] = useState<SidebarTab>(readTab);
  const [all, setAll] = useState<Comment[] | null>(null);
  const [err, setErr] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>(readSortPref);

  const setTab = (t: SidebarTab) => {
    setTabState(t);
    try {
      sessionStorage.setItem(TAB_KEY, t);
    } catch {
      /* swallow */
    }
  };

  const refresh = useCallback(async () => {
    try {
      const [p, res] = await Promise.all([
        api<Project>("/v1/projects/me"),
        api<{ comments: Comment[] }>("/v1/comments"),
      ]);
      setProject(p);
      setAll(res.comments || []);
    } catch (caught) {
      setErr(caught instanceof Error ? caught.message : "Refresh failed");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const inOpen = (c: Comment) => c.status === "open" || c.status === "in-progress";
  const counts = useMemo(() => {
    const list = all || [];
    const open = list.filter(inOpen).length;
    return { open, resolved: list.length - open };
  }, [all]);
  const items = useMemo(
    () => (all || []).filter((c) => (tab === "open" ? inOpen(c) : !inOpen(c))),
    [all, tab],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? items.filter((c) => commentMatchesQuery(c, q)) : items;
    return sortComments(filtered, sort);
  }, [items, query, sort]);

  const distinctUrls = useMemo(() => new Set(visible.map((c) => c.url)), [visible]);
  const shouldGroup = distinctUrls.size > 1;

  // Row order as rendered (grouped order differs from sorted order).
  const renderedOrder = useMemo(() => {
    if (!shouldGroup) return visible.map((c) => c.id);
    const groups = new Map<string, string[]>();
    for (const c of visible) {
      const g = groups.get(c.url || "") || [];
      g.push(c.id);
      groups.set(c.url || "", g);
    }
    return Array.from(groups.values()).flat();
  }, [visible, shouldGroup]);

  useEffect(() => {
    try {
      sessionStorage.setItem(LIST_ORDER_KEY, JSON.stringify(renderedOrder));
    } catch {
      /* swallow */
    }
  }, [renderedOrder]);

  // j / k between rows.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key !== "j" && e.key !== "k") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      const rows = Array.from(document.querySelectorAll<HTMLButtonElement>(".list-item"));
      if (!rows.length) return;
      e.preventDefault();
      const i = rows.indexOf(document.activeElement as HTMLButtonElement);
      const next = e.key === "j" ? Math.min(rows.length - 1, i + 1) : Math.max(0, i < 0 ? 0 : i - 1);
      rows[next].focus();
      rows[next].scrollIntoView({ block: "nearest" });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const q = query.trim();
  let emptyMessage: string;
  let emptyHint: string | undefined;
  if (all && all.length === 0) {
    emptyMessage = "No comments yet";
    emptyHint = "Comments left with the widget will appear here.";
  } else if (q && visible.length === 0) {
    emptyMessage = `Nothing matches “${q}”`;
    emptyHint = "Try fewer words, or clear the search.";
  } else if (tab === "open") {
    emptyMessage = "All caught up";
    emptyHint = "There are no open comments.";
  } else {
    emptyMessage = "Nothing resolved yet";
  }

  if (err) {
    return (
      <AppShell section="comments" project={project}>
        <main className="fp-page" tabIndex={-1} id="main">
          <div className="fp-err" role="alert">
            {err}
          </div>
        </main>
      </AppShell>
    );
  }

  const pages = new Set((all || []).map((c) => c.url)).size;

  return (
    <AppShell section="comments" project={project}>
      <main className="fp-page is-narrow" tabIndex={-1} id="main">
        <div className="fp-page-head">
          <div>
            <h1 className="fp-h1">Comments</h1>
            <p className="fp-h-sub">
              {all
                ? `${counts.open} open across ${pages} ${pages === 1 ? "page" : "pages"}`
                : "Loading…"}
            </p>
          </div>
          {/* Native buttons, not SDS Tabs: RAC's colon-bearing generated ids
              fail axe aria-valid-attr-value. `.tabs` / `.tab` are e2e hooks. */}
          <div className="fp-seg tabs" role="tablist" aria-label="Comment status">
            <button
              type="button"
              role="tab"
              className={"tab" + (tab === "open" ? " is-active" : "")}
              aria-selected={tab === "open" ? "true" : "false"}
              onClick={() => setTab("open")}
            >
              Open <span className="fp-count">{counts.open}</span>
            </button>
            <button
              type="button"
              role="tab"
              className={"tab" + (tab === "resolved" ? " is-active" : "")}
              aria-selected={tab === "resolved" ? "true" : "false"}
              onClick={() => setTab("resolved")}
            >
              Resolved <span className="fp-count">{counts.resolved}</span>
            </button>
          </div>
        </div>
        <ListControls
          query={query}
          setQuery={setQuery}
          sort={sort}
          setSort={setSort}
          totalForPlaceholder={items.length}
        />
        {all === null ? (
          <div className="card list" aria-busy="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <div className="list-skel" key={i}>
                <span className="fp-skel" style={{ width: 72, height: 52 }} />
                <span className="list-skel-lines">
                  <span className="fp-skel" style={{ width: "60%", height: 12 }} />
                  <span className="fp-skel" style={{ width: "30%", height: 10 }} />
                </span>
              </div>
            ))}
          </div>
        ) : shouldGroup ? (
          <GroupedCommentList
            items={visible}
            onOpen={onOpen}
            emptyMessage={emptyMessage}
            emptyHint={emptyHint}
          />
        ) : (
          <CommentList
            items={visible}
            onOpen={onOpen}
            emptyMessage={emptyMessage}
            emptyHint={emptyHint}
          />
        )}
        {all && visible.length ? (
          <p className="fp-list-foot">
            <span className="fp-kbd">J</span> <span className="fp-kbd">K</span> to move,{" "}
            <span className="fp-kbd">↵</span> to open, <span className="fp-kbd">/</span> to search
          </p>
        ) : null}
      </main>
    </AppShell>
  );
}
