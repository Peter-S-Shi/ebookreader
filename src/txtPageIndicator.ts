// V2-M3 item 3: TXT has no chapters/headings to infer (deliberately, per
// the product contract), so its K/N is synthetic -- derived purely from
// the scroll container's own measured geometry, not any document
// structure. N is how many viewport-heights the whole document spans; K
// is which one the current scroll position falls in.
export interface TxtPageIndicator {
  current: number;
  total: number;
}

export function computeTxtPageIndicator(
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
): TxtPageIndicator | null {
  if (clientHeight <= 0 || scrollHeight <= 0) return null;
  const total = Math.max(1, Math.ceil(scrollHeight / clientHeight));
  const current = Math.min(total, Math.floor(scrollTop / clientHeight) + 1);
  return { current, total };
}
