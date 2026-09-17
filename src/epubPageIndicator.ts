// V2-M3 item 3 (corrected post-human-acceptance -- see PROJECT_STATUS.md):
// derives a K/N reading-position indicator from foliate-js's own Paginator
// getters (`view.renderer.page` / `view.renderer.pages`, read directly --
// not published on the relocate event's own detail).
//
// Verified against `node_modules/foliate-js/paginator.js`:
// - `Paginator.expand()` sizes the *visible* scroller element to
//   `expandedSize + this.#size * 2` (one phantom page-width of padding at
//   BOTH the leading and trailing edge, not just one) while the *content*
//   itself only occupies `expandedSize = pageCount * this.#size`.
// - `get pages()` returns `Math.round(viewSize / size)`, i.e. it measures
//   that padded scroller element -- so it reports `pageCount + 2`, not
//   `pageCount + 1`. The real chapter length is therefore `pages - 2`.
// - `get page()` returns the 0-based index of the currently centered
//   page-width slice (`Math.floor(((start+end)/2)/size)`). Index 0 is the
//   leading phantom, index 1 is real page 1, ..., index `pageCount` is
//   real page `pageCount`, index `pageCount + 1` is the trailing phantom.
//   So the 0-based `page` index already equals the 1-based real page
//   number directly -- no further subtraction.
// - `columnize()`'s Math.ceil-based layout expansion already resolves
//   single vs double column mode and an odd final column before `pages`
//   is ever read, so this function only strips the (two-sided) phantom
//   padding; it does not need to special-case column count.
export interface EpubPageIndicator {
  current: number;
  total: number;
}

export function computeEpubPageIndicator(page: number, pages: number): EpubPageIndicator | null {
  const total = pages - 2;
  if (!(total > 0)) return null;
  const current = Math.min(Math.max(page, 1), total);
  return { current, total };
}
