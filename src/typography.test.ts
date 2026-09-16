import { describe, expect, it } from "vitest";
import {
  DEFAULT_TYPOGRAPHY,
  deserializeTypographySettings,
  serializeTypographySettings,
  toEpubCss,
  toTextStyle,
} from "./typography";

describe("toEpubCss", () => {
  it("emits no font-family rule for Publisher / Original", () => {
    const css = toEpubCss(DEFAULT_TYPOGRAPHY);
    expect(css).not.toContain("font-family");
  });

  it("includes the chosen system font-family when set", () => {
    const css = toEpubCss({
      ...DEFAULT_TYPOGRAPHY,
      font: { source: "SYSTEM", family: "Calibri" },
    });
    expect(css).toContain('font-family: "Calibri"');
  });

  it("reflects font size, line height, page width, and margins", () => {
    const css = toEpubCss({
      font: { source: "PUBLISHER" },
      cjkFont: null,
      fontSizePercent: 120,
      lineHeight: 1.8,
      pageWidthCh: 60,
      marginPercent: 12,
    });
    expect(css).toContain("font-size: 120%");
    expect(css).toContain("line-height: 1.8");
    expect(css).toContain("max-width: 60ch");
    expect(css).toContain("padding-left: 12%");
    expect(css).toContain("padding-right: 12%");
  });

  it("overrides publisher paragraph line-height without flattening special structures", () => {
    const css = toEpubCss({ ...DEFAULT_TYPOGRAPHY, lineHeight: 1.8 });

    expect(css).toMatch(/:where\([^)]*p[^)]*\)\s*\{[^}]*line-height:\s*1\.8\s*!important/);
    // Word-bounded: V2-M1 added several more `!important` declarations to
    // the body rule, and unbounded "rt"/"pre" alternatives here would
    // false-match inside words like "important" and "padding-right".
    expect(css).not.toMatch(/\b(?:ruby|rt|rp|sup|sub|table|pre|code)\b[^{]*\{[^}]*line-height:/);
    expect(css).not.toContain("* { line-height:");
  });

  it("wins the cascade against representative publisher paragraph CSS", () => {
    const fixture = document.createElement("div");
    fixture.innerHTML = `<style>p { line-height: 1.05; } pre { line-height: 1.1; }</style><style>${toEpubCss({ ...DEFAULT_TYPOGRAPHY, lineHeight: 1.8 })}</style><p>Ordinary reading text</p><pre>preserved code</pre>`;
    document.body.append(fixture);

    expect(getComputedStyle(fixture.querySelector("p")!).lineHeight).toBe("1.8");
    expect(getComputedStyle(fixture.querySelector("pre")!).lineHeight).toBe("1.1");
    fixture.remove();
  });

  it("preserves publisher metrics on special structures nested in ordinary prose", () => {
    const fixture = document.createElement("div");
    fixture.innerHTML = `<style>ruby { line-height: 1; } sup { line-height: 0.7; } code { line-height: 1.2; }</style><style>${toEpubCss({ ...DEFAULT_TYPOGRAPHY, lineHeight: 1.8 })}</style><p><ruby>reading<rt>text</rt></ruby><sup>2</sup><code>inline</code></p>`;
    document.body.append(fixture);

    expect(getComputedStyle(fixture.querySelector("ruby")!).lineHeight).toBe("1");
    expect(getComputedStyle(fixture.querySelector("sup")!).lineHeight).toBe("0.7");
    expect(getComputedStyle(fixture.querySelector("code")!).lineHeight).toBe("1.2");
    fixture.remove();
  });

  describe("publisher preference-override compatibility (V2-M1)", () => {
    // Regression coverage for a real-world failure class: some publisher
    // stylesheets (e.g. Calibre-exported EPUBs) apply a class directly to
    // <body> that sets font-size/margin/padding with higher specificity
    // than a plain `body { ... }` selector, and/or apply font-size classes
    // directly to paragraph-level elements. Both previously froze the
    // reader's font size, page width, and margin controls.
    it("wins font-size, margins, and padding against a publisher class applied to <body> itself", () => {
      const style = document.createElement("style");
      style.textContent =
        `.publisher-body { font-size: 1em; padding-left: 0; padding-right: 0; margin: 0 5pt; }\n` +
        toEpubCss({ ...DEFAULT_TYPOGRAPHY, fontSizePercent: 160, marginPercent: 12 });
      document.head.append(style);
      document.body.classList.add("publisher-body");

      const bodyStyle = getComputedStyle(document.body);
      expect(bodyStyle.fontSize).toBe("25.6px"); // 160% of the 16px UA default
      expect(bodyStyle.paddingLeft).toBe("12%");
      expect(bodyStyle.paddingRight).toBe("12%");
      expect(bodyStyle.marginLeft).toBe("auto");
      expect(bodyStyle.marginRight).toBe("auto");

      document.body.classList.remove("publisher-body");
      style.remove();
    });

    it("wins font-size against a publisher class applied directly to <p>", () => {
      const fixture = document.createElement("div");
      fixture.innerHTML =
        `<style>.publisher-para { font-size: 12px; }</style>` +
        `<style>${toEpubCss({ ...DEFAULT_TYPOGRAPHY, fontSizePercent: 160 })}</style>` +
        `<p class="publisher-para">Ordinary reading text</p>`;
      document.body.append(fixture);

      expect(getComputedStyle(fixture.querySelector("p")!).fontSize).toBe("25.6px");
      fixture.remove();
    });

    it("applies the font-size preference once, not compounded, for prose nested in other prose (e.g. a quoted paragraph inside a blockquote)", () => {
      const fixture = document.createElement("div");
      fixture.innerHTML =
        `<style>${toEpubCss({ ...DEFAULT_TYPOGRAPHY, fontSizePercent: 160 })}</style>` +
        `<blockquote><p>Quoted reading text</p></blockquote>` +
        `<p>Ordinary reading text</p>`;
      document.body.append(fixture);

      const nestedParagraphSize = getComputedStyle(fixture.querySelector("blockquote > p")!).fontSize;
      const loneParagraphSize = getComputedStyle(fixture.querySelectorAll("p")[1]).fontSize;
      expect(nestedParagraphSize).toBe(loneParagraphSize);
      expect(nestedParagraphSize).toBe("25.6px");
      fixture.remove();
    });

    it("keeps both the line-height override and a chosen font-family override winning together", () => {
      const fixture = document.createElement("div");
      fixture.innerHTML =
        `<style>p { line-height: 1.05; }</style>` +
        `<style>${toEpubCss({ ...DEFAULT_TYPOGRAPHY, lineHeight: 1.8, font: { source: "SYSTEM", family: "Georgia" } })}</style>` +
        `<p>Ordinary reading text</p>`;
      document.body.append(fixture);

      const computed = getComputedStyle(fixture.querySelector("p")!);
      expect(computed.lineHeight).toBe("1.8");
      expect(computed.fontFamily).toContain("Georgia");
      fixture.remove();
    });
  });

  it("adds a CJK override after the primary family without replacing Latin/body font", () => {
    const css = toEpubCss({
      ...DEFAULT_TYPOGRAPHY,
      font: { source: "SYSTEM", family: "Georgia" },
      cjkFont: { source: "SYSTEM", family: "Microsoft YaHei" },
    });
    expect(css).toContain('font-family: "Georgia", "Microsoft YaHei"');
  });

  it("references custom fonts as local user files, not built-in product assets", () => {
    const css = toEpubCss({
      ...DEFAULT_TYPOGRAPHY,
      font: { source: "CUSTOM", family: "My Reader Font", path: "C:/fonts/my-reader-font.otf" },
    });
    expect(css).toContain('@font-face { font-family: "My Reader Font"; src: url("C:/fonts/my-reader-font.otf"); }');
    expect(css).toContain('font-family: "My Reader Font"');
  });

  describe("dark mode color override (HA-007)", () => {
    it("emits no color override by default (darkMode omitted or false)", () => {
      expect(toEpubCss(DEFAULT_TYPOGRAPHY)).not.toContain("color: #f6f6f6");
      expect(toEpubCss(DEFAULT_TYPOGRAPHY, false)).not.toContain("color: #f6f6f6");
    });

    it("forces a readable foreground/background when darkMode is true, matching App.css's own Dark theme colors", () => {
      const css = toEpubCss(DEFAULT_TYPOGRAPHY, true);
      expect(css).toContain("color: #f6f6f6 !important");
      expect(css).toContain("background-color: #1a1a1a !important");
      expect(css).toContain("color-scheme: dark");
    });

    it("overrides color with Publisher / Original font untouched -- no font-family rule is added", () => {
      const css = toEpubCss(DEFAULT_TYPOGRAPHY, true);
      expect(css).not.toContain("font-family");
      expect(css).toContain("color: #f6f6f6 !important");
    });

    it("overrides color alongside a chosen font, not instead of it", () => {
      const css = toEpubCss({ ...DEFAULT_TYPOGRAPHY, font: { source: "SYSTEM", family: "Georgia" } }, true);
      expect(css).toContain('font-family: "Georgia"');
      expect(css).toContain("color: #f6f6f6 !important");
    });

    it("HA-007 Corrective Batch #2: forces color on descendant elements too, not just html/body", () => {
      // Real desktop retest: a publication frequently assigns `color`
      // directly to its own paragraph/heading elements (not just `body`).
      // CSS inheritance only applies when a descendant has no explicit
      // color of its own -- an override on `html, body` alone leaves any
      // element with the publication's own `color` declaration
      // unaffected, however high `!important` makes the body rule,
      // because inheritance never even enters the cascade for an element
      // that sets its own value. The override must reach descendants
      // directly, e.g. `html *, body *`, not rely on inheritance.
      const css = toEpubCss(DEFAULT_TYPOGRAPHY, true);
      const descendantColorRule = /(?:html|body)\s*\*[^{]*\{[^}]*color:\s*#f6f6f6\s*!important/;
      expect(css).toMatch(descendantColorRule);
    });

    it("includes highlight color preset CSS rules for reader-highlight elements in EPUB documents", () => {
      const lightCss = toEpubCss(DEFAULT_TYPOGRAPHY, false);
      expect(lightCss).toContain(".reader-highlight");
      expect(lightCss).toContain('data-color="green"');
      expect(lightCss).toContain('data-color="blue"');
      expect(lightCss).toContain('data-color="purple"');
      expect(lightCss).toContain('data-color="orange"');

      const darkCss = toEpubCss(DEFAULT_TYPOGRAPHY, true);
      expect(darkCss).toContain(".reader-highlight");
      expect(darkCss).toContain('data-color="green"');
      expect(darkCss).toContain('data-color="blue"');
      expect(darkCss).toContain('data-color="purple"');
      expect(darkCss).toContain('data-color="orange"');
    });
  });
});

