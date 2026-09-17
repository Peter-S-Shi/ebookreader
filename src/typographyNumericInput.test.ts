import { describe, expect, it } from "vitest";
import { parseTypographyNumericInput } from "./typographyNumericInput";

describe("parseTypographyNumericInput", () => {
  it("accepts a valid positive integer", () => {
    expect(parseTypographyNumericInput("150", 0, false)).toEqual({ kind: "valid", value: 150 });
  });

  it("accepts decimals, with no arbitrary upper cap", () => {
    expect(parseTypographyNumericInput("2.75", 0, false)).toEqual({ kind: "valid", value: 2.75 });
    expect(parseTypographyNumericInput("9999", 0, false)).toEqual({ kind: "valid", value: 9999 });
  });

  it("rejects a value at or below an exclusive minimum (Font Size/Line Height/Page Width: > 0)", () => {
    expect(parseTypographyNumericInput("0", 0, false)).toEqual({ kind: "invalid" });
    expect(parseTypographyNumericInput("-5", 0, false)).toEqual({ kind: "invalid" });
  });

  it("accepts zero at an inclusive minimum (Margins: >= 0), but rejects below it", () => {
    expect(parseTypographyNumericInput("0", 0, true)).toEqual({ kind: "valid", value: 0 });
    expect(parseTypographyNumericInput("-1", 0, true)).toEqual({ kind: "invalid" });
  });

  it("rejects NaN and Infinity", () => {
    expect(parseTypographyNumericInput("NaN", 0, false)).toEqual({ kind: "invalid" });
    expect(parseTypographyNumericInput("Infinity", 0, false)).toEqual({ kind: "invalid" });
    expect(parseTypographyNumericInput("-Infinity", 0, false)).toEqual({ kind: "invalid" });
  });

  it("rejects letters, symbols, and malformed mixed input", () => {
    expect(parseTypographyNumericInput("abc", 0, false)).toEqual({ kind: "invalid" });
    expect(parseTypographyNumericInput("12abc", 0, false)).toEqual({ kind: "invalid" });
    expect(parseTypographyNumericInput("#12", 0, false)).toEqual({ kind: "invalid" });
  });

  it("treats an empty (or whitespace-only) string as empty, not invalid", () => {
    expect(parseTypographyNumericInput("", 0, false)).toEqual({ kind: "empty" });
    expect(parseTypographyNumericInput("   ", 0, false)).toEqual({ kind: "empty" });
  });
});
