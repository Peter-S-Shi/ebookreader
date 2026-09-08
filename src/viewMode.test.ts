import { describe, expect, it, vi } from "vitest";
import { applyViewMode } from "./viewMode";

function fakeRenderer() {
  return { setAttribute: vi.fn(), removeAttribute: vi.fn() };
}

describe("applyViewMode", () => {
  it("sets flow=scrolled for continuous scroll", () => {
    const renderer = fakeRenderer();
    applyViewMode(renderer, "scrolled");
    expect(renderer.setAttribute).toHaveBeenCalledWith("flow", "scrolled");
  });

  it("removes flow and sets max-column-count=1 for single page", () => {
    const renderer = fakeRenderer();
    applyViewMode(renderer, "paginated-single");
    expect(renderer.removeAttribute).toHaveBeenCalledWith("flow");
    expect(renderer.setAttribute).toHaveBeenCalledWith("max-column-count", "1");
  });

  it("removes flow and sets max-column-count=2 for double page", () => {
    const renderer = fakeRenderer();
    applyViewMode(renderer, "paginated-double");
    expect(renderer.removeAttribute).toHaveBeenCalledWith("flow");
    expect(renderer.setAttribute).toHaveBeenCalledWith("max-column-count", "2");
  });
});
