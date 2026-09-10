import { describe, it, expect } from "vitest";
import { calculateOcrRenderScale, DEFAULT_OCR_SCALE_OPTIONS } from "./ocrScaleUtils";

describe("calculateOcrRenderScale", () => {
  it("calculates appropriate target-DPI scale for a small pocket PDF page (e.g. 349.44 x 566.40 pt)", () => {
    // 349.44 pt x 566.40 pt (from real scanned book 《小说机杼》)
    const scale = calculateOcrRenderScale(349.44, 566.40);
    // At 250 DPI: 250 / 72 ≈ 3.4722
    // minShortSide = 1200 / 349.44 ≈ 3.4341
    // scale should be approx 3.4722
    expect(scale).toBeCloseTo(3.4722, 2);

    const renderedWidth = Math.round(349.44 * scale);
    const renderedHeight = Math.round(566.40 * scale);
    expect(renderedWidth).toBeGreaterThanOrEqual(1200);
    expect(renderedHeight).toBeLessThanOrEqual(3000);
  });

  it("handles landscape pages identically to portrait pages", () => {
    const portraitScale = calculateOcrRenderScale(349.44, 566.40);
    const landscapeScale = calculateOcrRenderScale(566.40, 349.44);
    expect(landscapeScale).toBe(portraitScale);
  });

  it("calculates target-DPI scale for standard A4 pages without exceeding memory ceiling", () => {
    // A4: 595.28 pt x 841.89 pt
    const scale = calculateOcrRenderScale(595.28, 841.89);
    expect(scale).toBeCloseTo(3.4722, 2);

    const renderedHeight = Math.round(841.89 * scale);
    expect(renderedHeight).toBeLessThanOrEqual(DEFAULT_OCR_SCALE_OPTIONS.maxLongSidePx);
  });

  it("calculates target-DPI scale for standard US Letter pages", () => {
    // US Letter: 612 pt x 792 pt
    const scale = calculateOcrRenderScale(612, 792);
    expect(scale).toBeCloseTo(3.4722, 2);

    const renderedWidth = Math.round(612 * scale);
    const renderedHeight = Math.round(792 * scale);
    expect(renderedWidth).toBeGreaterThanOrEqual(1200);
    expect(renderedHeight).toBeLessThanOrEqual(DEFAULT_OCR_SCALE_OPTIONS.maxLongSidePx);
  });

  it("constrains scale on oversized pages (e.g. A3: 841.89 x 1190.55 pt) to respect maxLongSidePx", () => {
    const scale = calculateOcrRenderScale(841.89, 1190.55);
    // 3000 / 1190.55 ≈ 2.5198
    expect(scale).toBeCloseTo(2.5198, 2);

    const renderedHeight = Math.round(1190.55 * scale);
    expect(renderedHeight).toBeLessThanOrEqual(3000);
  });

  it("safely caps huge poster/blueprint pages to the maximum long side pixel bound", () => {
    // 2000 pt x 3000 pt
    const scale = calculateOcrRenderScale(2000, 3000);
    // 3000 / 3000 = 1.0
    expect(scale).toBe(1.0);

    const renderedLongSide = Math.round(3000 * scale);
    expect(renderedLongSide).toBeLessThanOrEqual(3000);
  });

  it("enforces maxScale ceiling for tiny or icon-sized pages", () => {
    // 80 pt x 80 pt
    const scale = calculateOcrRenderScale(80, 80);
    expect(scale).toBe(DEFAULT_OCR_SCALE_OPTIONS.maxScale); // 4.0
  });

  it("enforces minScale floor when target scale would otherwise be lower", () => {
    const scale = calculateOcrRenderScale(500, 500, { targetDpi: 72, minShortSidePx: 400, minScale: 2.0 });
    expect(scale).toBe(2.0);
  });

  it("returns 1.0 for invalid, non-positive, or NaN dimensions", () => {
    expect(calculateOcrRenderScale(0, 500)).toBe(1.0);
    expect(calculateOcrRenderScale(-100, 500)).toBe(1.0);
    expect(calculateOcrRenderScale(NaN, 500)).toBe(1.0);
    expect(calculateOcrRenderScale(500, Infinity)).toBe(1.0);
  });

  it("respects custom options for DPI, dimension bounds, and scale limits", () => {
    const scale = calculateOcrRenderScale(350, 500, {
      targetDpi: 300,
      minShortSidePx: 1400,
      minScale: 1.0,
      maxScale: 5.0,
      maxLongSidePx: 4000,
    });
    // 300 / 72 = 4.1667; 1400 / 350 = 4.0; max is 4.1667
    expect(scale).toBeCloseTo(4.1667, 2);
  });
});
