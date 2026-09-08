import { describe, expect, it } from "vitest";
import { justReachedCompletion } from "./completionTrigger";

describe("justReachedCompletion", () => {
  it("is true the moment fraction crosses from below to at/above the threshold", () => {
    expect(justReachedCompletion(0.9, 1.0)).toBe(true);
  });

  it("is false once already at completion (no repeat trigger on further scroll)", () => {
    expect(justReachedCompletion(1.0, 1.0)).toBe(false);
  });

  it("is false for ordinary forward progress that doesn't reach the end", () => {
    expect(justReachedCompletion(0.4, 0.6)).toBe(false);
  });

  it("is false when moving backwards (rereading a passage), even near the end", () => {
    expect(justReachedCompletion(1.0, 0.95)).toBe(false);
  });
});
