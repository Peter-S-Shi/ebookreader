import { describe, expect, it, vi } from "vitest";
import { pdfOutlineToTocItems, type PdfOutlineResolver, type RawPdfOutlineItem } from "./pdfOutline";

function fakeResolver(overrides: Partial<PdfOutlineResolver> = {}): PdfOutlineResolver {
  return {
    getDestination: vi.fn(async () => null),
    getPageIndex: vi.fn(async () => 0),
    ...overrides,
  };
}

describe("pdfOutlineToTocItems", () => {
  it("converts a flat outline with explicit (array) destinations into 1-based page hrefs", async () => {
    const outline: RawPdfOutlineItem[] = [
      { title: "Chapter 1", dest: ["ref-a"], items: [] },
      { title: "Chapter 2", dest: ["ref-b"], items: [] },
    ];
    const resolver = fakeResolver({
      getPageIndex: vi.fn(async (ref: unknown) => (ref === "ref-a" ? 0 : 4)),
    });

    const result = await pdfOutlineToTocItems(outline, resolver);

    expect(result).toEqual([
      { label: "Chapter 1", href: "1" },
      { label: "Chapter 2", href: "5" },
    ]);
  });

  it("resolves a named (string) destination via resolver.getDestination", async () => {
    const outline: RawPdfOutlineItem[] = [{ title: "Preface", dest: "preface-anchor", items: [] }];
    const resolver = fakeResolver({
      getDestination: vi.fn(async (name: string) => (name === "preface-anchor" ? ["ref-p"] : null)),
      getPageIndex: vi.fn(async () => 2),
    });

    const result = await pdfOutlineToTocItems(outline, resolver);

    expect(result).toEqual([{ label: "Preface", href: "3" }]);
  });

  it("preserves parent/child hierarchy from item.items as nested subitems", async () => {
    const outline: RawPdfOutlineItem[] = [
      {
        title: "Part I",
        dest: ["ref-part1"],
        items: [
          { title: "Chapter 1.1", dest: ["ref-1-1"], items: [] },
          { title: "Chapter 1.2", dest: ["ref-1-2"], items: [] },
        ],
      },
    ];
    const resolver = fakeResolver({
      getPageIndex: vi.fn(async (ref: unknown) => ({ "ref-part1": 0, "ref-1-1": 1, "ref-1-2": 6 })[ref as string] ?? 0),
    });

    const result = await pdfOutlineToTocItems(outline, resolver);

    expect(result).toEqual([
      {
        label: "Part I",
        href: "1",
        subitems: [
          { label: "Chapter 1.1", href: "2" },
          { label: "Chapter 1.2", href: "7" },
        ],
      },
    ]);
  });

  it("returns an empty array for a null or empty outline (the no-usable-outline fallback case)", async () => {
    const resolver = fakeResolver();

    expect(await pdfOutlineToTocItems(null, resolver)).toEqual([]);
    expect(await pdfOutlineToTocItems([], resolver)).toEqual([]);
  });

  it("drops a leaf entry with no resolvable destination, but keeps a parent with navigable children even if its own destination doesn't resolve", async () => {
    const outline: RawPdfOutlineItem[] = [
      { title: "Dead End", dest: null, items: [] },
      {
        title: "Section With Children",
        dest: null,
        items: [{ title: "Real Target", dest: ["ref-real"], items: [] }],
      },
    ];
    const resolver = fakeResolver({ getPageIndex: vi.fn(async () => 9) });

    const result = await pdfOutlineToTocItems(outline, resolver);

    expect(result).toEqual([
      {
        label: "Section With Children",
        href: "",
        subitems: [{ label: "Real Target", href: "10" }],
      },
    ]);
  });
});
