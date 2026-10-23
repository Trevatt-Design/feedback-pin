/**
 * CommentDetail route.
 *
 *   toolbar: Back to list · position (n of N) · previous / next · copy link · open page
 *   heading: the comment, status · author · time
 *   left:    screenshot with the pin drawn on it; click to view full size
 *   right:   status, details, thread + reply
 *
 * Status stays a native `<select id="fp-status-select">` with the four wire
 * values: tests/e2e/triage-statuses.spec.ts reads its `<option>` values, and
 * RAC's portalled listbox cannot satisfy that.
 *
 * Keyboard: j / k previous and next comment, Esc back to the list,
 * Cmd/Ctrl + Enter sends a reply.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Tag, Textarea } from "primitives";
import {
  api,
  isClosedStatus,
  screenshotUrl,
  STATUS_OPTIONS,
  statusLabel,
  type Comment,
  type CommentStatus,
  type Reply,
} from "../lib/api";
import {
  authorName,
  deviceLine,
  displayPath,
  fmtFull,
  fmtShort,
  initials,
  isWebUrl,
  meaningful,
  parseMeta,
  pinFraction,
} from "../lib/format";
import { StatusPill } from "../components/StatusPill";
import { AppShell } from "../components/AppShell";
import {
  IconArrowLeft,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconClose,
  IconExternal,
  IconLink,
  IconMaximise,
} from "../components/icons";
import "./CommentDetail.css";

export interface CommentDetailProps {
  id: string;
  onBack: () => void;
}

interface DetailResponse {
  comment: Comment;
  replies: Reply[];
}

function readOrder(): string[] {
  try {
    const v = JSON.parse(sessionStorage.getItem("fp_list_order") || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function Screenshot({ c, onZoom }: { c: Comment; onZoom: () => void }) {
  const [broken, setBroken] = useState(false);
  const x = pinFraction(c.x_pct);
  const y = pinFraction(c.y_pct);
  if (!c.screenshot_key || broken) {
    return (
      <div className="fp-shot-empty">
        {broken ? "The screenshot could not be loaded." : "No screenshot was captured for this comment."}
      </div>
    );
  }
  return (
    <div className="fp-shot-stage">
      <button type="button" className="fp-shot" onClick={onZoom} title="View full size">
        <img
          src={screenshotUrl(c.screenshot_key)}
          alt="Screenshot at the time of the comment"
          onError={() => setBroken(true)}
        />
        {x != null && y != null ? (
          <span className="fp-shot-pin" style={{ left: `${x * 100}%`, top: `${y * 100}%` }} aria-hidden="true" />
        ) : null}
        <span className="fp-shot-zoom" aria-hidden="true">
          <IconMaximise />
        </span>
      </button>
    </div>
  );
}

function Lightbox({ c, onClose }: { c: Comment; onClose: () => void }) {
  const x = pinFraction(c.x_pct);
  const y = pinFraction(c.y_pct);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
  }, []);
  if (!c.screenshot_key) return null;
  return (
    <div className="fp-lightbox" role="dialog" aria-modal="true" aria-label="Screenshot, full size" onClick={onClose}>
      <button ref={closeRef} type="button" className="fp-btn fp-btn-icon fp-lightbox-close" title="Close" onClick={onClose}>
        <IconClose />
      </button>
      <div className="fp-lightbox-frame" onClick={(e) => e.stopPropagation()}>
        <img src={screenshotUrl(c.screenshot_key)} alt="Screenshot at the time of the comment, full size" />
        {x != null && y != null ? (
          <span className="fp-shot-pin" style={{ left: `${x * 100}%`, top: `${y * 100}%` }} aria-hidden="true" />
        ) : null}
      </div>
    </div>
  );
}

export function CommentDetail({ id, onBack }: CommentDetailProps) {
  const [data, setData] = useState<DetailResponse | null>(null);
  // `err` blocks rendering when the initial load fails. `actionErr` is a
  // non-blocking banner for in-action failures (status update / reply post).
  const [err, setErr] = useState("");
  const [actionErr, setActionErr] = useState("");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [copied, setCopied] = useState(false);
  const order = useMemo(readOrder, [id]);
  const pos = order.indexOf(id);
  const prevId = pos > 0 ? order[pos - 1] : null;
  const nextId = pos >= 0 && pos < order.length - 1 ? order[pos + 1] : null;

  const go = useCallback((target: string | null) => {
    if (target) location.hash = "#/comments/" + target;
  }, []);

  const load = useCallback(async () => {
    setErr("");
    try {
      const j = await api<DetailResponse>("/v1/comments/" + id);
      setData(j);
    } catch (caught) {
      setErr(caught instanceof Error ? caught.message : "Load failed");
    }
  }, [id]);

  useEffect(() => {
    setData(null);
    setZoom(false);
    void load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if (e.key === "Escape") {
        if (zoom) setZoom(false);
        else onBack();
      } else if (e.key === "k" || e.key === "ArrowUp") {
        if (prevId) {
          e.preventDefault();
          go(prevId);
        }
      } else if (e.key === "j" || e.key === "ArrowDown") {
        if (nextId) {
          e.preventDefault();
          go(nextId);
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [zoom, prevId, nextId, go, onBack]);

  if (err) {
    return (
      <AppShell section="comments">
        <main className="fp-page" tabIndex={-1} id="main">
          <Button variant="subtle" size="small" onPress={onBack} className="btn fp-detail-back">
            <IconArrowLeft /> Back to list
          </Button>
          <div className="fp-err" role="alert" style={{ marginTop: 16 }}>
            {err}
          </div>
        </main>
      </AppShell>
    );
  }
  if (!data) {
    return (
      <AppShell section="comments">
        <main className="fp-page" tabIndex={-1} id="main" aria-busy="true">
          <span className="fp-skel" style={{ display: "block", width: 120, height: 28, marginBottom: 20 }} />
          <span className="fp-skel" style={{ display: "block", width: "55%", height: 28, marginBottom: 10 }} />
          <span className="fp-skel" style={{ display: "block", width: 220, height: 16, marginBottom: 28 }} />
          <div className="fp-detail">
            <span className="fp-skel" style={{ display: "block", height: 480 }} />
            <span className="fp-skel" style={{ display: "block", height: 320 }} />
          </div>
        </main>
      </AppShell>
    );
  }

  const c = data.comment;
  const replies = data.replies;
  const meta = parseMeta(c.metadata);
  const why = meaningful(c.why_text);
  const device = deviceLine(meta, c.viewport_w, c.viewport_h);
  const author = authorName(c);
  const element = meaningful(c.what) || meaningful(c.selector);
  const closed = isClosedStatus(c.status);

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

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <AppShell section="comments">
      <main className="fp-page" tabIndex={-1} id="main">
        <div className="fp-detail-bar">
          <Button variant="subtle" size="small" onPress={onBack} className="btn fp-detail-back">
            <IconArrowLeft /> Back to list
          </Button>
          <div className="fp-detail-bar-right">
            {pos >= 0 ? (
              <span className="fp-detail-pos">
                {pos + 1} of {order.length}
              </span>
            ) : null}
            <span className="fp-btn-pair">
              <button
                type="button"
                className="fp-btn fp-btn-icon"
                title="Previous comment (k)"
                aria-label="Previous comment"
                disabled={!prevId}
                onClick={() => go(prevId)}
              >
                <IconChevronUp />
              </button>
              <button
                type="button"
                className="fp-btn fp-btn-icon"
                title="Next comment (j)"
                aria-label="Next comment"
                disabled={!nextId}
                onClick={() => go(nextId)}
              >
                <IconChevronDown />
              </button>
            </span>
            <button type="button" className="fp-btn" onClick={copyLink}>
              {copied ? <IconCheck /> : <IconLink />}
              {copied ? "Copied" : "Copy link"}
            </button>
            {isWebUrl(c.url) ? (
              <a className="fp-btn" href={c.url} target="_blank" rel="noopener">
                <IconExternal />
                Open page
              </a>
            ) : null}
          </div>
        </div>

        <header className="fp-detail-head">
          <h1 className="fp-detail-title">{c.change_text}</h1>
          <p className="fp-detail-sub">
            <span className={"fp-badge fp-badge-dot " + statusBadge(c.status)}>{statusLabel(c.status)}</span>
            {c.site_wide ? (
              <Tag scheme="brand" variant="primary">
                Site-wide
              </Tag>
            ) : null}
            <span>{author}</span>
            <span className="list-dot" aria-hidden="true" />
            <time dateTime={new Date(c.created_at).toISOString()} title={fmtFull(c.created_at)}>
              {fmtShort(c.created_at)}
            </time>
            <span className="list-dot" aria-hidden="true" />
            <span className="fp-mono">{displayPath(c.url)}</span>
          </p>
        </header>

        {actionErr ? (
          <div className="fp-err" role="alert" style={{ marginBottom: 16 }}>
            {actionErr}
          </div>
        ) : null}

        <div className="fp-detail">
          <div className="fp-detail-col">
            <Screenshot c={c} onZoom={() => setZoom(true)} />
          </div>

          <div className="fp-detail-col">
            <section className="fp-panel" aria-labelledby="fp-status-h">
              <h2 className="fp-panel-h" id="fp-status-h">
                Status
              </h2>
              <div className="fp-status-row">
                <label htmlFor="fp-status-select" className="fp-visually-hidden">
                  Status
                </label>
                <span className="fp-status-wrap">
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
                </span>
                <button
                  type="button"
                  className={"fp-btn" + (closed ? "" : " fp-btn-primary")}
                  disabled={busy}
                  onClick={() => void setStatus(closed ? "open" : "resolved")}
                >
                  {closed ? "Reopen" : (
                    <>
                      <IconCheck /> Resolve
                    </>
                  )}
                </button>
              </div>
            </section>

            <section className="fp-panel" aria-labelledby="fp-details-h">
              <h2 className="fp-panel-h" id="fp-details-h">
                Details
              </h2>
              <dl className="fp-dl">
                {why ? (
                  <>
                    <dt>Why</dt>
                    <dd className="fp-dl-text">{why}</dd>
                  </>
                ) : null}
                <dt>From</dt>
                <dd>
                  <span className="fp-person">
                    <span className="fp-avatar" aria-hidden="true">
                      {initials(author)}
                    </span>
                    {author}
                  </span>
                </dd>
                <dt>Page</dt>
                <dd>
                  {isWebUrl(c.url) ? (
                    <a className="fp-mono fp-dl-link" href={c.url} target="_blank" rel="noopener" title={c.url}>
                      {displayPath(c.url)}
                    </a>
                  ) : (
                    <span className="fp-mono" title={c.url}>
                      {displayPath(c.url)}
                    </span>
                  )}
                </dd>
                {element ? (
                  <>
                    <dt>Element</dt>
                    <dd className="fp-mono fp-dl-break">{element}</dd>
                  </>
                ) : null}
                {device ? (
                  <>
                    <dt>Device</dt>
                    <dd>{device}</dd>
                  </>
                ) : null}
                <dt>Left</dt>
                <dd>{fmtFull(c.created_at)}</dd>
                {c.resolved_at ? (
                  <>
                    <dt>Closed</dt>
                    <dd>{fmtFull(c.resolved_at)}</dd>
                  </>
                ) : null}
              </dl>
              {c.metadata ? (
                <details className="fp-meta-foldout">
                  <summary>Raw metadata</summary>
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
            </section>

            <section className="fp-panel" aria-labelledby="fp-thread-h">
              <h2 className="fp-panel-h" id="fp-thread-h">
                Thread {replies.length ? <span className="fp-count">{replies.length}</span> : null}
              </h2>
              <div className="fp-thread">
                {replies.length === 0 ? (
                  <div className="fp-thread-empty">No replies yet. Replies show in the widget next to the pin.</div>
                ) : null}
                {replies.map((r) => {
                  const team = r.author === "designer";
                  const name = team ? "Design team" : r.author === "client" ? author : r.author;
                  return (
                    <div key={r.id} className={"fp-msg" + (team ? " is-team" : "")}>
                      <span className={"fp-avatar" + (team ? " is-team" : "")} aria-hidden="true">
                        {initials(name)}
                      </span>
                      <div className="fp-msg-body">
                        <div className="fp-msg-meta">
                          <span className="fp-msg-name">{name}</span>
                          <time title={fmtFull(r.created_at)}>{fmtShort(r.created_at)}</time>
                        </div>
                        <div className="fp-msg-text">{r.body}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="fp-reply-box">
                <Textarea
                  value={reply}
                  onChange={(e) => setReply(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      void sendReply();
                    }
                  }}
                  placeholder="Write a reply…"
                  aria-label="Reply"
                  disabled={busy}
                />
                <div className="fp-reply-foot">
                  <span className="fp-reply-hint">
                    <span className="fp-kbd">⌘</span>
                    <span className="fp-kbd">↵</span> to send
                  </span>
                  <Button variant="primary" size="small" onPress={sendReply} isDisabled={busy || !reply.trim()}>
                    Reply
                  </Button>
                </div>
              </div>
            </section>
          </div>
        </div>
        {zoom ? <Lightbox c={c} onClose={() => setZoom(false)} /> : null}
      </main>
    </AppShell>
  );
}

function statusBadge(s: CommentStatus): string {
  if (s === "open") return "fp-badge-blue";
  if (s === "in-progress") return "fp-badge-amber";
  if (s === "resolved") return "fp-badge-green";
  return "";
}
