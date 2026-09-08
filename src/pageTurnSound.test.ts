import { describe, expect, it } from "vitest";
import { createPageTurnSound } from "./pageTurnSound";

describe("createPageTurnSound", () => {
  it("does not throw when AudioContext is unavailable (e.g. this jsdom test environment)", () => {
    const play = createPageTurnSound();
    expect(() => play()).not.toThrow();
  });
});
