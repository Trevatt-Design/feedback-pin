/**
 * AppShell: the top bar and section tabs shared by every signed-in route.
 *
 *   [pin] feedback-pin / <project>              Your name [   ]  Sign out
 *   Comments   Review (n)
 *
 * The reviewer name is stored in localStorage `fp_actor` and sent as
 * `x-fp-actor` by api(); it attributes decisions and stage moves.
 */
import { useEffect, useState, type ReactNode } from "react";
import { api, readActor, writeActor, TOKEN_KEY, type Project } from "../lib/api";
import { initials } from "../lib/format";
import { Button } from "primitives";
import "./AppShell.css";

export type Section = "comments" | "review";

export interface AppShellProps {
  section: Section;
  children: ReactNode;
  /** Pass the project when the route already loaded it, to skip a fetch. */
  project?: Project | null;
  onActorChange?: (name: string) => void;
}

export function AppShell({ section, children, project: given, onActorChange }: AppShellProps) {
  const [project, setProject] = useState<Project | null>(given ?? null);
  const [actor, setActor] = useState(readActor);
  const waiting = project?.waiting ?? 0;

  useEffect(() => {
    if (given) {
      setProject(given);
      return;
    }
    let live = true;
    api<Project>("/v1/projects/me")
      .then((p) => {
        if (live) setProject(p);
      })
      .catch(() => {
        /* the route shows its own error */
      });
    return () => {
      live = false;
    };
  }, [given]);

  const commitActor = (v: string) => {
    writeActor(v);
    const saved = readActor();
    setActor(saved);
    onActorChange?.(saved);
  };

  return (
    <div className="fp-shell">
      <header className="fp-top">
        <div className="fp-top-left">
          <span className="fp-logo" aria-hidden="true">
            <svg viewBox="0 0 16 16" width="16" height="16">
              <path d="M8 1.5a5 5 0 0 0-5 5c0 3.6 5 8 5 8s5-4.4 5-8a5 5 0 0 0-5-5Z" fill="currentColor" />
              <circle cx="8" cy="6.5" r="1.8" fill="#fff" />
            </svg>
          </span>
          <span className="fp-top-name">feedback-pin</span>
          <span className="fp-top-sep" aria-hidden="true">/</span>
          <span className="fp-top-project">{project?.name || "Project"}</span>
        </div>
        <div className="fp-top-right">
          <label className="fp-actor" title="Your name, shown on decisions and replies">
            <span className="fp-visually-hidden">Your name</span>
            <span className={"fp-avatar" + (actor ? " is-team" : "")} aria-hidden="true">
              {actor ? initials(actor) : "?"}
            </span>
            <input
              className="fp-actor-input"
              value={actor}
              placeholder="Your name"
              onChange={(e) => setActor(e.currentTarget.value)}
              onBlur={(e) => commitActor(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitActor(e.currentTarget.value);
              }}
            />
          </label>
          <Button
            variant="subtle"
            size="small"
            className="fp-top-link"
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
      </header>
      <nav className="fp-subnav" aria-label="Sections">
        <a href="#/comments" className={section === "comments" ? "is-active" : ""} aria-current={section === "comments" ? "page" : undefined}>
          Comments
        </a>
        <a href="#/review" className={section === "review" ? "is-active" : ""} aria-current={section === "review" ? "page" : undefined}>
          Review
          {waiting ? <span className="fp-subnav-count">{waiting}</span> : null}
        </a>
      </nav>
      {children}
    </div>
  );
}
