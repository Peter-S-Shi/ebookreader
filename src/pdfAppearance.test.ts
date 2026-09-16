import { describe, expect, it, vi } from "vitest";
import {
  APPEARANCE_COLORS,
  extractImageRects,
  getPdfPageAppearancePreference,
  isScanLikeDocument,
  renderAppearanceOverlay,
  setPdfPageAppearancePreference,
  type PdfImageRect,
} from "./pdfAppearance";

describe("pdfAppearance module", () => {
  describe("appearance constants", () => {
    it("defines the standard Eye Care and Parchment colors", () => {
      expect(APPEARANCE_COLORS.eyecare).toBe("#c7edcc");
      expect(APPEARANCE_COLORS.parchment).toBe("#f4eedb");
    });
  });

  describe("extractImageRects", () => {
    const mockViewport = {
      width: 600,
      height: 800,
      scale: 1,
      convertToViewportPoint(x: number, y: number): [number, number] {
        return [x, 800 - y];
      },
    };

    const mockOps = {
      save: 1,
      restore: 2,
      transform: 3,
      paintImageXObject: 4,
      paintInlineImageXObject: 5,
      paintImageMaskXObject: 6,
      paintSolidColorImageMask: 7,
    };

    it("returns empty array when no image operators exist", () => {
      const opList = {
        fnArray: [mockOps.save, mockOps.restore],
        argsArray: [[], []],
      };
      const rects = extractImageRects(opList, mockViewport, mockOps);
      expect(rects).toEqual([]);
    });

    it("correctly extracts bounding box for transformed image operator", () => {
      const opList = {
        fnArray: [
          mockOps.save,
          mockOps.transform,
          mockOps.paintImageXObject,
          mockOps.restore,
        ],
        argsArray: [
          [],
          [200, 0, 0, 300, 50, 100],
          ["img1"],
          [],
        ],
      };

      const rects = extractImageRects(opList, mockViewport, mockOps);
      expect(rects.length).toBe(1);
      expect(rects[0].x).toBe(50);
      expect(rects[0].y).toBe(400);
      expect(rects[0].width).toBe(200);
      expect(rects[0].height).toBe(300);
      expect(rects[0].areaRatio).toBeCloseTo((200 * 300) / (600 * 800));
    });

    it("handles nested save and restore transform matrices correctly", () => {
      const opList = {
        fnArray: [
          mockOps.save,
          mockOps.transform,
          mockOps.save,
          mockOps.transform,
          mockOps.paintInlineImageXObject,
          mockOps.restore,
          mockOps.restore,
        ],
        argsArray: [
          [],
          [1, 0, 0, 1, 100, 100],
          [],
          [50, 0, 0, 50, 0, 0],
          ["inline1"],
          [],
          [],
        ],
      };

      const rects = extractImageRects(opList, mockViewport, mockOps);
      expect(rects.length).toBe(1);
      expect(rects[0].x).toBe(100);
      expect(rects[0].y).toBe(650);
      expect(rects[0].width).toBe(50);
      expect(rects[0].height).toBe(50);
    });
  });

  describe("isScanLikeDocument", () => {
    it("returns false for empty samples", () => {
      expect(isScanLikeDocument([])).toBe(false);
    });

    it("classifies pure scanned document with full-page images and zero text as scan-like", () => {
      const scanSamples = [
        { maxImageAreaRatio: 1.0, textCharCount: 0 },
        { maxImageAreaRatio: 1.0, textCharCount: 0 },
        { maxImageAreaRatio: 1.0, textCharCount: 0 },
        { maxImageAreaRatio: 1.0, textCharCount: 0 },
        { maxImageAreaRatio: 1.0, textCharCount: 0 },
      ];
      expect(isScanLikeDocument(scanSamples)).toBe(true);
    });

    it("does NOT classify text document with full-page cover as scan-like (sample doc)", () => {
      const docSamples = [
        { maxImageAreaRatio: 1.0, textCharCount: 0 },
        { maxImageAreaRatio: 0.0, textCharCount: 415 },
        { maxImageAreaRatio: 0.0, textCharCount: 448 },
        { maxImageAreaRatio: 0.0, textCharCount: 485 },
        { maxImageAreaRatio: 0.0, textCharCount: 462 },
      ];
      expect(isScanLikeDocument(docSamples)).toBe(false);
    });

    it("does NOT classify mixed layout document with photos and text as scan-like (sample mixed)", () => {
      const mixedSamples = [
        { maxImageAreaRatio: 0.25, textCharCount: 2500 },
        { maxImageAreaRatio: 0.38, textCharCount: 3000 },
        { maxImageAreaRatio: 0.15, textCharCount: 2200 },
        { maxImageAreaRatio: 0.28, textCharCount: 2800 },
      ];
      expect(isScanLikeDocument(mixedSamples)).toBe(false);
    });
  });

  describe("renderAppearanceOverlay", () => {
    function createMockCanvas(width: number, height: number) {
      const clearRect = vi.fn();
      const fillRect = vi.fn();
      const mockCtx = {
        clearRect,
        fillRect,
        fillStyle: "",
      };
      const canvas = {
        width,
        height,
        getContext: vi.fn((type: string) => (type === "2d" ? mockCtx : null)),
      } as unknown as HTMLCanvasElement;
      return { canvas, mockCtx, clearRect, fillRect };
    }

    it("clears the canvas for default and day modes without tinting", () => {
      const { canvas, clearRect, fillRect } = createMockCanvas(100, 100);

      renderAppearanceOverlay(canvas, 100, 100, "default", false, []);
      expect(clearRect).toHaveBeenCalledWith(0, 0, 100, 100);
      expect(fillRect).not.toHaveBeenCalled();

      clearRect.mockClear();
      fillRect.mockClear();

      renderAppearanceOverlay(canvas, 100, 100, "day", false, []);
      expect(clearRect).toHaveBeenCalledWith(0, 0, 100, 100);
      expect(fillRect).not.toHaveBeenCalled();
    });

    it("draws solid tint for scanned document in Eye Care mode without punching holes", () => {
      const { canvas, clearRect, fillRect } = createMockCanvas(500, 700);

      const dominantImage: PdfImageRect = { x: 0, y: 0, width: 500, height: 700, areaRatio: 1.0 };
      renderAppearanceOverlay(canvas, 500, 700, "eyecare", true, [dominantImage]);

      expect(fillRect).toHaveBeenCalledWith(0, 0, 500, 700);
      expect(clearRect).toHaveBeenCalledTimes(1);
      expect(clearRect).toHaveBeenCalledWith(0, 0, 500, 700);
    });

    it("punches transparent holes over embedded photos in text/mixed documents in Parchment mode", () => {
      const { canvas, clearRect, fillRect } = createMockCanvas(600, 800);

      const photo1: PdfImageRect = { x: 50, y: 100, width: 200, height: 150, areaRatio: 0.0625 };
      const photo2: PdfImageRect = { x: 300, y: 400, width: 250, height: 200, areaRatio: 0.104 };

      renderAppearanceOverlay(canvas, 600, 800, "parchment", false, [photo1, photo2]);

      expect(fillRect).toHaveBeenCalledWith(0, 0, 600, 800);
      expect(clearRect).toHaveBeenCalledTimes(3);
      expect(clearRect).toHaveBeenNthCalledWith(1, 0, 0, 600, 800);
      expect(clearRect).toHaveBeenNthCalledWith(2, 50, 100, 200, 150);
      expect(clearRect).toHaveBeenNthCalledWith(3, 300, 400, 250, 200);
    });
  });

  describe("preference persistence", () => {
    it("reads default when no preference is stored", () => {
      localStorage.clear();
      expect(getPdfPageAppearancePreference()).toBe("default");
    });

    it("persists and reads valid appearance values", () => {
      localStorage.clear();
      setPdfPageAppearancePreference("eyecare");
      expect(getPdfPageAppearancePreference()).toBe("eyecare");

      setPdfPageAppearancePreference("parchment");
      expect(getPdfPageAppearancePreference()).toBe("parchment");

      setPdfPageAppearancePreference("day");
      expect(getPdfPageAppearancePreference()).toBe("day");
    });

    it("falls back to default for unknown stored value", () => {
      localStorage.setItem("ebookreader.pdf.pageAppearance", "invalid-theme");
      expect(getPdfPageAppearancePreference()).toBe("default");
    });
  });
});
