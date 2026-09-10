import { describe, expect, it } from "vitest";
import { extractHighlightColor, formatContextSelector } from "./highlightUtils";

describe("highlightUtils", () => {
  it("formats context selector with color prefix", () => {
    expect(formatContextSelector("Sample text selection", "green")).toBe("color:green|Sample text selection");
  });

  it("extracts highlight color from context selector", () => {
    expect(extractHighlightColor("color:blue|Sample text")).toBe("blue");
    expect(extractHighlightColor("color:purple|Chapter 1")).toBe("purple");
  });

  it("defaults to yellow when no color prefix is present", () => {
    expect(extractHighlightColor("Chapter 1, paragraph 2")).toBe("yellow");
    expect(extractHighlightColor(null)).toBe("yellow");
    expect(extractHighlightColor(undefined)).toBe("yellow");
    expect(extractHighlightColor("color:invalid|text")).toBe("yellow");
  });
});
