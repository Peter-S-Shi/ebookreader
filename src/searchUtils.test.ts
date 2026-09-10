import { describe, expect, it } from "vitest";
import { formatSearchSnippet } from "./searchUtils";

describe("formatSearchSnippet", () => {
  it("returns full string if shorter than maxLength", () => {
    expect(formatSearchSnippet("Short content", "Short")).toBe("Short content");
  });

  it("extracts a centered window snippet around query match", () => {
    const longContent =
      "This is a long introductory text that goes on for a while until the word Alice appears in the middle of the chapter and then continues further for a long time.";
    const snippet = formatSearchSnippet(longContent, "Alice", 40);
    expect(snippet).toContain("Alice");
    expect(snippet.length).toBeLessThan(60);
    expect(snippet.startsWith("...")).toBe(true);
    expect(snippet.endsWith("...")).toBe(true);
  });

  it("trims beginning if match is at start", () => {
    const longContent = "Alice went to the wonderland and saw many strange creatures.";
    const snippet = formatSearchSnippet(longContent, "Alice", 30);
    expect(snippet).toContain("Alice");
    expect(snippet.startsWith("...")).toBe(false);
  });
});
