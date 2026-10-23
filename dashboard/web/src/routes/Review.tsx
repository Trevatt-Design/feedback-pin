/**
 * Review route (dashboard-review). The decision surface of the feedback loop.
 *
 * Triage turns comments into items. Each item card puts what a reviewer
 * needs side by side, so a decision never rests on a bare row:
 *   1. the request: the comment(s) with the build screenshot
 *   2. the design: screen key, designed-screen image, Figma, quoted Notion
 *   3. the verdict and, for flags, the proposed design change
 * then, in the footer, the one action the item's stage allows.
 *
 * Rounds group items (one round per triage pass). The default filter shows
 * only items that need a decision.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Textarea } from "primitives";
import {
  api,
  parseJson,
  readActor,
  screenshotUrl,
  stageInFilter,
  OUTCOME_LABEL,
  STAGE_ACTIONS,
  STAGE_LABEL,
  type Comment,
  type ItemDesign,
  type ItemEvent,
  type ItemOutcome,
  type ItemProposal,
  type ItemRow,
  type ItemStage,
  type Project,
  type ReviewFilter,
  type RoundSummary,
} from "../lib/api";
import { AppShell } from "../components/AppShell";
import { IconInbox } from "../components/icons";
import { authorName, displayPath, fmtFull, fmtShort, initials, meaningful, pinFraction } from "../lib/format";
import "./Review.css";

const FILTERS: Array<{ value: ReviewFilter; label: string }> = [
  { value: "decide", label: "Needs decision" },
  { value: "moving", label: "In progress" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All" },
];

const OUTCOME_TONE: Record<ItemOutcome, string> = {
  missing: "fp-badge-amber",
  conflict: "fp-badge-amber",
  "build-fix": "fp-badge-blue",
  "built-right": "fp-badge-green",
  answered: "",
};

function stageTone(stage: ItemStage): string {
  if (stage === "awaiting-decision" || stage === "discuss") return "fp-badge-amber";
  if (stage === "closed") return "";
  if (stage === "built") return "fp-badge-green";
  return "fp-badge-blue";
}

export function Review() {
  const [project, setProject] = useState<Project | null>(null);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [rounds, setRounds] = useState<RoundSummary[]>([]);
  const [comments, setComments] = useState<Map<string, Comment>>(new Map());
  const [round, setRound] = useState<string>("");
  const [filter, setFilter] = useState<ReviewFilter>("decide");
  const [actor, setActor] = useState<string>(readActor);
  const [err, setErr] = useState("");
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [p, list, all] = await Promise.all([
        api<Project>("/v1/projects/me"),
        api<{ items: ItemRow[]; rounds: RoundSummary[] }>("/v1/items"),
        api<{ comments: Comment[] }>("/v1/comments"),
      ]);
      setProject(p);
      setItems(list.items || []);
      setRounds(list.rounds || []);
      setComments(new Map((all.comments || []).map((c) => [c.id, c])));
      setErr("");
    } catch (caught) {
      setErr(caught instanceof Error ? caught.message : "Refresh failed");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const approvers = project?.approvers || [];
  const canDecide =
    !!actor.trim() &&
    (approvers.length === 0 || approvers.some((a) => a.toLowerCase() === actor.trim().toLowerCase()));

  const visible = useMemo(
    () => items.filter((i) => (!round || i.round === round) && stageInFilter(i.stage, filter)),
    [items, round, filter],
  );
  const counts = useMemo(() => {
    const inRound = items.filter((i) => !round || i.round === round);
    const out: Record<ReviewFilter, number> = { decide: 0, moving: 0, closed: 0, all: inRound.length };
    for (const i of inRound) {
      if (stageInFilter(i.stage, "decide")) out.decide++;
      else if (stageInFilter(i.stage, "closed")) out.closed++;
      else out.moving++;
    }
    return out;
  }, [items, round]);

  const who = !actor.trim()
    ? "Add your name in the top bar to make decisions."
    : canDecide
      ? `Deciding as ${actor.trim()}.`
      : `${actor.trim()} can move build stages. Decisions need ${approvers.join(" or ")}.`;

  return (
    <AppShell section="review" project={project} onActorChange={setActor}>
      <main className="fp-page" tabIndex={-1} id="main">
        <div className="fp-page-head">
          <div>
            <h1 className="fp-h1">Review</h1>
            <p className="fp-h-sub">{who}</p>
          </div>
          <div className="fp-review-tools">
            <label className="fp-visually-hidden" htmlFor="fp-round">
              Round
            </label>
            <select id="fp-round" className="fp-select" value={round} onChange={(e) => setRound(e.currentTarget.value)}>
              <option value="">All rounds</option>
              {rounds.map((r) => (
                <option key={r.round} value={r.round}>
                  {r.round}
                  {r.waiting ? ` (${r.waiting} waiting)` : ""}
                </option>
              ))}
            </select>
            <div className="fp-seg" role="group" aria-label="Filter">
              {FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  className={filter === f.value ? "is-active" : ""}
                  aria-pressed={filter === f.value}
                  onClick={() => setFilter(f.value)}
                >
                  {f.label}
                  <span className="fp-count">{counts[f.value]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {err ? (
          <div className="fp-err" role="alert">
            {err}
          </div>
        ) : null}

        {loaded && visible.length === 0 ? (
          <div className="fp-card fp-review-empty">
            <span className="list-empty-icon">
              <IconInbox />
            </span>
            <div className="list-empty-title">
              {items.length === 0 ? "Nothing triaged yet" : filter === "decide" ? "Nothing needs a decision" : "Nothing here"}
            </div>
            <div className="list-empty-hint">
              {items.length === 0
                ? "A triage pass turns open comments into review items."
                : filter === "decide"
                  ? "Items you approve move to In progress."
                  : "Try another filter or round."}
            </div>
          </div>
        ) : null}
        {!loaded ? (
          <div className="fp-review-list" aria-busy="true">
            <span className="fp-skel" style={{ display: "block", height: 360 }} />
          </div>
        ) : null}

        <div className="fp-review-list">
          {visible.map((it) => (
            <ItemCard
              key={it.id}
              item={it}
              comments={(it.comment_ids || "")
                .split(",")
                .filter(Boolean)
                .map((id) => comments.get(id))
                .filter((c): c is Comment => !!c)}
              canDecide={canDecide}
              hasActor={!!actor.trim()}
              onChanged={refresh}
            />
          ))}
        </div>
      </main>
    </AppShell>
  );
}

interface ItemCardProps {
  item: ItemRow;
  comments: Comment[];
  canDecide: boolean;
  hasActor: boolean;
  onChanged: () => Promise<void> | void;
}

function ItemCard({ item, comments, canDecide, hasActor, onChanged }: ItemCardProps) {
  const design = parseJson<ItemDesign>(item.design) || {};
  const proposal = parseJson<ItemProposal>(item.proposal);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [showEmbed, setShowEmbed] = useState(false);
  const [events, setEvents] = useState<ItemEvent[] | null>(null);

  const isFlag = item.outcome === "missing" || item.outcome === "conflict";
  const waiting = item.stage === "awaiting-decision" || item.stage === "discuss";
  const actions = STAGE_ACTIONS[item.stage] || [];
  const effects = proposal?.effects ? (Array.isArray(proposal.effects) ? proposal.effects : [proposal.effects]) : [];
  const hasProposal = !!proposal && !!(proposal.summary || proposal.figma_url || proposal.image_key || effects.length);
  const embedSrc = design.figma_url ? figmaEmbed(design.figma_url) : null;
  const notion = design.notion || [];

  const send = async (path: string, body: unknown) => {
    setBusy(true);
    setErr("");
    try {
      await api(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      setNote("");
      setEvents(null);
      await onChanged();
    } catch (caught) {
      setErr(caught instanceof Error ? caught.message : "Failed");
    } finally {
      setBusy(false);
    }
  };
  const decide = (decision: "approve" | "decline" | "discuss") => {
    if (decision !== "approve" && !note.trim()) {
      setErr("Add a note to say why.");
      return;
    }
    void send(`/v1/items/${item.id}/decision`, { decision, note: note.trim() || undefined });
  };
  const move = (to: ItemStage) => void send(`/v1/items/${item.id}/stage`, { stage: to, note: note.trim() || undefined });

  const loadHistory = async () => {
    try {
      const d = await api<{ events: ItemEvent[] }>(`/v1/items/${item.id}`);
      setEvents(d.events || []);
    } catch {
      setEvents([]);
    }
  };

  return (
    <article className={"fp-item fp-card" + (isFlag ? " is-flag" : "")} aria-labelledby={`fp-item-${item.id}`}>
      <header className="fp-item-head">
        <span className="fp-item-ref">{item.ref}</span>
        <h2 className="fp-item-title" id={`fp-item-${item.id}`}>
          {item.title}
        </h2>
        <span className={"fp-badge fp-outcome " + OUTCOME_TONE[item.outcome]}>{OUTCOME_LABEL[item.outcome]}</span>
        <span className={"fp-badge fp-badge-dot fp-stage " + stageTone(item.stage)}>{STAGE_LABEL[item.stage]}</span>
      </header>

      <div className="fp-item-grid">
        <section className="fp-item-col" aria-label="Request">
          <h3 className="fp-item-label">Request</h3>
          {comments.length === 0 ? <p className="fp-muted">Comment not found.</p> : null}
          {comments.map((c) => {
            const name = authorName(c);
            const why = meaningful(c.why_text);
            const px = pinFraction(c.x_pct);
            const py = pinFraction(c.y_pct);
            return (
              <div key={c.id} className="fp-item-comment">
                <div className="fp-item-by">
                  <span className="fp-avatar" aria-hidden="true">
                    {initials(name)}
                  </span>
                  <span className="fp-item-by-name">{name}</span>
                  <time title={fmtFull(c.created_at)}>{fmtShort(c.created_at)}</time>
                </div>
                <p className="fp-item-quote">{c.change_text}</p>
                {why ? <p className="fp-item-why">{why}</p> : null}
                <p className="fp-item-meta">
                  <span className="fp-mono">{displayPath(c.url)}</span>
                  <span className="list-dot" aria-hidden="true" />
                  <a href={"#/comments/" + c.id}>Open comment</a>
                </p>
                {c.screenshot_key ? (
                  <a href={"#/comments/" + c.id} className="fp-item-shot" title="Open the comment">
                    <img src={screenshotUrl(c.screenshot_key)} alt="Build screenshot where the comment was left" loading="lazy" />
                    {px != null && py != null ? (
                      <span className="fp-item-pin" style={{ left: `${px * 100}%`, top: `${py * 100}%` }} aria-hidden="true" />
                    ) : null}
                  </a>
                ) : null}
              </div>
            );
          })}
        </section>

        <section className="fp-item-col" aria-label="Design">
          <h3 className="fp-item-label">
            Design
            {design.screen_key ? <span className="fp-item-key">{design.screen_key}</span> : null}
          </h3>
          {notion.map((n, i) => (
            <blockquote key={i} className="fp-item-notion">
              {n.quote ? <p>{n.quote}</p> : null}
              <a href={n.url} target="_blank" rel="noreferrer">
                {n.label} ↗
              </a>
            </blockquote>
          ))}
          {design.figma_url ? (
            <p className="fp-item-links">
              <a href={design.figma_url} target="_blank" rel="noreferrer">
                Open in Figma ↗
              </a>
              {embedSrc ? (
                <button type="button" className="fp-linkbtn" onClick={() => setShowEmbed((s) => !s)}>
                  {showEmbed ? "Hide preview" : "Show preview"}
                </button>
              ) : null}
            </p>
          ) : null}
          {design.image_key ? (
            <div className="fp-item-shot">
              <img src={screenshotUrl(design.image_key)} alt={`Designed screen ${design.screen_key || ""}`} loading="lazy" />
            </div>
          ) : null}
          {showEmbed && embedSrc ? (
            <iframe className="fp-item-embed" src={embedSrc} title={`Figma ${design.screen_key || ""}`} allowFullScreen />
          ) : null}
          {!design.image_key && !design.figma_url && !notion.length ? <p className="fp-muted">No design reference recorded.</p> : null}
        </section>
      </div>

      {item.verdict || hasProposal ? (
        <dl className="fp-item-findings">
          {item.verdict ? (
            <div className="fp-item-row">
              <dt>Verdict</dt>
              <dd>{item.verdict}</dd>
            </div>
          ) : null}
          {hasProposal ? (
            <div className="fp-item-row">
              <dt>Proposed change</dt>
              <dd>
                {proposal!.summary ? <p>{proposal!.summary}</p> : null}
                {effects.length ? (
                  <ul className="fp-item-effects">
                    {effects.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                ) : null}
                {proposal!.image_key ? (
                  <div className="fp-item-shot">
                    <img src={screenshotUrl(proposal!.image_key)} alt="Proposed design" loading="lazy" />
                  </div>
                ) : null}
                {proposal!.figma_url ? (
                  <a href={proposal!.figma_url} target="_blank" rel="noreferrer">
                    Proposal in Figma ↗
                  </a>
                ) : null}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      <footer className="fp-item-foot">
        {(waiting || actions.length) && item.stage !== "closed" ? (
          <div className="fp-item-actions">
            <Textarea
              value={note}
              onChange={(e) => setNote(e.currentTarget.value)}
              placeholder={waiting ? "Note (needed to decline or discuss)" : "Note (optional)"}
              aria-label={`Note for ${item.ref}`}
              disabled={busy || !hasActor}
              rows={2}
            />
            <div className="fp-item-buttons">
              {waiting ? (
                <>
                  <Button variant="subtle" size="small" onPress={() => decide("decline")} isDisabled={busy || !canDecide}>
                    Decline
                  </Button>
                  <Button variant="neutral" size="small" onPress={() => decide("discuss")} isDisabled={busy || !canDecide}>
                    Discuss
                  </Button>
                  <Button variant="primary" size="small" onPress={() => decide("approve")} isDisabled={busy || !canDecide}>
                    Approve
                  </Button>
                </>
              ) : (
                actions
                  .slice()
                  .reverse()
                  .map((a) => (
                    <Button
                      key={a.to}
                      variant={a === actions[0] ? "primary" : "neutral"}
                      size="small"
                      onPress={() => move(a.to)}
                      isDisabled={busy || !hasActor || (item.stage === "in-figma" && !canDecide)}
                    >
                      {a.label}
                    </Button>
                  ))
              )}
            </div>
            {err ? (
              <div className="fp-err" role="alert">
                {err}
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="fp-item-foot-meta">
          <details
            className="fp-item-history"
            onToggle={(e) => {
              if ((e.currentTarget as HTMLDetailsElement).open && events === null) void loadHistory();
            }}
          >
            <summary>History</summary>
            {events === null ? (
              <p className="fp-muted">Loading…</p>
            ) : (
              <ol>
                {events.map((ev) => (
                  <li key={ev.id}>
                    <span className="fp-mono">{fmtFull(ev.created_at)}</span>
                    <span>
                      {ev.actor || "someone"} · {ev.action}
                      {ev.value ? ` → ${ev.value}` : ""}
                    </span>
                    {ev.note ? <span className="fp-item-history-note">“{ev.note}”</span> : null}
                  </li>
                ))}
              </ol>
            )}
          </details>
          {item.decision ? (
            <span className="fp-item-decided">
              {DECIDED[item.decision] || item.decision} by {item.decided_by}
              {item.decided_at ? ` · ${fmtShort(item.decided_at)}` : ""}
            </span>
          ) : null}
        </div>
      </footer>
    </article>
  );
}

const DECIDED: Record<string, string> = { approve: "Approved", decline: "Declined", discuss: "Sent to discuss" };

/** figma.com/design/<key>/...?node-id=1-2 -> embed.figma.com/design/<key>?node-id=1-2&embed-host=feedback-pin */
export function figmaEmbed(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/(^|\.)figma\.com$/.test(u.hostname)) return null;
    const m = u.pathname.match(/^\/(design|file|proto)\/([A-Za-z0-9]+)/);
    if (!m) return null;
    const node = u.searchParams.get("node-id");
    return (
      `https://embed.figma.com/${m[1] === "proto" ? "proto" : "design"}/${m[2]}?embed-host=feedback-pin` +
      (node ? `&node-id=${encodeURIComponent(node)}` : "")
    );
  } catch {
    return null;
  }
}
