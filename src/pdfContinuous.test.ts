import { describe, expect, it } from "vitest";
import { currentPageFromScroll } from "./pdfContinuous";

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
