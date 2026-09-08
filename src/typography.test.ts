import { describe, expect, it } from "vitest";
import { DEFAULT_TYPOGRAPHY, toEpubCss } from "./typography";

describe("toEpubCss", () => {
  it("emits no font-family rule for Publisher / Original (fontFamily: null)", () => {
    const css = toEpubCss(DEFAULT_TYPOGRAPHY);
    expect(css).not.toContain("font-family");
  });

  it("includes the chosen font-family when set", () => {
    const css = toEpubCss({ ...DEFAULT_TYPOGRAPHY, fontFamily: "Calibri" });
    expect(css).toContain('font-family: "Calibri"');
  });

  it("reflects font size, line height, and page width", () => {
    const css = toEpubCss({ fontFamily: null, fontSizePercent: 120, lineHeight: 1.8, pageWidthCh: 60 });
    expect(css).toContain("font-size: 120%");
    expect(css).toContain("line-height: 1.8");
    expect(css).toContain("max-width: 60ch");
  });
});
