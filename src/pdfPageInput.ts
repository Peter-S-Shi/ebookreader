// Pure validator for the PDF reader's editable current-page field (V2-M2
// addendum). Kept separate from PdfReader.tsx so the input contract --
// which characters are even acceptable, independent of clamping -- is
// testable without rendering anything, and so the reader doesn't rely on
// the browser's own `<input type="number">` validity (which accepts
// scientific notation, trailing "e", etc. that this contract rejects).

export type PageJumpResult = { kind: "empty" } | { kind: "invalid" } | { kind: "valid"; page: number };

const NATURAL_NUMBER = /^\d+$/;

export function parsePageJumpInput(raw: string, pageCount: number): PageJumpResult {
  const trimmed = raw.trim();
  if (trimmed === "") return { kind: "empty" };
  if (!NATURAL_NUMBER.test(trimmed)) return { kind: "invalid" };
  const parsed = Number.parseInt(trimmed, 10);
  const maxPage = pageCount > 0 ? pageCount : parsed;
  return { kind: "valid", page: Math.min(Math.max(parsed, 1), maxPage) };
}
