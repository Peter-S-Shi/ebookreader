// V2-M3 item 3: derives a K/N reading-position indicator from foliate-js's
// own Paginator getters (`view.renderer.page` / `view.renderer.pages`,
// read directly -- not published on the relocate event's own detail).
//
// foliate-js pads each chapter with one phantom leading and one phantom
// trailing column (confirmed via its own #afterScroll header-visibility
// check, `page > 1 ? visible : hidden` -- page 1 is the phantom lead-in),
// and its columnize() layout already expands section content to an exact
// multiple of the page/spread size via Math.ceil before `pages` is ever
// computed -- so single vs double column mode, and an odd final column,
// are already resolved by the library itself by the time these getters
// are read. This function only strips the phantom padding.
export interface EpubPageIndicator {
  current: number;
  total: number;
}

export function computeEpubPageIndicator(page: number, pages: number): EpubPageIndicator | null {
  const total = pages - 1;
  if (!(total > 0)) return null;
  const current = Math.min(Math.max(page - 1, 1), total);
  return { current, total };
}
