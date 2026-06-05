/**
 * StatusPill — small dot indicating triage state.
 *
 * The class names (`fp-status-open`, `fp-status-in-progress`,
 * `fp-status-wont-fix`, `fp-status-resolved`) are mirrored from
 * `widget/src/tokens.ts` so widget and dashboard cannot drift on triage
 * colours. The styles are defined in the dashboard's local `app.css`
 * (this component) using the same SDS tokens the widget consumes.
 *
 * The wrapping <span role="status"> + aria-label is per the Stage 3
 * accessibility amendment so screen readers announce the change when the
 * pill rerenders with a new status.
 */
import "./StatusPill.css";
import { statusLabel, type CommentStatus } from "../lib/api";

export interface StatusPillProps {
  status: CommentStatus;
}

export function StatusPill({ status }: StatusPillProps) {
  const label = statusLabel(status);
  // The unprefixed `status-pill` + `status-<wire>` class names are the
  // contract Playwright assertions read against (see
  // tests/e2e/triage-statuses.spec.ts). Mirror these in
  // dashboard/web/src/components/StatusPill.css using the same SDS tokens
  // the widget consumes so the surfaces cannot drift on triage colours.
  return (
    <span role="status" aria-label={`Status: ${label}`} title={label}>
      <span className={`status-pill status-${status}`} aria-hidden="true" />
    </span>
  );
}
