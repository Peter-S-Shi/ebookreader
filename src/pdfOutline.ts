// Pure helper for V2-M2 native PDF bookmarks: converts pdf.js's own
// outline tree (from `PDFDocumentProxy.getOutline()`) into the same
// `TocItem[]` shape the shared Contents UI (`TocPanel`) already renders
// for EPUB, so PDF bookmarks appear in the same Contents experience
// without any change to `TocPanel` itself.
import type { TocItem } from "./TocPanel";

export interface RawPdfOutlineItem {
  title: string;
  dest: string | unknown[] | null;
  items: RawPdfOutlineItem[];
}

/** The subset of `PDFDocumentProxy` this conversion needs -- kept minimal
 * so tests can supply a synthetic fake instead of a real PDF document. */
export interface PdfOutlineResolver {
  getDestination(namedDest: string): Promise<unknown[] | null>;
  getPageIndex(ref: unknown): Promise<number>;
}

async function resolvePageNumber(
  dest: string | unknown[] | null,
  resolver: PdfOutlineResolver,
): Promise<number | null> {
  if (!dest) return null;
  const explicitDest = typeof dest === "string" ? await resolver.getDestination(dest) : dest;
  if (!explicitDest || explicitDest.length === 0) return null;
  try {
    const pageIndex = await resolver.getPageIndex(explicitDest[0]);
    return pageIndex + 1; // TocItem hrefs use the same 1-based page number PdfReader's own pageNumber state does.
  } catch {
    return null;
  }
}

/** An outline node with no resolvable destination of its own is only kept
 * when it still has navigable children (`href: ""`, a non-navigable
 * hierarchy label) -- a true dead leaf (no destination, no children) is
 * dropped rather than rendered as a button that does nothing. */
export async function pdfOutlineToTocItems(
  outline: RawPdfOutlineItem[] | null | undefined,
  resolver: PdfOutlineResolver,
): Promise<TocItem[]> {
  if (!outline || outline.length === 0) return [];
  const items: TocItem[] = [];
  for (const node of outline) {
    const pageNumber = await resolvePageNumber(node.dest, resolver);
    const subitems =
      node.items && node.items.length > 0 ? await pdfOutlineToTocItems(node.items, resolver) : undefined;
    if (pageNumber === null && (!subitems || subitems.length === 0)) continue;
    items.push({
      label: node.title,
      href: pageNumber !== null ? String(pageNumber) : "",
      ...(subitems && subitems.length > 0 ? { subitems } : {}),
    });
  }
  return items;
}
