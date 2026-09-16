import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyPdfHighlights,
  clearPdfHighlights,
  recolorPdfHighlight,
  type PdfAnnotationItem,
} from "./pdfHighlight";

describe("pdfHighlight module", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    container.className = "pdf-text-layer";
    document.body.replaceChildren(container);
  });

  it("highlights a selection wholly inside one span without coloring surrounding text", () => {
    container.innerHTML = `<span>Before query After</span>`;

    const annotation = {
      id: "ann-1",
      kind: "annotation",
      text: "query",
      color: "yellow" as const,
    };

    applyPdfHighlights(container, [annotation]);

    const highlight = container.querySelector(".reader-highlight");
    expect(highlight).toBeInTheDocument();
    expect(highlight?.textContent).toBe("query");
    expect((highlight as HTMLElement)?.dataset.color).toBe("yellow");
    expect((highlight as HTMLElement)?.dataset.assetId).toBe("ann-1");
    // Verify surrounding text is preserved in DOM
    expect(container.textContent).toBe("Before query After");
  });

  it("highlights a selection spanning multiple spans across boundaries", () => {
    container.innerHTML = `<span>作者：芦苇</span><span> </span><span>王天兵</span>`;

    const annotation = {
      id: "ann-cjk-multi",
      kind: "annotation",
      text: "芦苇 王天兵",
      color: "blue" as const,
    };

    applyPdfHighlights(container, [annotation]);

    const highlights = container.querySelectorAll(".reader-highlight");
    expect(highlights.length).toBeGreaterThanOrEqual(2);
    const combinedHighlightedText = Array.from(highlights)
      .map((h) => h.textContent)
      .join("");
    expect(combinedHighlightedText).toBe("芦苇 王天兵");
    expect(container.textContent).toBe("作者：芦苇 王天兵");
  });

  it("disambiguates repeated short text on the same page using context", () => {
    container.innerHTML = `<span>first system is alpha.</span><span>second system is beta.</span>`;

    // Context indicates the second "system" (prefixed by "second ")
    const annotation = {
      id: "ann-repeated-2",
      kind: "annotation",
      text: "system",
      contextPrefix: "second ",
      color: "green" as const,
    };

    applyPdfHighlights(container, [annotation]);

    const highlights = container.querySelectorAll(".reader-highlight");
    expect(highlights.length).toBe(1);
    expect(highlights[0].parentElement?.textContent).toContain("second system is beta");
  });

  it("handles CJK text split across arbitrary span segments", () => {
    container.innerHTML = `<span>经典</span><span>人物</span><span>原型分析</span>`;

    const annotation: PdfAnnotationItem = {
      id: "ann-cjk-split",
      kind: "annotation",
      text: "人物原型",
      color: "yellow",
    };

    applyPdfHighlights(container, [annotation]);

    const highlights = container.querySelectorAll(".reader-highlight");
    expect(highlights.length).toBe(2);
    expect(highlights[0].textContent).toBe("人物");
    expect(highlights[1].textContent).toBe("原型");
    expect(container.textContent).toBe("经典人物原型分析");
  });

  it("gracefully fails when annotation text is not found on the page", () => {
    container.innerHTML = `<span>Some completely different text</span>`;

    const annotation = {
      id: "ann-missing",
      kind: "annotation",
      text: "Nonexistent Passage",
      color: "yellow" as const,
    };

    expect(() => applyPdfHighlights(container, [annotation])).not.toThrow();
    expect(container.querySelectorAll(".reader-highlight").length).toBe(0);
    expect(container.textContent).toBe("Some completely different text");
  });

  it("attaches click handler to highlighted spans", () => {
    container.innerHTML = `<span>Clickable highlight target</span>`;

    const onSelect = vi.fn();
    const annotation = {
      id: "ann-click",
      kind: "annotation",
      text: "Clickable highlight",
      color: "purple" as const,
    };

    applyPdfHighlights(container, [annotation], onSelect);

    const highlight = container.querySelector(".reader-highlight") as HTMLElement;
    expect(highlight).toBeInTheDocument();

    highlight.click();
    expect(onSelect).toHaveBeenCalledWith("ann-click", "Clickable highlight");
  });

  it("recolors existing highlights by assetId", () => {
    container.innerHTML = `<span>Sample text for recoloring</span>`;

    const annotation = {
      id: "ann-recolor",
      kind: "annotation",
      text: "Sample text",
      color: "yellow" as const,
    };

    applyPdfHighlights(container, [annotation]);

    const highlight = container.querySelector(`[data-asset-id="ann-recolor"]`) as HTMLElement;
    expect(highlight.dataset.color).toBe("yellow");

    recolorPdfHighlight(container, "ann-recolor", "orange");
    expect(highlight.dataset.color).toBe("orange");
  });

  it("clears/unwraps existing highlights by assetId", () => {
    container.innerHTML = `<span>Before highlight after</span>`;

    const annotation = {
      id: "ann-clear",
      kind: "annotation",
      text: "highlight",
      color: "yellow" as const,
    };

    applyPdfHighlights(container, [annotation]);
    expect(container.querySelectorAll(".reader-highlight").length).toBe(1);

    clearPdfHighlights(container, "ann-clear");
    expect(container.querySelectorAll(".reader-highlight").length).toBe(0);
    expect(container.textContent).toBe("Before highlight after");
  });
});
