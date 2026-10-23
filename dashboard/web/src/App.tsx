/**
 * Top-level dashboard router. Hash-based, no router library.
 *
 * Route table:
 *   #/login          → Login form
 *   #/comments       → CommentsList (Sidebar + list panel)
 *   #/comments/:id   → CommentDetail
 *   #/review         → Review (triaged items, decisions, stages)
 *   default          → CommentsList if a token exists, else Login
 *
 * After every hash-route change, focus moves to the <main id="main">
 * landmark of the rendered route (Stage 3 accessibility amendment) —
 * the focus move itself is wired in `lib/hashRoute.ts`. Each route
 * renders its own `<main tabIndex={-1} id="main">`.
 */
import { useEffect, useState } from "react";
import { useHashRoute } from "./lib/hashRoute";
import { TOKEN_KEY } from "./lib/api";
import { Login } from "./routes/Login";
import { CommentsList } from "./routes/CommentsList";
import { CommentDetail } from "./routes/CommentDetail";
import { Review } from "./routes/Review";

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function App() {
  const path = useHashRoute();
  const [token, setToken] = useState<string | null>(readToken);

  // Keep local token state in sync with localStorage. The Login route
  // writes via setItem and then redirects to #/comments; the resulting
  // hash change fires this effect and we re-read.
  useEffect(() => {
    setToken(readToken());
  }, [path]);

  if (!token || path === "/login") {
    return <Login />;
  }
  if (path === "/review") {
    return <Review />;
  }
  if (path.startsWith("/comments/")) {
    const id = path.slice("/comments/".length);
    return <CommentDetail id={id} onBack={() => (location.hash = "#/comments")} />;
  }
  return (
    <CommentsList onOpen={(id) => (location.hash = "#/comments/" + id)} />
  );
}
