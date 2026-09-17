import { describe, expect, it } from "vitest";
import { parsePageJumpInput } from "./pdfPageInput";

describe("parsePageJumpInput", () => {
  it("accepts a valid in-range page", () => {
    expect(parsePageJumpInput("42", 136)).toEqual({ kind: "valid", page: 42 });
  });

  it("normalizes 0 to page 1", () => {
    expect(parsePageJumpInput("0", 136)).toEqual({ kind: "valid", page: 1 });
  });

  it("clamps a page above the count to the last page", () => {
    expect(parsePageJumpInput("999", 136)).toEqual({ kind: "valid", page: 136 });
  });

  it("rejects a decimal", () => {
    expect(parsePageJumpInput("4.5", 136)).toEqual({ kind: "invalid" });
  });

  it("rejects a negative number", () => {
    expect(parsePageJumpInput("-3", 136)).toEqual({ kind: "invalid" });
  });

  it("rejects letters and symbols", () => {
    expect(parsePageJumpInput("abc", 136)).toEqual({ kind: "invalid" });
    expect(parsePageJumpInput("12abc", 136)).toEqual({ kind: "invalid" });
    expect(parsePageJumpInput("#12", 136)).toEqual({ kind: "invalid" });
  });

  it("accepts leading zeros, normalizing them away", () => {
    expect(parsePageJumpInput("003", 136)).toEqual({ kind: "valid", page: 3 });
  });

  it("treats an empty (or whitespace-only) string as empty, not invalid", () => {
    expect(parsePageJumpInput("", 136)).toEqual({ kind: "empty" });
    expect(parsePageJumpInput("   ", 136)).toEqual({ kind: "empty" });
  });
});
