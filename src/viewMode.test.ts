import { describe, expect, it, vi } from "vitest";
import { applyPageWidth, applyViewMode } from "./viewMode";

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

describe("applyPageWidth", () => {
  it("uses foliate's max-inline-size contract instead of publication body CSS", () => {
    const renderer = fakeRenderer();

    applyPageWidth(renderer, 70);

    expect(renderer.setAttribute).toHaveBeenCalledWith("max-inline-size", "720px");
  });

  it("makes narrower and wider preferences produce distinct renderer widths", () => {
    const renderer = fakeRenderer();

    applyPageWidth(renderer, 40);
    applyPageWidth(renderer, 100);

    expect(renderer.setAttribute).toHaveBeenNthCalledWith(1, "max-inline-size", "411px");
    expect(renderer.setAttribute).toHaveBeenNthCalledWith(2, "max-inline-size", "1029px");
  });
});
