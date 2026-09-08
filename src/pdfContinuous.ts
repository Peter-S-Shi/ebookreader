// Pure helper for PDF continuous-scroll mode (FORMAT_CAPABILITY_MATRIX.md's
// required "Continuous scroll" row for Text PDF): given each rendered
// page's height and the container's current scrollTop, which page is
// "current" for DocumentLocation purposes.

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
