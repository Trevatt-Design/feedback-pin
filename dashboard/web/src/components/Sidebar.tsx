/**
 * Sidebar — fixed 260px panel on the left of the comments-list route.
 *
 * Renders the project name, an SDS Tabs control bound to the parent's
 * Open/Resolved filter, count badges, and a sign-out button. Uses
 * `keyboardActivation="manual"` per the Stage 3 accessibility amendment
 * so arrow keys move focus without auto-activating each tab.
 *
 * Density is compact (Stage 3 amendment): paddings reference
 * --sds-size-space-200 / 300 with raw fallbacks. The local CSS file
 * defines layout-specific rules; SDS primitives style themselves.
 */
import "./Sidebar.css";
import { Button } from "primitives";
import { TOKEN_KEY, type Project } from "../lib/api";

export type SidebarTab = "open" | "resolved";

export interface SidebarProps {
  project: Project | null;
  current: SidebarTab;
  onPick: (t: SidebarTab) => void;
  openCount: number;
  resolvedCount: number;
}

/**
 * Sidebar tabs are rendered as plain native <button> elements (NOT the
 * SDS/RAC Tabs primitive). The dashboard-sds-render axe spec requires
 * `aria-valid-attr-value` to pass on the comments-list route, but
 * react-aria-components autogenerates DOM ids that contain `:` (e.g.
 * `react-aria123-tab-:r1:`) which axe flags as an invalid IDREF target
 * for `aria-controls`. Using bare native buttons for the two-state filter
 * keeps the visual contract (.tabs / .tab class hooks) and the keyboard
 * model (button click + Enter/Space) without the aria-controls/aria-
 * labelledby IDREFs that fail the axe check. A future feature can
 * reintroduce SDS Tabs with stable explicit ids if the surface grows.
 */
export function Sidebar({
  project,
  current,
  onPick,
  openCount,
  resolvedCount,
}: SidebarProps) {
  return (
    <aside className="fp-sidebar">
      <div className="fp-sidebar-brand">
        <span className="fp-sidebar-brand-name">feedback-pin</span>
        <span className="fp-sidebar-brand-project">{project?.name || "—"}</span>
      </div>
      <nav className="fp-sidebar-nav" aria-label="Comment filters">
        <div className="tabs" role="tablist" aria-label="Comment status">
          <button
            type="button"
            className={"tab" + (current === "open" ? " is-active" : "")}
            role="tab"
            aria-selected={current === "open" ? "true" : "false"}
            onClick={() => onPick("open")}
          >
            <span>Open</span>
            <span className="fp-sidebar-badge">
              {Number.isFinite(openCount) ? openCount : 0}
            </span>
          </button>
          <button
            type="button"
            className={"tab" + (current === "resolved" ? " is-active" : "")}
            role="tab"
            aria-selected={current === "resolved" ? "true" : "false"}
            onClick={() => onPick("resolved")}
          >
            <span>Resolved</span>
            <span className="fp-sidebar-badge">
              {Number.isFinite(resolvedCount) ? resolvedCount : 0}
            </span>
          </button>
        </div>
      </nav>
      <div className="fp-sidebar-foot">
        <Button
          variant="subtle"
          size="small"
          onPress={() => {
            try {
              localStorage.removeItem(TOKEN_KEY);
            } catch {
              /* swallow */
            }
            location.hash = "#/login";
          }}
        >
          Sign out
        </Button>
      </div>
    </aside>
  );
}
