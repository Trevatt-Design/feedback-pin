/**
 * Anonymous unique ID per browser. Persisted in localStorage.
 * No PII; just lets us attribute multiple comments to one author and
 * gate edit/delete to the original author.
 */
const KEY = "fp_uid";

function rand16(): string {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return Array.from(buf, b => b.toString(16).padStart(2, "0")).join("");
}

export function getUid(): string {
  try {
    let v = localStorage.getItem(KEY);
    if (!v) {
      v = "u_" + rand16();
      localStorage.setItem(KEY, v);
    }
    return v;
  } catch {
    // localStorage might be blocked; fall back to ephemeral.
    return "u_anon_" + Math.random().toString(36).slice(2, 10);
  }
}

/** Friendly short label, e.g. "u_4f2a". For display only. */
export function shortUid(uid: string): string {
  return uid.length <= 6 ? uid : uid.slice(0, 6);
}

export function captureMetadata() {
  return {
    ua: navigator.userAgent,
    platform: (navigator as any).platform ?? null,
    lang: navigator.language,
    sw: window.screen.width,
    sh: window.screen.height,
    dpr: window.devicePixelRatio,
    vw: window.innerWidth,
    vh: window.innerHeight,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}
