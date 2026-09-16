export interface ViewportRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type PdfLinkTarget =
  | { kind: "internal"; pageNumber: number }
  | { kind: "external"; url: string }
  | { kind: "unsupported"; actionType?: string; rawUrl?: string };

export interface PdfLinkItem {
  id?: string;
  rect: ViewportRect;
  target: PdfLinkTarget;
}

export interface RawPdfAnnotation {
  subtype?: string;
  rect: [number, number, number, number];
  url?: string;
  dest?: any;
  action?: string;
  [key: string]: any;
}

export interface PdfViewportLike {
  convertToViewportPoint: (x: number, y: number) => number[] | [number, number];
}

/**
 * Checks whether an external URL uses a supported safe scheme (http: or https:).
 * Explicitly rejects javascript:, file:, data:, blob:, and arbitrary other schemes.
 */
export function isSupportedExternalScheme(rawUrl: string): boolean {
  if (!rawUrl || typeof rawUrl !== "string") return false;
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Converts a PDF coordinate rectangle [minX, minY, maxX, maxY] into viewport CSS coordinates.
 */
export function convertAnnotationRect(
  pdfRect: [number, number, number, number],
  viewport: PdfViewportLike,
): ViewportRect {
  const [minX, minY, maxX, maxY] = pdfRect;
  const p1 = viewport.convertToViewportPoint(minX, minY);
  const p2 = viewport.convertToViewportPoint(maxX, maxY);
  const x1 = p1[0] ?? 0;
  const y1 = p1[1] ?? 0;
  const x2 = p2[0] ?? 0;
  const y2 = p2[1] ?? 0;

  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  const width = Math.abs(x2 - x1);
  const height = Math.abs(y2 - y1);

  return { left, top, width, height };
}

/**
 * Resolves a PDF Link annotation to its semantic target (internal page, external URL, or unsupported).
 */
export async function resolvePdfLinkTarget(
  annotation: RawPdfAnnotation,
  pdfDoc: {
    getDestination?: (name: string) => Promise<any>;
    getPageIndex?: (ref: any) => Promise<number>;
  },
): Promise<PdfLinkTarget> {
  // 1. Check external URL
  if (annotation.url) {
    if (isSupportedExternalScheme(annotation.url)) {
      return { kind: "external", url: annotation.url };
    }
    return { kind: "unsupported", actionType: "disallowed_url_scheme", rawUrl: annotation.url };
  }

  // 2. Check internal destination (explicit or named)
  let dest = annotation.dest;
  if (typeof dest === "string" && pdfDoc.getDestination) {
    try {
      dest = await pdfDoc.getDestination(dest);
    } catch {
      dest = null;
    }
  }

  if (Array.isArray(dest) && dest.length > 0) {
    const first = dest[0];
    if (typeof first === "number") {
      // 0-based page index directly in dest array
      return { kind: "internal", pageNumber: first + 1 };
    }
    if (first && typeof first === "object" && pdfDoc.getPageIndex) {
      try {
        const pageIndex = await pdfDoc.getPageIndex(first);
        if (Number.isFinite(pageIndex) && pageIndex >= 0) {
          return { kind: "internal", pageNumber: pageIndex + 1 };
        }
      } catch {
        // Page index resolution failed
      }
    }
  }

  // 3. Fallback for other action types (e.g. Launch, GoToR, Named actions)
  if (annotation.action) {
    return { kind: "unsupported", actionType: annotation.action };
  }

  return { kind: "unsupported" };
}

/**
 * Extracts and resolves all clickable Link annotations for a PDF page within the current viewport.
 */
export async function extractPagePdfLinks(
  page: { getAnnotations: (options?: any) => Promise<RawPdfAnnotation[]> },
  pdfDoc: {
    getDestination?: (name: string) => Promise<any>;
    getPageIndex?: (ref: any) => Promise<number>;
  },
  viewport: PdfViewportLike,
): Promise<PdfLinkItem[]> {
  try {
    const annotations = await page.getAnnotations({ intent: "display" });
    const linkAnnotations = annotations.filter((ann) => ann && ann.subtype === "Link" && Array.isArray(ann.rect));

    const resolved: PdfLinkItem[] = [];
    for (const ann of linkAnnotations) {
      const rect = convertAnnotationRect(ann.rect, viewport);
      const target = await resolvePdfLinkTarget(ann, pdfDoc);
      resolved.push({ rect, target });
    }

    return resolved;
  } catch {
    return [];
  }
}
