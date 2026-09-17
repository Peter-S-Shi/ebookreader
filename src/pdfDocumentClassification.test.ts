import { describe, it, expect } from "vitest";
import {
  classifyPdfDocument,
  type PageTextSummary,
} from "./pdfDocumentClassification";

describe("pdfDocumentClassification", () => {
  it("classifies pure scanned PDF as SCAN with OCR eligible", () => {
    const pages: PageTextSummary[] = Array.from({ length: 100 }, () => ({
      textCharCount: 0,
      maxImageAreaRatio: 1.0,
    }));

    const result = classifyPdfDocument(pages, true);
    expect(result.kind).toBe("scan");
    expect(result.ocrEligible).toBe(true);
    expect(result.meaningfulTextPageCount).toBe(0);
    expect(result.meaningfulTextRatio).toBe(0);
    expect(result.isScanLike).toBe(true);
  });

  it("classifies predominantly scanned PDF with sparse incidental text (e.g. 1 watermark page in 500) as SCAN", () => {
    // 497 pages with 0 text, 1 page with watermark text
    const pages: PageTextSummary[] = [
      ...Array.from({ length: 497 }, () => ({ textCharCount: 0, maxImageAreaRatio: 1.0 })),
      { textCharCount: 1000, maxImageAreaRatio: 0 },
    ];

    const result = classifyPdfDocument(pages, true);
    expect(result.kind).toBe("scan");
    expect(result.ocrEligible).toBe(true);
    expect(result.meaningfulTextPageCount).toBe(1);
    expect(result.meaningfulTextRatio).toBeCloseTo(1 / 498, 3);
  });

  it("classifies predominantly text PDF with occasional image-only pages (e.g. cover/illustrations) as TEXT with OCR not eligible", () => {
    // 95 pages with 400 chars body text, 5 image/photo pages with 0 text
    const pages: PageTextSummary[] = [
      { textCharCount: 0, maxImageAreaRatio: 1.0 }, // cover
      ...Array.from({ length: 90 }, () => ({ textCharCount: 450, maxImageAreaRatio: 0 })),
      { textCharCount: 0, maxImageAreaRatio: 0.8 }, // photo
      ...Array.from({ length: 5 }, () => ({ textCharCount: 380, maxImageAreaRatio: 0.1 })),
      { textCharCount: 0, maxImageAreaRatio: 0.9 }, // illustration
      ...Array.from({ length: 2 }, () => ({ textCharCount: 500, maxImageAreaRatio: 0 })),
    ];

    const result = classifyPdfDocument(pages, false);
    expect(result.kind).toBe("text");
    expect(result.ocrEligible).toBe(false);
    expect(result.meaningfulTextRatio).toBeGreaterThanOrEqual(0.8);
  });

  it("classifies mixed document with meaningful text and meaningful scanned pages as HYBRID with OCR eligible", () => {
    // 50 text pages and 50 scanned pages
    const pages: PageTextSummary[] = [
      ...Array.from({ length: 50 }, () => ({ textCharCount: 400, maxImageAreaRatio: 0 })),
      ...Array.from({ length: 50 }, () => ({ textCharCount: 0, maxImageAreaRatio: 1.0 })),
    ];

    const result = classifyPdfDocument(pages, false);
    expect(result.kind).toBe("hybrid");
    expect(result.ocrEligible).toBe(true);
    expect(result.meaningfulTextRatio).toBe(0.5);
  });

  it("handles single-page documents accurately", () => {
    expect(classifyPdfDocument([{ textCharCount: 0 }]).kind).toBe("scan");
    expect(classifyPdfDocument([{ textCharCount: 0 }]).ocrEligible).toBe(true);

    expect(classifyPdfDocument([{ textCharCount: 200 }]).kind).toBe("text");
    expect(classifyPdfDocument([{ textCharCount: 200 }]).ocrEligible).toBe(false);
  });

  it("ignores sparse noise below meaningful threshold (e.g. lone page numbers or broken chars)", () => {
    // 100 pages with only 5 chars (e.g. page numbers)
    const pages: PageTextSummary[] = Array.from({ length: 100 }, () => ({
      textCharCount: 5,
      maxImageAreaRatio: 1.0,
    }));

    const result = classifyPdfDocument(pages, true);
    expect(result.kind).toBe("scan");
    expect(result.ocrEligible).toBe(true);
    expect(result.meaningfulTextPageCount).toBe(0);
  });
});
