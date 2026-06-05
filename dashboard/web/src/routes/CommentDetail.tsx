/**
 * CommentDetail route. Ports `CommentDetail()` from the previous
 * monolith (dashboard/src/index.ts:384-497). Two-column layout:
 *   - left: screenshot + element / page panel
 *   - right (380px): change/why/from/scope panel + thread + reply box
 *
 * Status is a native `<select id="fp-status-select">` with four wire
 * values (open, in-progress, wont-fix, resolved). The "Won't fix"
 * label is displayed but the wire value remains hyphenated. The native
 * element (rather than SDS Select) is required by the e2e contract at
 * tests/e2e/triage-statuses.spec.ts which reads `option.value`s
 * directly via `select.locator("option")` — react-aria-components
 * portals its options into a popover ListBox that lives outside the
 * <select> in the DOM tree.
 */
import { useCallback, useEffect, useState } from "react";
import { Button, Textarea } from "primitives";
import {
  api,
  fmtTime,
  STATUS_OPTIONS,
  TOKEN_KEY,
  API_URL,
  type Comment,
  type CommentStatus,
  type Reply,
} from "../lib/api";
import { StatusPill } from "../components/StatusPill";
import "./CommentDetail.css";

export interface CommentDetailProps {
  id: string;
  onBack: () => void;
}

interface DetailResponse {
  comment: Comment;
  replies: Reply[];
}

