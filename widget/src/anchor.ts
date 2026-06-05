/**
 * Element anchoring.
 *
 * For every comment, capture multiple anchors so we can resolve later
 * even after layout/CSS changes:
 *   1. selector  — best-effort stable CSS selector (data-attr / id / class chain)
 *   2. dom_path  — nth-child path from <html> (always works at capture time)
 *   3. x_pct/y_pct — coordinates as % of viewport (last-resort visual anchor)
 *
 * Resolution priority on read: selector → dom_path → coords.
 */

export interface AnchorData {
  selector: string | null;
  dom_path: string;
  x_pct: number;
  y_pct: number;
  viewport_w: number;
  viewport_h: number;
  what: string; // human-readable summary of the element
}

const STABLE_ATTRS = ["data-fp-id", "data-testid", "data-cy", "data-id", "id"];

function escapeAttr(v: string): string {
  return v.replace(/(["\\])/g, "\\$1");
}

export function buildSelector(el: Element): string | null {
  // Walk up the tree, stopping when we have a unique selector.
  let cur: Element | null = el;
  const parts: string[] = [];
  let depth = 0;
  while (cur && cur.nodeType === 1 && depth < 6) {
    const tag = cur.tagName.toLowerCase();
    // Prefer stable attributes
    for (const a of STABLE_ATTRS) {
      const v = cur.getAttribute(a);
      if (v) {
        const sel = `${tag}[${a}="${escapeAttr(v)}"]`;
        if (document.querySelectorAll(sel).length === 1) return sel;
      }
    }
    // ID directly
    if (cur.id) {
      const sel = `#${CSS.escape(cur.id)}`;
      if (document.querySelectorAll(sel).length === 1) return sel;
    }
    // Class-based attempt
    const cls = (cur.className && typeof cur.className === "string")
      ? cur.className.trim().split(/\s+/).slice(0, 2).map(c => "." + CSS.escape(c)).join("")
      : "";
    let part = tag + cls;
    // disambiguate among siblings
    const parent = cur.parentElement;
    if (parent) {
      const same = Array.from(parent.children).filter(c => c.tagName === cur!.tagName);
      if (same.length > 1) {
        const idx = same.indexOf(cur) + 1;
        part += `:nth-of-type(${idx})`;
      }
    }
    parts.unshift(part);
    const composed = parts.join(" > ");
    try {
      if (document.querySelectorAll(composed).length === 1) return composed;
    } catch { /* invalid selector, keep going */ }
    cur = cur.parentElement;
    depth++;
  }
  return null;
}

export function buildDomPath(el: Element): string {
  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur && cur.nodeType === 1 && cur.tagName !== "HTML") {
    const parent: HTMLElement | null = cur.parentElement;
    if (!parent) break;
    const idx = Array.from(parent.children).indexOf(cur as Element) + 1;
    parts.unshift(`${cur.tagName.toLowerCase()}:nth-child(${idx})`);
    cur = parent;
  }
  return "html > " + parts.join(" > ");
}

export function describeElement(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const text = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80);
  const id = el.id ? `#${el.id}` : "";
  const cls = (el.classList && el.classList.length)
    ? "." + Array.from(el.classList).slice(0, 2).join(".")
    : "";
  const desc = `<${tag}${id}${cls}>`;
  return text ? `${desc} "${text}"` : desc;
}

export function captureAnchor(el: Element): AnchorData {
  const rect = el.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  return {
    selector: buildSelector(el),
    dom_path: buildDomPath(el),
    x_pct: window.innerWidth ? cx / window.innerWidth : 0,
    y_pct: window.innerHeight ? cy / window.innerHeight : 0,
    viewport_w: window.innerWidth,
    viewport_h: window.innerHeight,
    what: describeElement(el),
  };
}

/**
 * Style-anchor detection.
 *
 * When a commenter clicks a wrapper (e.g. a div) that contains exactly one
 * prominent style-anchor child (h1-h6, p, button, a), treat that child as the
 * effective target for site-wide reasoning. This lets "click parent, mean the
 * heading" work without AI inference.
 *
 * Returns the input element itself if it is already a style anchor, the only
 * stylish descendant if there's exactly one, or the input element as fallback.
 */
const STYLE_ANCHOR_TAGS = ["H1", "H2", "H3", "H4", "H5", "H6", "P", "BUTTON", "A", "LI"];

export function isStyleAnchor(el: Element): boolean {
  return STYLE_ANCHOR_TAGS.includes(el.tagName);
}

export function findStyleTarget(el: Element): Element {
  if (isStyleAnchor(el)) return el;
  // Look down at most 3 levels for a single dominant style-anchor descendant.
  const candidates = el.querySelectorAll(STYLE_ANCHOR_TAGS.map(t => t.toLowerCase()).join(","));
  // Filter to direct-ish descendants (within 3 levels) and visible-ish text content.
  const within: Element[] = [];
  candidates.forEach(c => {
    if (within.length > 1) return; // early-out: more than one means we can't infer
    let depth = 0;
    let cur: Element | null = c;
    while (cur && cur !== el && depth < 4) { cur = cur.parentElement; depth++; }
    if (cur === el && (c.textContent || "").trim().length > 0) within.push(c);
  });
  if (within.length === 1) return within[0];
  return el;
}

/**
 * Cohort count: how many elements match the style-target's effective signature
 * across the whole page. Used to decide whether step 3 (site-wide?) appears.
 *
 * Signature = tagName + (first one or two distinguishing class tokens that are
 * unlikely to be utility classes). We avoid exact-match selectors here because
 * that would always return 1 for unique elements; we want the *style cohort*.
 */
const UTILITY_CLASS_RE = /^(is-|has-|js-|u-|fp-|sr-only|w-\d|h-\d|p-\d|m-\d|flex|grid|block|hidden|active|open|focus|hover)/;

export function cohortSignature(el: Element): string {
  const tag = el.tagName.toLowerCase();
  if (!el.classList || el.classList.length === 0) return tag;
  const meaningful = Array.from(el.classList).filter(c => !UTILITY_CLASS_RE.test(c));
  if (meaningful.length === 0) return tag;
  // Take first 1-2 meaningful classes — enough to distinguish a "primary
  // button" from a "secondary button" without being too specific.
  return tag + meaningful.slice(0, 2).map(c => "." + CSS.escape(c)).join("");
}

export function cohortCount(el: Element, root: ParentNode = document): number {
  const sig = cohortSignature(el);
  try { return root.querySelectorAll(sig).length; } catch { return 1; }
}

/** Try to find the element this anchor was originally captured against. */
export function resolveAnchor(a: Pick<AnchorData, "selector" | "dom_path">): Element | null {
  if (a.selector) {
    try {
      const found = document.querySelectorAll(a.selector);
      if (found.length === 1) return found[0];
    } catch { /* fall through */ }
  }
  if (a.dom_path) {
    try {
      const found = document.querySelector(a.dom_path);
      if (found) return found;
    } catch { /* fall through */ }
  }
  return null;
}
