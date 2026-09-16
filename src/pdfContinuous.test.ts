import { describe, expect, it } from "vitest";
import {
  computeActivePageRange,
  computeActivePagesFromScroll,
  computePageHeights,
  currentPageFromScroll,
  diffActivePages,
  estimatePageDimensions,
  getPageTopOffset,
  resolvePageDimension,
} from "./pdfContinuous";

describe("currentPageFromScroll", () => {
  const heights = [100, 200, 150]; // page 1: 0-100, page 2: 100-300, page 3: 300-450

  it("returns page 1 at the very top", () => {
    expect(currentPageFromScroll(heights, 0)).toBe(1);
  });

  it("returns page 2 once scrolled past page 1", () => {
    expect(currentPageFromScroll(heights, 150)).toBe(2);
  });

  it("returns page 3 near the bottom", () => {
    expect(currentPageFromScroll(heights, 400)).toBe(3);
  });

  it("clamps to the last page when scrollTop exceeds total height", () => {
    expect(currentPageFromScroll(heights, 10000)).toBe(3);
  });

  it("returns 1 for an empty page list", () => {
    expect(currentPageFromScroll([], 50)).toBe(1);
  });
});

describe("computeActivePageRange", () => {
  it("bounds the active range around the current page with overscan", () => {
    expect(computeActivePageRange(1, 100, 2)).toEqual({ startPage: 1, endPage: 3 });
    expect(computeActivePageRange(50, 100, 2)).toEqual({ startPage: 48, endPage: 52 });
    expect(computeActivePageRange(100, 100, 2)).toEqual({ startPage: 98, endPage: 100 });
  });

  it("handles small documents where total pages is less than window", () => {
    expect(computeActivePageRange(1, 2, 2)).toEqual({ startPage: 1, endPage: 2 });
    expect(computeActivePageRange(2, 2, 2)).toEqual({ startPage: 1, endPage: 2 });
  });

  it("clamps invalid page inputs gracefully", () => {
    expect(computeActivePageRange(0, 10, 2)).toEqual({ startPage: 1, endPage: 3 });
    expect(computeActivePageRange(50, 10, 2)).toEqual({ startPage: 8, endPage: 10 });
  });
});

describe("computeActivePagesFromScroll", () => {
  const heights = [500, 500, 500, 500, 500, 500, 500, 500, 500, 500]; // 10 pages, 500px each

  it("determines intersecting pages plus overscan", () => {
    // Viewport height 800 at scrollTop 1200 -> covers y in [1200, 2000]
    // Directly visible: page 3 (1000-1500), page 4 (1500-2000)
    // Overscan = 1 page: includes page 2 (before) and page 5 (after)
    const active = computeActivePagesFromScroll(heights, 1200, 800, 1);
    expect(active).toEqual([2, 3, 4, 5]);
  });

  it("handles top of document without underflowing below page 1", () => {
    const active = computeActivePagesFromScroll(heights, 0, 600, 1);
    expect(active).toEqual([1, 2, 3]);
  });

  it("handles bottom of document without overflowing total pages", () => {
    const active = computeActivePagesFromScroll(heights, 4500, 600, 1);
    expect(active).toEqual([9, 10]);
  });
});

describe("estimatePageDimensions", () => {
  it("scales page 1 unscaled dimensions by zoomScale", () => {
    const dims = estimatePageDimensions({ width: 600, height: 800 }, 1.5);
    expect(dims).toEqual({ width: 900, height: 1200 });
  });

  it("uses sensible standard document default if unscaled viewport is not provided", () => {
    const dims = estimatePageDimensions(null, 1.0);
    expect(dims.width).toBeGreaterThan(500);
    expect(dims.height).toBeGreaterThan(700);
  });
});

describe("resolvePageDimension & computePageHeights", () => {
  it("resolves specific page dimensions or falls back to Page 1 / default", () => {
    // Normal page
    expect(resolvePageDimension({ width: 600, height: 800 }, null, 1.5)).toEqual({ width: 900, height: 1200 });
    // Landscape / rotated page (900x600)
    expect(resolvePageDimension({ width: 900, height: 600 }, null, 1.0)).toEqual({ width: 900, height: 600 });
    // Null with fallback to page 1
    expect(resolvePageDimension(null, { width: 500, height: 700 }, 2.0)).toEqual({ width: 1000, height: 1400 });
  });

  it("computes per-page heights including gap for mixed page sizes", () => {
    const mixedDims = [
      { width: 600, height: 800 }, // Page 1: 800 * 1.0 + 16 = 816
      { width: 900, height: 600 }, // Page 2 (landscape): 600 * 1.0 + 16 = 616
      { width: 600, height: 1200 }, // Page 3 (tall foldout): 1200 * 1.0 + 16 = 1216
    ];
    const heights = computePageHeights(mixedDims, null, 1.0, 16);
    expect(heights).toEqual([816, 616, 1216]);
  });

  it("computes cumulative page top offset accurately for mixed page heights", () => {
    const heights = [816, 616, 1216]; // Page 1 starts at 0, Page 2 at 816, Page 3 at 1432
    expect(getPageTopOffset(heights, 1)).toBe(0);
    expect(getPageTopOffset(heights, 2)).toBe(816);
    expect(getPageTopOffset(heights, 3)).toBe(1432);
    expect(getPageTopOffset(heights, 4)).toBe(2648);
  });

  it("tracks current page across mixed heights correctly", () => {
    const heights = [816, 616, 1216];
    expect(currentPageFromScroll(heights, 0)).toBe(1);
    expect(currentPageFromScroll(heights, 815)).toBe(1);
    expect(currentPageFromScroll(heights, 816)).toBe(2);
    expect(currentPageFromScroll(heights, 1431)).toBe(2);
    expect(currentPageFromScroll(heights, 1432)).toBe(3);
    expect(currentPageFromScroll(heights, 2000)).toBe(3);
  });
});

describe("diffActivePages", () => {
  it("determines pages to mount/render and pages to evict/clean", () => {
    const previous = new Set([1, 2, 3]);
    const next = new Set([2, 3, 4, 5]);
    const { toRender, toEvict } = diffActivePages(previous, next);
    expect(toRender).toEqual([4, 5]);
    expect(toEvict).toEqual([1]);
  });
});