export function CommentDetail({ id, onBack }: CommentDetailProps) {
  const [data, setData] = useState<DetailResponse | null>(null);
  // `err` blocks rendering when the initial load fails. `actionErr` is a
  // non-blocking banner for in-action failures (status update / reply post)
  // — it surfaces the message inline without erasing the loaded comment.
  const [err, setErr] = useState("");
  const [actionErr, setActionErr] = useState("");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [screenshotBroken, setScreenshotBroken] = useState(false);

  const load = useCallback(async () => {
    setErr("");
    setScreenshotBroken(false);
    try {
      const j = await api<DetailResponse>("/v1/comments/" + id);
      setData(j);
    } catch (caught) {
      setErr(caught instanceof Error ? caught.message : "Load failed");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (err) {
    return (
      <main className="fp-detail-shell" tabIndex={-1} id="main">
        <Button variant="neutral" size="small" onPress={onBack} className="btn">
          ← Back
        </Button>
        <div className="fp-err" role="alert" style={{ marginTop: 16 }}>
          {err}
        </div>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="fp-detail-shell" tabIndex={-1} id="main">
        Loading…
      </main>
    );
  }

  const c = data.comment;
  const replies = data.replies;
  const tok = (() => {
    try {
      return localStorage.getItem(TOKEN_KEY) || "";
    } catch {
      return "";
    }
  })();
  const screenshotUrl = c.screenshot_key
    ? API_URL +
      "/v1/screenshots/" +
      encodeURIComponent(c.screenshot_key) +
      "?token=" +
      encodeURIComponent(tok)
    : null;

  const sendReply = async () => {
    if (busy) return;
    if (!reply.trim()) return;
    setBusy(true);
    setActionErr("");
    try {
      await api("/v1/comments/" + id + "/replies", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ author: "designer", body: reply.trim() }),
      });
      setReply("");
      await load();
    } catch (caught) {
      setActionErr(caught instanceof Error ? caught.message : "Reply failed");
    }
    setBusy(false);
  };

  const setStatus = async (next: CommentStatus) => {
    if (next === c.status) return;
    setBusy(true);
    setActionErr("");
    try {
      await api("/v1/comments/" + id + "/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      await load();
    } catch (caught) {
      setActionErr(caught instanceof Error ? caught.message : "Status update failed");
    }
    setBusy(false);
  };

  return (
    <main className="fp-detail-shell" tabIndex={-1} id="main">
      <Button
        variant="neutral"
        size="small"
        onPress={onBack}
        className="btn fp-detail-back"
      >
        ← Back to list
      </Button>
      {actionErr ? (
        <div
          className="fp-err"
          role="alert"
          style={{ marginBottom: 16 }}
        >
          {actionErr}
        </div>
      ) : null}
      <div className="fp-detail">
        <div className="fp-detail-col">
          {screenshotUrl && !screenshotBroken ? (
            <div className="fp-screenshot">
              <img
                src={screenshotUrl}
                alt="Screenshot at time of comment"
                onError={() => setScreenshotBroken(true)}
              />
            </div>
          ) : (
            <div className="fp-panel fp-panel-empty">
              {screenshotBroken
                ? "Screenshot could not be loaded."
                : "No screenshot was captured for this comment."}
            </div>
          )}
          <div className="fp-panel">
            <h3 className="fp-panel-h3">Element</h3>
            <div className="fp-mono fp-mono-muted">{c.what || "—"}</div>
            <div className="fp-field">
              <div className="fp-field-label">Page</div>
              <a
                className="fp-detail-page-link"
                href={c.url}
                target="_blank"
                rel="noopener"
                title={c.url}
              >
                {c.url}
              </a>
            </div>
          </div>
        </div>
        <div className="fp-detail-col">
          <div className="fp-panel">
            <h3 className="fp-panel-h3">Comment</h3>
            <div className="fp-field">
              <div className="fp-field-label">Change</div>
              <div className="fp-field-value">{c.change_text}</div>
            </div>
            {c.why_text ? (
              <div className="fp-field">
                <div className="fp-field-label">Why</div>
                <div className="fp-field-value">{c.why_text}</div>
              </div>
            ) : null}
            <div className="fp-field">
              <div className="fp-field-label">From</div>
              <div className="fp-field-value" title={c.anon_id || ""}>
                {(c.anon_id ? c.anon_id.slice(0, 10) + "…" : "Anonymous") +
                  " · " +
                  fmtTime(c.created_at)}
              </div>
            </div>
            {c.site_wide ? (
              <div className="fp-field">
                <div className="fp-field-label">Scope</div>
                <div className="fp-field-value">Site-wide</div>
              </div>
            ) : null}
            {c.metadata ? (
              <details className="fp-meta-foldout">
                <summary>Browser / device</summary>
                <pre className="fp-meta-pre">
                  {(() => {
                    try {
                      return JSON.stringify(JSON.parse(c.metadata!), null, 2);
                    } catch {
                      return c.metadata;
                    }
                  })()}
                </pre>
              </details>
            ) : null}
            <div className="fp-field">
              {/*
                Status is rendered as a native <select id="fp-status-select">.
                The Playwright spec at tests/e2e/triage-statuses.spec.ts asserts
                against `#fp-status-select` and reads `<option>` `value`s
                directly, which RAC's portalled listbox cannot satisfy. A
                native select also avoids the axe `aria-valid-attr-value`
                false positive that fires on RAC's auto-generated colon-bearing
                ids — the same reason Sidebar.tsx swapped SDS Tabs for native
                buttons.
              */}
              <label htmlFor="fp-status-select" className="fp-field-label">
                Status
              </label>
              <div className="fp-status-row">
                <StatusPill status={c.status} />
                <select
                  id="fp-status-select"
                  className="fp-status-select"
                  value={c.status}
                  disabled={busy}
                  onChange={(e) => void setStatus(e.currentTarget.value as CommentStatus)}
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <div className="fp-panel">
            <h3 className="fp-panel-h3">Thread</h3>
            <div className="fp-thread">
              {replies.length === 0 ? (
                <div className="fp-thread-empty">No replies yet.</div>
              ) : null}
              {replies.map((r) => (
                <div
                  key={r.id}
                  className={
                    "fp-msg" + (r.author === "designer" ? " is-designer" : "")
                  }
                >
                  <div className="fp-msg-meta">
                    {r.author + " · " + fmtTime(r.created_at)}
                  </div>
                  <div>{r.body}</div>
                </div>
              ))}
            </div>
            <div className="fp-reply-box">
              <Textarea
                value={reply}
                onChange={(e) => setReply(e.currentTarget.value)}
                placeholder="Reply as designer…"
                aria-label="Reply"
                disabled={busy}
              />
              <Button
                variant="primary"
                onPress={sendReply}
                isDisabled={busy || !reply.trim()}
              >
                Reply
              </Button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
