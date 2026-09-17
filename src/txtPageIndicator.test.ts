import { describe, expect, it } from "vitest";
import { computeTxtPageIndicator } from "./txtPageIndicator";

describe("computeTxtPageIndicator", () => {
  // TXT has no chapters/headings to infer from (deliberately, per the
  // product contract) -- K/N is synthetic, derived purely from the
  // scroll container's own measured geometry: N = how many viewport-
  // heights the whole document spans, K = which one scrollTop is in.

  it("returns null before layout has measured anything", () => {
    expect(computeTxtPageIndicator(0, 0, 0)).toBeNull();
  });

  it("reports page 1 of N at the top of the document", () => {
    expect(computeTxtPageIndicator(0, 800, 4000)).toEqual({ current: 1, total: 5 });
  });

  it("reports the middle page for a scroll position partway through", () => {
    expect(computeTxtPageIndicator(1600, 800, 4000)).toEqual({ current: 3, total: 5 });
  });

  it("clamps the last page: rounds up for a partial final viewport-height", () => {
    // 4200 / 800 = 5.25 -> 6 total pages; scrolled almost to the very end.
    expect(computeTxtPageIndicator(3400, 800, 4200)).toEqual({ current: 5, total: 6 });
  });

  it("treats a document shorter than one viewport as a single page", () => {
    expect(computeTxtPageIndicator(0, 800, 300)).toEqual({ current: 1, total: 1 });
  });
});
