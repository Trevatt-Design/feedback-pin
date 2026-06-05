/**
 * Unit tests for cohort detection (style-target inference + cohort count).
 *
 * Protects:
 *   widget-composer invariant: style-target-prefers-single-style-anchor-descendant
 *   widget-composer invariant: dots-render-2-when-cohort-1-and-3-when-cohort-greater-than-1
 *
 * The functions live in widget/src/anchor.ts. We import them directly under
 * a happy-dom environment so we can build a minimal DOM fixture per test.
 */

// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { findStyleTarget, isStyleAnchor, cohortSignature, cohortCount } from "../../widget/src/anchor";

function setBody(html: string) {
  document.body.innerHTML = html;
}

describe("findStyleTarget", () => {
  beforeEach(() => setBody(""));

  it("returns the element itself when it is already a style anchor", () => {
    setBody(`<div><h2 id="t">Title</h2></div>`);
    const h2 = document.getElementById("t")!;
    expect(findStyleTarget(h2)).toBe(h2);
  });

  it("returns the only stylish descendant when clicked on a wrapper", () => {
    setBody(`<div id="wrap"><h2>The heading</h2></div>`);
    const wrap = document.getElementById("wrap")!;
    const h2 = wrap.querySelector("h2")!;
    expect(findStyleTarget(wrap)).toBe(h2);
  });

  it("falls back to the wrapper when there are multiple stylish descendants", () => {
    setBody(`<div id="wrap"><h2>One</h2><p>Two</p><button>Three</button></div>`);
    const wrap = document.getElementById("wrap")!;
    expect(findStyleTarget(wrap)).toBe(wrap);
  });

  it("ignores empty-text descendants", () => {
    setBody(`<div id="wrap"><h2></h2><p>Real text</p></div>`);
    const wrap = document.getElementById("wrap")!;
    const p = wrap.querySelector("p")!;
    expect(findStyleTarget(wrap)).toBe(p);
  });
});

describe("isStyleAnchor", () => {
  it("returns true for headings, paragraphs, buttons, anchors, list items", () => {
    setBody(`<h1></h1><h2></h2><h3></h3><p></p><button></button><a></a><li></li>`);
    ["h1", "h2", "h3", "p", "button", "a", "li"].forEach(tag => {
      expect(isStyleAnchor(document.querySelector(tag)!)).toBe(true);
    });
  });

  it("returns false for layout containers", () => {
    setBody(`<div></div><span></span><section></section>`);
    ["div", "span", "section"].forEach(tag => {
      expect(isStyleAnchor(document.querySelector(tag)!)).toBe(false);
    });
  });
});

describe("cohortSignature", () => {
  it("uses bare tag when no class", () => {
    setBody(`<h2 id="t">x</h2>`);
    expect(cohortSignature(document.getElementById("t")!)).toBe("h2");
  });

  it("ignores utility classes", () => {
    setBody(`<button id="t" class="is-active fp-btn flex"></button>`);
    expect(cohortSignature(document.getElementById("t")!)).toBe("button");
  });

  it("uses first one or two meaningful classes", () => {
    setBody(`<button id="t" class="primary cta is-active"></button>`);
    expect(cohortSignature(document.getElementById("t")!)).toBe("button.primary.cta");
  });
});

describe("cohortCount", () => {
  it("returns 1 for a unique element", () => {
    setBody(`<h1>Title</h1><p>Body</p>`);
    expect(cohortCount(document.querySelector("h1")!)).toBe(1);
  });

  it("returns count > 1 for repeated elements (drives step-3 visibility)", () => {
    setBody(`<h2>One</h2><h2>Two</h2><h2>Three</h2><h2>Four</h2>`);
    expect(cohortCount(document.querySelector("h2")!)).toBe(4);
  });

  it("groups by tag + meaningful class, not by exact match", () => {
    setBody(`
      <button class="primary">A</button>
      <button class="primary">B</button>
      <button class="secondary">C</button>
    `);
    const primary = document.querySelector("button.primary")!;
    expect(cohortCount(primary)).toBe(2);
  });
});
