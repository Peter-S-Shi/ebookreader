import * as pdfjsLib from "pdfjs-dist";

export type PdfPageAppearance = "default" | "day" | "eyecare" | "parchment" | "night";

export interface PdfImageRect {
  x: number;
  y: number;
  width: number;
  height: number;
  areaRatio: number;
}

export const APPEARANCE_COLORS: Record<PdfPageAppearance, string | null> = {
  default: null,
  day: "#ffffff",
  eyecare: "#c7edcc",
  parchment: "#f4eedb",
  night: null,
};

const STORAGE_KEY = "ebookreader.pdf.pageAppearance";

export function getPdfPageAppearancePreference(): PdfPageAppearance {
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    if (val === "day" || val === "eyecare" || val === "parchment" || val === "night") {
      return val;
    }
  } catch {
    // ignore storage access error
  }
  return "default";
}

export function setPdfPageAppearancePreference(appearance: PdfPageAppearance): void {
  try {
    localStorage.setItem(STORAGE_KEY, appearance);
  } catch {
    // ignore storage access error
  }
}

interface MinimalViewport {
  width: number;
  height: number;
  convertToViewportPoint: (x: number, y: number) => number[] | [number, number];
}

interface MinimalOperatorList {
  fnArray: number[];
  argsArray: any[];
}

function transformPoint(matrix: number[], x: number, y: number): { x: number; y: number } {
  return {
    x: matrix[0] * x + matrix[2] * y + matrix[4],
    y: matrix[1] * x + matrix[3] * y + matrix[5],
  };
}

export function extractImageRects(
  opList: MinimalOperatorList,
  viewport: MinimalViewport,
  customOps?: Record<string, number>,
): PdfImageRect[] {
  let OPS: Record<string, number> = customOps || {};
  if (!customOps) {
    try {
      if (pdfjsLib && "OPS" in pdfjsLib && pdfjsLib.OPS) {
        OPS = pdfjsLib.OPS as Record<string, number>;
      }
    } catch {
      // fallback
    }
  }

  const opSave = OPS.save ?? 17;
  const opRestore = OPS.restore ?? 18;
  const opTransform = OPS.transform ?? 21;
  const opPaintImageXObject = OPS.paintImageXObject ?? 82;
  const opPaintInlineImageXObject = OPS.paintInlineImageXObject ?? 83;
  const opPaintImageMaskXObject = OPS.paintImageMaskXObject ?? 84;
  const opPaintSolidColorImageMask = OPS.paintSolidColorImageMask ?? 85;

  let ctm = [1, 0, 0, 1, 0, 0];
  const transformStack: number[][] = [];
  const imageRects: PdfImageRect[] = [];

  const fnArray = opList.fnArray || [];
  const argsArray = opList.argsArray || [];

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i];

    if (fn === opSave) {
      transformStack.push([...ctm]);
    } else if (fn === opRestore) {
      if (transformStack.length > 0) {
        ctm = transformStack.pop()!;
      }
    } else if (fn === opTransform && Array.isArray(args) && args.length >= 6) {
      const [a, b, c, d, e, f] = args;
      ctm = [
        ctm[0] * a + ctm[2] * b,
        ctm[1] * a + ctm[3] * b,
        ctm[0] * c + ctm[2] * d,
        ctm[1] * c + ctm[3] * d,
        ctm[0] * e + ctm[2] * f + ctm[4],
        ctm[1] * e + ctm[3] * f + ctm[5],
      ];
    } else if (
      fn === opPaintImageXObject ||
      fn === opPaintInlineImageXObject ||
      fn === opPaintImageMaskXObject ||
      fn === opPaintSolidColorImageMask
    ) {
      const p0 = transformPoint(ctm, 0, 0);
      const p1 = transformPoint(ctm, 1, 0);
      const p2 = transformPoint(ctm, 1, 1);
      const p3 = transformPoint(ctm, 0, 1);

      const minX = Math.min(p0.x, p1.x, p2.x, p3.x);
      const maxX = Math.max(p0.x, p1.x, p2.x, p3.x);
      const minY = Math.min(p0.y, p1.y, p2.y, p3.y);
      const maxY = Math.max(p0.y, p1.y, p2.y, p3.y);

      const vpTopLeft = viewport.convertToViewportPoint(minX, maxY);
      const vpBottomRight = viewport.convertToViewportPoint(maxX, minY);

      const x = Math.min(vpTopLeft[0], vpBottomRight[0]);
      const y = Math.min(vpTopLeft[1], vpBottomRight[1]);
      const width = Math.abs(vpBottomRight[0] - vpTopLeft[0]);
      const height = Math.abs(vpBottomRight[1] - vpTopLeft[1]);

      if (width > 0 && height > 0) {
        const area = width * height;
        const pageArea = Math.max(1, viewport.width * viewport.height);
        const areaRatio = area / pageArea;

        imageRects.push({
          x,
          y,
          width,
          height,
          areaRatio,
        });
      }
    }
  }

  return imageRects;
}

export interface PageScanSample {
  textCharCount: number;
  maxImageAreaRatio: number;
}

export function isScanLikeDocument(samples: PageScanSample[]): boolean {
  if (!samples || samples.length === 0) return false;

  const scanCandidates = samples.filter(
    (s) => s.maxImageAreaRatio >= 0.8 && s.textCharCount < 60,
  );

  if (samples.length === 1) {
    return scanCandidates.length === 1;
  }

  const totalTextChars = samples.reduce((acc, s) => acc + s.textCharCount, 0);
  const avgTextChars = totalTextChars / samples.length;

  return scanCandidates.length >= 2 && scanCandidates.length / samples.length >= 0.6 && avgTextChars < 100;
}

export function renderAppearanceOverlay(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  appearance: PdfPageAppearance,
  isScanLikeDoc: boolean,
  imageRects: PdfImageRect[],
  sourceCanvas?: HTMLCanvasElement | null,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, width, height);

  if (appearance === "default" || appearance === "day") {
    if (canvas.style) canvas.style.mixBlendMode = "normal";
    return;
  }

  if (appearance === "night") {
    if (canvas.style) canvas.style.mixBlendMode = "normal";
    if (!isScanLikeDoc && sourceCanvas && imageRects.length > 0) {
      for (const rect of imageRects) {
        try {
          ctx.drawImage(
            sourceCanvas,
            rect.x,
            rect.y,
            rect.width,
            rect.height,
            rect.x,
            rect.y,
            rect.width,
            rect.height,
          );
        } catch {
          // ignore drawImage error if source canvas is empty
        }
      }
    }
    return;
  }

  // eyecare or parchment
  if (canvas.style) canvas.style.mixBlendMode = "multiply";
  const color = APPEARANCE_COLORS[appearance];
  if (!color) return;

  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);

  if (!isScanLikeDoc && imageRects.length > 0) {
    for (const rect of imageRects) {
      // Punch hole over ordinary photos/images in text/mixed PDFs
      ctx.clearRect(rect.x, rect.y, rect.width, rect.height);
    }
  }
}