describe("typography persistence", () => {
  it("serializes and deserializes the full provenance-aware model", () => {
    const settings = {
      font: { source: "CUSTOM" as const, family: "Local Serif", path: "C:/fonts/local-serif.otf" },
      cjkFont: { source: "SYSTEM" as const, family: "Microsoft YaHei" },
      fontSizePercent: 115,
      lineHeight: 1.7,
      pageWidthCh: 64,
      marginPercent: 10,
    };

    expect(deserializeTypographySettings(serializeTypographySettings(settings))).toEqual(settings);
  });

  it("falls back to defaults for stale or corrupt persisted settings", () => {
    expect(deserializeTypographySettings("{not json")).toEqual(DEFAULT_TYPOGRAPHY);
    expect(deserializeTypographySettings(JSON.stringify({ fontSizePercent: "large" }))).toEqual(DEFAULT_TYPOGRAPHY);
  });
});

describe("toTextStyle", () => {
  it("maps the same typography model to TXT reader CSS properties", () => {
    expect(
      toTextStyle({
        ...DEFAULT_TYPOGRAPHY,
        font: { source: "SYSTEM", family: "Calibri" },
        marginPercent: 8,
      }),
    ).toMatchObject({
      fontFamily: '"Calibri"',
      lineHeight: 1.5,
      paddingLeft: "8%",
      paddingRight: "8%",
    });
  });
});
