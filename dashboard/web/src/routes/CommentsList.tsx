/**
 * CommentsList route. Ports `Comments()` and the inline `Sidebar` /
 * `CommentList` / `CommentRow` helpers from the previous monolith
 * (dashboard/src/index.ts:499-569).
 *
 * Layout: 260px Sidebar on the left, list panel on the right. The
 * list panel shows the title row, ListControls (search + sort), then
 * either `GroupedCommentList` (more than one URL in view) or the
 * flat `CommentList`.
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
import { Sidebar, type SidebarTab } from "../components/Sidebar";
import { ListControls } from "../components/ListControls";
import {
  CommentList,
  GroupedCommentList,
} from "../components/GroupedCommentList";
import "./CommentsList.css";

export interface CommentsListProps {
  onOpen: (id: string) => void;
}

export function CommentsList({ onOpen }: CommentsListProps) {
  const [project, setProject] = useState<Project | null>(null);
  const [tab, setTab] = useState<SidebarTab>("open");
  const [items, setItems] = useState<Comment[]>([]);
  const [counts, setCounts] = useState<{ open: number; resolved: number }>({
    open: 0,
    resolved: 0,
  });
  const [err, setErr] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>(readSortPref);

  const refresh = useCallback(async () => {
    try {
      const [p, all] = await Promise.all([
        api<Project>("/v1/projects/me"),
        api<{ comments: Comment[] }>("/v1/comments"),
      ]);
      setProject(p);
      const allComments = all.comments || [];
      const inOpen = (c: Comment) =>
        c.status === "open" || c.status === "in-progress";
      const inResolved = (c: Comment) =>
        c.status === "resolved" || c.status === "wont-fix";
      const openCount = allComments.filter(inOpen).length;
      const resolvedCount = allComments.filter(inResolved).length;
      setCounts({ open: openCount, resolved: resolvedCount });
      setItems(allComments.filter(tab === "open" ? inOpen : inResolved));
    } catch (caught) {
      setErr(caught instanceof Error ? caught.message : "Refresh failed");
    }
  }, [tab]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Search → sort. Search is case-insensitive substring on the same fields
  // the widget uses (change_text, why_text, url).
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? items.filter((c) => commentMatchesQuery(c, q)) : items;
    return sortComments(filtered, sort);
  }, [items, query, sort]);

  const totalAcross = (counts.open || 0) + (counts.resolved || 0);
  const noneAtAll = totalAcross === 0;
  const q = query.trim();
  let emptyMessage: string;
  if (noneAtAll) emptyMessage = "No comments yet.";
  else if (q && visible.length === 0)
    emptyMessage = `No comments matching "${q}".`;
  else
    emptyMessage =
      tab === "open" ? "No open comments yet." : "Nothing resolved yet.";

  const distinctUrls = new Set(visible.map((c) => c.url));
  const shouldGroup = distinctUrls.size > 1;

  if (err) {
    return (
      <main className="fp-app-main" tabIndex={-1} id="main">
        <div className="fp-err" role="alert">
          {err}
        </div>
      </main>
    );
  }

  return (
    <div className="fp-app">
      <Sidebar
        project={project}
        current={tab}
        onPick={(t) => setTab(t)}
        openCount={counts.open}
        resolvedCount={counts.resolved}
      />
      <main className="fp-app-main" tabIndex={-1} id="main">
        <h1 className="fp-h1">
          {tab === "open" ? "Open comments" : "Resolved comments"}
        </h1>
        <p className="fp-h-sub">
          {project?.name ? `for ${project.name}` : ""}
        </p>
        <ListControls
          query={query}
          setQuery={setQuery}
          sort={sort}
          setSort={setSort}
          totalForPlaceholder={items.length}
        />
        {shouldGroup ? (
          <GroupedCommentList
            items={visible}
            onOpen={onOpen}
            emptyMessage={emptyMessage}
          />
        ) : (
          <CommentList
            items={visible}
            onOpen={onOpen}
            emptyMessage={emptyMessage}
          />
        )}
      </main>
    </div>
  );
}
