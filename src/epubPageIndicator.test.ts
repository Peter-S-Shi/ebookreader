import { describe, expect, it } from "vitest";
import { computeEpubPageIndicator } from "./epubPageIndicator";

describe("computeEpubPageIndicator", () => {
  // foliate-js's Paginator pads each chapter with a leading and trailing
  // phantom column (confirmed via its #afterScroll header-visibility check,
  // `page > 1 ? visible : hidden` -- page 1 is the phantom lead-in), and its
  // own columnize() layout already expands content to an exact multiple of
  // the page/spread size via Math.ceil before `pages` is ever read, so
  // single vs double column and an odd final column are already accounted
  // for by the time `page`/`pages` reach here.

  it("returns null before layout has measured anything (pages not yet positive)", () => {
    expect(computeEpubPageIndicator(1, 0)).toBeNull();
  });

  it("derives the 1-based current page and total pages by stripping the phantom padding", () => {
    // A 3-page chapter: pages getter reports 4 (3 real + 1 phantom),
    // page getter reports 2 for the first real page.
    expect(computeEpubPageIndicator(2, 4)).toEqual({ current: 1, total: 3 });
  });

  it("reports the last real page correctly", () => {
    expect(computeEpubPageIndicator(4, 4)).toEqual({ current: 3, total: 3 });
  });

  it("clamps a transient phantom-lead-in reading (page 1) to the first real page", () => {
    expect(computeEpubPageIndicator(1, 4)).toEqual({ current: 1, total: 3 });
  });

  it("returns null for a single-column-count degenerate case with no real pages", () => {
    expect(computeEpubPageIndicator(1, 1)).toBeNull();
  });
});
