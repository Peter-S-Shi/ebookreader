export type PdfDocumentKind = "text" | "scan" | "hybrid";

export interface PageTextSummary {
  textCharCount: number;
  maxImageAreaRatio?: number;
}

export interface PdfDocumentClassification {
  kind: PdfDocumentKind;
  ocrEligible: boolean;
  totalPageCount: number;
  meaningfulTextPageCount: number;
  meaningfulTextRatio: number;
  isScanLike: boolean;
}

/**
 * Threshold in characters to consider a page as having meaningful readable body text
 * (vs sparse metadata, single-line watermark, or lone page number artifacts).
 */
export const MEANINGFUL_TEXT_CHAR_THRESHOLD = 50;

/**
 * If <= 10% of pages contain meaningful text, the document is predominantly scanned.
 */
export const SCAN_TEXT_RATIO_UPPER_BOUND = 0.1;

/**
 * If >= 80% of pages contain meaningful text, the document is predominantly text
 * (occasional cover, illustration, photograph, or diagram pages do not make it an OCR document).
 */
export const TEXT_TEXT_RATIO_LOWER_BOUND = 0.8;

/**
 * Classifies a PDF document into TEXT, SCAN, or HYBRID based on whole-document page text distribution.
 */
export function classifyPdfDocument(
  pages: PageTextSummary[],
  isScanLikeVisual = false,
): PdfDocumentClassification {
  const totalPageCount = pages.length;
  if (totalPageCount === 0) {
    return {
      kind: "text",
      ocrEligible: false,
      totalPageCount: 0,
      meaningfulTextPageCount: 0,
      meaningfulTextRatio: 0,
      isScanLike: false,
    };
  }

  const meaningfulTextPageCount = pages.filter(
    (p) => p.textCharCount >= MEANINGFUL_TEXT_CHAR_THRESHOLD,
  ).length;

  const meaningfulTextRatio = meaningfulTextPageCount / totalPageCount;

  let kind: PdfDocumentKind;
  if (totalPageCount === 1) {
    kind = meaningfulTextPageCount === 1 ? "text" : "scan";
  } else if (meaningfulTextRatio >= TEXT_TEXT_RATIO_LOWER_BOUND) {
    kind = "text";
  } else if (meaningfulTextRatio <= SCAN_TEXT_RATIO_UPPER_BOUND) {
    kind = "scan";
  } else {
    kind = "hybrid";
  }

  const ocrEligible = kind === "scan" || kind === "hybrid";
  const isScanLike = isScanLikeVisual || kind === "scan";

  return {
    kind,
    ocrEligible,
    totalPageCount,
    meaningfulTextPageCount,
    meaningfulTextRatio,
    isScanLike,
  };
}
