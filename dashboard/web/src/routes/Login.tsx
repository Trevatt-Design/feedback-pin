/**
 * Login route. Ports `function Login()` from the previous monolith
 * (dashboard/src/index.ts:195-217). Behaviour is unchanged:
 *   - the entered token is stored in localStorage under `fp_token`
 *   - we hit `GET /v1/projects/me` to validate it
 *   - on success we redirect to `#/comments`
 *   - on failure we clear the token and show the error inline
 */
import { useState } from "react";
import { Button, Input } from "primitives";
import { api, TOKEN_KEY } from "../lib/api";
import "./Login.css";

export function Login() {
  const [t, setT] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErr("");
    if (busy) return;
    if (!t.trim()) return;
    setBusy(true);
    localStorage.setItem(TOKEN_KEY, t.trim());
    try {
      await api("/v1/projects/me");
      location.hash = "#/comments";
    } catch (caught) {
      localStorage.removeItem(TOKEN_KEY);
      setErr(caught instanceof Error ? caught.message : "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fp-login">
      <form className="fp-login-card" onSubmit={submit}>
        <h1 className="fp-login-h1">feedback-pin</h1>
        <p className="fp-login-sub">
          Enter the project token to view comments.
        </p>
        {err ? (
          <div className="fp-err" role="alert">
            {err}
          </div>
        ) : null}
        <Input
          type="password"
          value={t}
          onChange={(e) => setT(e.currentTarget.value)}
          placeholder="proj_…"
          autoFocus
          aria-label="Project token"
          className="fp-login-input"
          disabled={busy}
        />
        <Button type="submit" variant="primary" isDisabled={busy || !t.trim()}>
          {busy ? "Signing in…" : "Continue"}
        </Button>
      </form>
    </div>
  );
}
