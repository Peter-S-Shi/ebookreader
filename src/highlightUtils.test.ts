import { describe, expect, it } from "vitest";
import { extractContextDetails, extractHighlightColor, formatContextSelector } from "./highlightUtils";

describe("highlightUtils", () => {
  it("formats context selector with color prefix", () => {
    expect(formatContextSelector("Sample text selection", "green")).toBe("color:green|Sample text selection");
  });

  it("formats context selector with prefix and suffix context", () => {
    expect(formatContextSelector("selection", "purple", "before ", " after")).toBe(
      "color:purple|prefix:before |suffix: after|selection",
    );
  });

  it("extracts highlight color from context selector", () => {
    expect(extractHighlightColor("color:blue|Sample text")).toBe("blue");
    expect(extractHighlightColor("color:purple|Chapter 1")).toBe("purple");
    expect(extractHighlightColor("color:green|prefix:abc|suffix:def|Chapter 1")).toBe("green");
  });

  it("extracts context details including prefix and suffix", () => {
    const details = extractContextDetails("color:orange|prefix:leading text |suffix: trailing text|exact words");
    expect(details.color).toBe("orange");
    expect(details.prefix).toBe("leading text ");
    expect(details.suffix).toBe(" trailing text");
  });

  it("defaults to yellow when no color prefix is present", () => {
    expect(extractHighlightColor("Chapter 1, paragraph 2")).toBe("yellow");
    expect(extractHighlightColor(null)).toBe("yellow");
    expect(extractHighlightColor(undefined)).toBe("yellow");
    expect(extractHighlightColor("color:invalid|text")).toBe("yellow");
  });
});
