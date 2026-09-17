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

  it("preserves span nesting and text flow inside pdf.js textLayer structure", () => {
    container.className = "textLayer pdf-text-layer";
    container.innerHTML = `<span style="left: 10%; top: 20%; --font-height: 16px; --scale-x: 1;">Hello world of PDF text</span>`;

    const annotation: PdfAnnotationItem = {
      id: "ann-flow",
      text: "world of",
      color: "yellow",
    };

    applyPdfHighlights(container, [annotation]);

    const highlight = container.querySelector(".reader-highlight");
    expect(highlight).not.toBeNull();
    expect(highlight?.textContent).toBe("world of");
    expect(highlight?.parentElement?.tagName.toLowerCase()).toBe("span");
    expect(container.textContent).toBe("Hello world of PDF text");
  });

  it("matches cross-span selections with spaces/newlines when DOM spans lack whitespace (CJK text flow)", () => {
    container.className = "textLayer pdf-text-layer";
    container.innerHTML = `
      <span>○王天兵：提起电影，电影发烧友可能首先会想</span>
      <span>到……艺术。可是，一提起类型片，大家马上会想</span>
      <span>起格式化的情节、程式化的人物和正义战胜邪恶的</span>
      <span>主题，像007系列和成龙电影等，也就是娱乐产</span>
      <span>品。</span>
    `;

    // Query text extracted by browser selection with spaces between lines
    const annotation: PdfAnnotationItem = {
      id: "ann-cjk-multiline",
      text: "王天兵：提起电影，电影发烧友可能首先会想 到……艺术。可是，一提起类型片，大家马上会想 起格式化的情节、程式化的人物和正义战胜邪恶的 主题，像007系列和成龙电影等，也就是娱乐产 品。",
      color: "green",
    };

    applyPdfHighlights(container, [annotation]);

    const highlights = container.querySelectorAll(".reader-highlight");
    expect(highlights.length).toBe(5);
    expect(highlights[0].textContent).toBe("王天兵：提起电影，电影发烧友可能首先会想");
    expect(highlights[1].textContent).toBe("到……艺术。可是，一提起类型片，大家马上会想");
    expect(highlights[2].textContent).toBe("起格式化的情节、程式化的人物和正义战胜邪恶的");
    expect(highlights[3].textContent).toBe("主题，像007系列和成龙电影等，也就是娱乐产");
    expect(highlights[4].textContent).toBe("品。");
  });
});
