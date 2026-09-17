// V2-M3 item 4: shared validator for TypographyPanel's free numeric
// inputs (Font Size, Line Height, Page Width, Margins), replacing the
// prior bounded range-slider model. The numeric input is authoritative --
// no arbitrary upper cap -- so this only rejects what the product
// contract actually rules out: non-finite values (NaN/Infinity) and
// values at or below each field's own minimum.
export type NumericInputResult = { kind: "empty" } | { kind: "invalid" } | { kind: "valid"; value: number };

export function parseTypographyNumericInput(raw: string, min: number, minInclusive: boolean): NumericInputResult {
  const trimmed = raw.trim();
  if (trimmed === "") return { kind: "empty" };
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return { kind: "invalid" };
  if (minInclusive ? value < min : value <= min) return { kind: "invalid" };
  return { kind: "valid", value };
}
