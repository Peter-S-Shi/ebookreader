export interface OcrScaleOptions {
  /** Target DPI for standard text pages. Defaults to 250 DPI (~3.47x scale against 72pt/in). */
  targetDpi?: number;
  /** Minimum pixel dimension for the shorter page side. Defaults to 1200px. */
  minShortSidePx?: number;
  /** Minimum scale factor floor. Defaults to 1.5. */
  minScale?: number;
  /** Maximum scale factor ceiling. Defaults to 4.0. */
  maxScale?: number;
  /** Maximum pixel dimension for the longest page side to prevent pathological canvas allocations. Defaults to 3000px. */
  maxLongSidePx?: number;
}

export const DEFAULT_OCR_SCALE_OPTIONS: Required<OcrScaleOptions> = {
  targetDpi: 250,
  minShortSidePx: 1200,
  minScale: 1.5,
  maxScale: 4.0,
  maxLongSidePx: 3000,
};

/**
 * Calculates a bounded adaptive target-resolution render scale for scanned PDF pages.
 *
 * Ensures text line heights are sufficient for neural OCR recognition (~14-20+ px per text line)
 * even on physically small pocket PDF pages, while capping upper bounds on oversized pages
 * to prevent excessive memory and canvas allocations.
 */
export function calculateOcrRenderScale(
  widthPt: number,
  heightPt: number,
  options?: OcrScaleOptions
): number {
  const opts = { ...DEFAULT_OCR_SCALE_OPTIONS, ...options };
  const minSidePt = Math.min(widthPt, heightPt);
  const maxSidePt = Math.max(widthPt, heightPt);

  if (!Number.isFinite(minSidePt) || !Number.isFinite(maxSidePt) || minSidePt <= 0 || maxSidePt <= 0) {
    return 1.0;
  }

  // 1. Target scale from DPI (72 pt = 1 inch)
  const dpiScale = opts.targetDpi / 72;

  // 2. Target scale from minimum short side pixel requirement
  const minDimScale = opts.minShortSidePx / minSidePt;

  // 3. Take the scale that satisfies both target DPI and minimum resolution
  let scale = Math.max(dpiScale, minDimScale);

  // 4. Bound within minScale and maxScale
  scale = Math.min(opts.maxScale, Math.max(opts.minScale, scale));

  // 5. Apply upper memory safety bound on maximum long side dimension
  if (scale * maxSidePt > opts.maxLongSidePx) {
    const memoryConstrainedScale = opts.maxLongSidePx / maxSidePt;
    scale = Math.max(0.5, memoryConstrainedScale);
  }

  // Round to 4 decimal places for clean floating point behavior
  return Math.round(scale * 10000) / 10000;
}
