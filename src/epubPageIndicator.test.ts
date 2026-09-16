import { describe, expect, it } from "vitest";
import { computeEpubPageIndicator } from "./epubPageIndicator";

describe("computeEpubPageIndicator", () => {
  // V2-M3 human-acceptance correction: foliate-js's Paginator pads the
  // *visible scroller element* with a phantom page-width at BOTH the
  // leading and trailing edge (`expand()` sizes it to
  // `expandedSize + size * 2`), so `pages` over-reports the real chapter
  // length by 2, not 1. Its 0-based `page` index already lines up with the
  // 1-based real page number (index 0 is the leading phantom, index 1 is
  // real page 1). See epubPageIndicator.ts for the full derivation against
  // node_modules/foliate-js/paginator.js.

  it("returns null before layout has measured anything (pages not yet positive)", () => {
    expect(computeEpubPageIndicator(1, 0)).toBeNull();
  });

  it("derives the 1-based current page and total pages for a 3-page chapter", () => {
    // pageCount=3 real pages -> pages getter reports 5 (3 real + 2 phantom).
    // page index 2 is real page 2.
    expect(computeEpubPageIndicator(2, 5)).toEqual({ current: 2, total: 3 });
  });

  it("does not skip a page on the very first page turn", () => {
    // Landing on the first real page (page index 1), then turning once to
    // page index 2, must increment K from 1 to 2 -- this was the reported
    // defect (K stayed at 1 through the first turn).
    expect(computeEpubPageIndicator(1, 5)).toEqual({ current: 1, total: 3 });
    expect(computeEpubPageIndicator(2, 5)).toEqual({ current: 2, total: 3 });
  });

  it("reports the last real page correctly, with no phantom extra final page", () => {
    expect(computeEpubPageIndicator(3, 5)).toEqual({ current: 3, total: 3 });
  });

  it("clamps a transient leading-phantom reading (page 0) to the first real page", () => {
    expect(computeEpubPageIndicator(0, 5)).toEqual({ current: 1, total: 3 });
  });

  it("clamps a transient trailing-phantom reading to the last real page", () => {
    expect(computeEpubPageIndicator(4, 5)).toEqual({ current: 3, total: 3 });
  });

  it("returns null for a degenerate chapter with no real pages", () => {
    expect(computeEpubPageIndicator(0, 2)).toBeNull();
  });
});
