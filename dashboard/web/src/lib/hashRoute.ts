/**
 * Hash routing primitive. Extracted verbatim from the previous monolith
 * (dashboard/src/index.ts:177-185). The shape is preserved so existing
 * route checks (`path === "/login"`, `path.startsWith("/comments/")`,
 * etc.) continue to work without changes.
 *
 * After every route change, focus moves to the main landmark
 * (id="main", tabindex="-1"). This is per the Stage 3 amendment for
 * accessibility — keyboard users land on the new content rather than
 * staying focused on the link they just clicked.
 */
import { useEffect, useState } from "react";

export function useHashRoute(): string {
  const [path, setPath] = useState<string>(location.hash.slice(1) || "/");
  useEffect(() => {
    const onChange = () => {
      const next = location.hash.slice(1) || "/";
      setPath(next);
      // Move focus to the main landmark on route change.
      // Defer so React has rendered the new route's main element.
      requestAnimationFrame(() => {
        const main = document.getElementById("main");
        if (main) {
          try {
            (main as HTMLElement).focus();
          } catch {
            /* swallow */
          }
        }
      });
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return path;
}
