// Pure helpers for PDF continuous-scroll mode (FORMAT_CAPABILITY_MATRIX.md's
// required "Continuous scroll" row for Text PDF).
// Bounds live high-resolution rendering and canvas memory to the viewport neighborhood.

/** Returns the 1-based page number whose region contains `scrollTop`. */
export function currentPageFromScroll(pageHeights: number[], scrollTop: number): number {
  if (pageHeights.length === 0) return 1;
  let accumulated = 0;
  for (let i = 0; i < pageHeights.length; i++) {
    accumulated += pageHeights[i];
    if (scrollTop < accumulated) return i + 1;
  }
  return pageHeights.length;
}

/**
 * Computes a contiguous active range [startPage, endPage] (1-based, inclusive)
 * centered around `currentPage` with `overscan` buffer pages on both sides.
 */
export function computeActivePageRange(
  currentPage: number,
  totalPages: number,
  overscan: number = 2,
): { startPage: number; endPage: number } {
  if (totalPages <= 0) return { startPage: 1, endPage: 1 };
  const clampedCurrent = Math.max(1, Math.min(totalPages, currentPage || 1));
  const startPage = Math.max(1, clampedCurrent - overscan);
  const endPage = Math.min(totalPages, clampedCurrent + overscan);
  return { startPage, endPage };
}

/**
 * Given per-page heights, container scrollTop, and viewportHeight,
 * determines which 1-based page numbers intersect the visible viewport
 * plus `overscanPages` on both sides.
 */
export function computeActivePagesFromScroll(
  pageHeights: number[],
  scrollTop: number,
  viewportHeight: number,
  overscanPages: number = 1,
): number[] {
  if (pageHeights.length === 0) return [1];
  const totalPages = pageHeights.length;
  const viewTop = Math.max(0, scrollTop);
  const viewBottom = viewTop + Math.max(1, viewportHeight);

  let accumulated = 0;
  let firstVisible = -1;
  let lastVisible = -1;

  for (let i = 0; i < totalPages; i++) {
    const pageTop = accumulated;
    const pageBottom = pageTop + pageHeights[i];
    accumulated = pageBottom;

    if (pageBottom > viewTop && pageTop < viewBottom) {
      if (firstVisible === -1) firstVisible = i + 1;
      lastVisible = i + 1;
    }
  }

  if (firstVisible === -1) {
    firstVisible = currentPageFromScroll(pageHeights, viewTop);
    lastVisible = firstVisible;
  }

  const start = Math.max(1, firstVisible - overscanPages);
  const end = Math.min(totalPages, lastVisible + overscanPages);

  const pages: number[] = [];
  for (let p = start; p <= end; p++) {
    pages.push(p);
  }
  return pages;
}

/**
 * Estimates layout geometry for page placeholders based on Page 1 viewport or standard A4.
 */
export function estimatePageDimensions(
  page1Viewport: { width: number; height: number } | null,
  zoomScale: number,
): { width: number; height: number } {
  const baseWidth = page1Viewport?.width && page1Viewport.width > 0 ? page1Viewport.width : 595;
  const baseHeight = page1Viewport?.height && page1Viewport.height > 0 ? page1Viewport.height : 842;
  const scale = Math.max(0.1, zoomScale || 1.0);
  return {
    width: Math.round(baseWidth * scale),
    height: Math.round(baseHeight * scale),
  };
}

/**
 * Diffs previously active page numbers against currently active page numbers.
 */
export function diffActivePages(
  previousPages: Set<number>,
  nextPages: Set<number>,
): { toRender: number[]; toEvict: number[] } {
  const toRender: number[] = [];
  const toEvict: number[] = [];

  for (const page of nextPages) {
    if (!previousPages.has(page)) {
      toRender.push(page);
    }
  }

  for (const page of previousPages) {
    if (!nextPages.has(page)) {
      toEvict.push(page);
    }
  }

  return { toRender, toEvict };
}

