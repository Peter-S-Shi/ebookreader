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
      expect(toEpubCss(DEFAULT_TYPOGRAPHY)).not.toContain("color");
      expect(toEpubCss(DEFAULT_TYPOGRAPHY, false)).not.toContain("color");
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
      paddingLeft: "8%",
      paddingRight: "8%",
    });
  });
});
