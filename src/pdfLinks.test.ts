import { describe, it, expect, vi } from "vitest";
import {
  isSupportedExternalScheme,
  convertAnnotationRect,
  resolvePdfLinkTarget,
  extractPagePdfLinks,
  type RawPdfAnnotation,
} from "./pdfLinks";

describe("pdfLinks", () => {
  describe("isSupportedExternalScheme", () => {
    it("accepts valid http and https URLs", () => {
      expect(isSupportedExternalScheme("http://example.com")).toBe(true);
      expect(isSupportedExternalScheme("https://example.com/path?foo=1&bar=2#sec")).toBe(true);
      expect(isSupportedExternalScheme("HTTPS://SECURE.SITE.ORG")).toBe(true);
      expect(isSupportedExternalScheme("http://localhost:8080/test")).toBe(true);
    });

    it("rejects dangerous or unsupported schemes", () => {
      expect(isSupportedExternalScheme("javascript:alert(1)")).toBe(false);
      expect(isSupportedExternalScheme("JAVASCRIPT:void(0)")).toBe(false);
      expect(isSupportedExternalScheme("file:///C:/windows/system32/cmd.exe")).toBe(false);
      expect(isSupportedExternalScheme("data:text/html,<h1>hi</h1>")).toBe(false);
      expect(isSupportedExternalScheme("blob:https://example.com/123-456")).toBe(false);
      expect(isSupportedExternalScheme("ms-settings:privacy")).toBe(false);
      expect(isSupportedExternalScheme("tel:123456789")).toBe(false);
      expect(isSupportedExternalScheme("mailto:test@example.com")).toBe(false);
      expect(isSupportedExternalScheme("")).toBe(false);
      expect(isSupportedExternalScheme("not a url")).toBe(false);
    });
  });

  describe("convertAnnotationRect", () => {
    it("transforms PDF coordinate rectangle to viewport CSS rectangle", () => {
      // Mock viewport that inverts Y axis as pdf.js does (PDF 0,0 is bottom-left; CSS 0,0 is top-left)
      const mockViewport = {
        convertToViewportPoint: (x: number, y: number): [number, number] => {
          return [x * 1.5, 800 - y * 1.5];
        },
      };

      // PDF rect: [minX: 100, minY: 200, maxX: 300, maxY: 250]
      // point 1 (100, 200) -> [150, 800 - 300 = 500]
      // point 2 (300, 250) -> [450, 800 - 375 = 425]
      const rect = convertAnnotationRect([100, 200, 300, 250], mockViewport as any);
      expect(rect.left).toBe(150);
      expect(rect.top).toBe(425);
      expect(rect.width).toBe(300);
      expect(rect.height).toBe(75);
    });
  });

  describe("resolvePdfLinkTarget", () => {
    const mockPdfDoc = {
      getDestination: vi.fn(),
      getPageIndex: vi.fn(),
    };

    it("resolves valid HTTP/HTTPS external URI with exact URL preserved", async () => {
      const ann: RawPdfAnnotation = {
        subtype: "Link",
        rect: [10, 10, 100, 50],
        url: "https://example.com/path/to/resource?source=ebookreader&case=external-link#target",
      };

      const target = await resolvePdfLinkTarget(ann, mockPdfDoc as any);
      expect(target).toEqual({
        kind: "external",
        url: "https://example.com/path/to/resource?source=ebookreader&case=external-link#target",
      });
    });

    it("rejects disallowed external schemes as unsupported", async () => {
      const ann: RawPdfAnnotation = {
        subtype: "Link",
        rect: [10, 10, 100, 50],
        url: "javascript:evil()",
      };

      const target = await resolvePdfLinkTarget(ann, mockPdfDoc as any);
      expect(target.kind).toBe("unsupported");
      if (target.kind === "unsupported") {
        expect(target.actionType).toBe("disallowed_url_scheme");
      }
    });

    it("resolves explicit destination array with ref to 1-based page number", async () => {
      const ref = { num: 42, gen: 0 };
      mockPdfDoc.getPageIndex.mockResolvedValueOnce(9); // 0-based index 9 = page 10

      const ann: RawPdfAnnotation = {
        subtype: "Link",
        rect: [10, 10, 100, 50],
        dest: [ref, { name: "XYZ" }, 0, 500, 1],
      };

      const target = await resolvePdfLinkTarget(ann, mockPdfDoc as any);
      expect(mockPdfDoc.getPageIndex).toHaveBeenCalledWith(ref);
      expect(target).toEqual({
        kind: "internal",
        pageNumber: 10,
      });
    });

    it("resolves named destination string to explicit destination then page number", async () => {
      const ref = { num: 99, gen: 0 };
      mockPdfDoc.getDestination.mockResolvedValueOnce([ref, { name: "Fit" }]);
      mockPdfDoc.getPageIndex.mockResolvedValueOnce(3); // index 3 = page 4

      const ann: RawPdfAnnotation = {
        subtype: "Link",
        rect: [10, 10, 100, 50],
        dest: "chapter-one",
      };

      const target = await resolvePdfLinkTarget(ann, mockPdfDoc as any);
      expect(mockPdfDoc.getDestination).toHaveBeenCalledWith("chapter-one");
      expect(mockPdfDoc.getPageIndex).toHaveBeenCalledWith(ref);
      expect(target).toEqual({
        kind: "internal",
        pageNumber: 4,
      });
    });

    it("resolves numeric page index destination array", async () => {
      const ann: RawPdfAnnotation = {
        subtype: "Link",
        rect: [10, 10, 100, 50],
        dest: [5, { name: "XYZ" }, 0, 0, null],
      };

      const target = await resolvePdfLinkTarget(ann, mockPdfDoc as any);
      expect(target).toEqual({
        kind: "internal",
        pageNumber: 6,
      });
    });

    it("marks Launch, GoToR, or other non-standard actions as unsupported", async () => {
      const annLaunch: RawPdfAnnotation = {
        subtype: "Link",
        rect: [10, 10, 100, 50],
        action: "Launch",
      };
      expect(await resolvePdfLinkTarget(annLaunch, mockPdfDoc as any)).toEqual({
        kind: "unsupported",
        actionType: "Launch",
      });

      const annGoToR: RawPdfAnnotation = {
        subtype: "Link",
        rect: [10, 10, 100, 50],
        action: "GoToR",
      };
      expect(await resolvePdfLinkTarget(annGoToR, mockPdfDoc as any)).toEqual({
        kind: "unsupported",
        actionType: "GoToR",
      });
    });
  });

  describe("extractPagePdfLinks", () => {
    it("extracts and converts Link annotations from a page, ignoring non-links", async () => {
      const mockPage = {
        getAnnotations: vi.fn().mockResolvedValue([
          {
            subtype: "Link",
            rect: [10, 20, 110, 70],
            url: "https://example.com/",
          },
          {
            subtype: "Text", // not a Link
            rect: [50, 50, 100, 100],
            contents: "A note",
          },
          {
            subtype: "Link",
            rect: [200, 300, 400, 350],
            dest: [2, { name: "XYZ" }],
          },
        ]),
      };

      const mockViewport = {
        convertToViewportPoint: (x: number, y: number): [number, number] => [x * 2, y * 2],
      };

      const mockPdfDoc = {
        getDestination: vi.fn(),
        getPageIndex: vi.fn(),
      };

      const links = await extractPagePdfLinks(mockPage as any, mockPdfDoc as any, mockViewport as any);
      expect(links).toHaveLength(2);
      expect(links[0].target).toEqual({ kind: "external", url: "https://example.com/" });
      expect(links[0].rect).toEqual({ left: 20, top: 40, width: 200, height: 100 });
      expect(links[1].target).toEqual({ kind: "internal", pageNumber: 3 });
      expect(links[1].rect).toEqual({ left: 400, top: 600, width: 400, height: 100 });
    });
  });
});
