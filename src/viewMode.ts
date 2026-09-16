// Reflowable-EPUB view mode, per FORMAT_CAPABILITY_MATRIX.md's
// "Single-page / paged" and "Double-page" rows and
// DESIGN.md SS7's "view mode where supported" control. foliate-js's
// <foliate-paginator> exposes column layout via `max-column-count`
// (1 = single page, 2 = double/spread).
// Selectable Continuous Scroll is deferred to V3.

export type ViewMode = "paginated-single" | "paginated-double";

export interface RendererLike {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}

export function applyViewMode(renderer: RendererLike, mode: ViewMode): void {
  renderer.removeAttribute("flow");
  renderer.setAttribute("max-column-count", mode === "paginated-double" ? "2" : "1");
}

export function normalizeViewMode(mode: string | null | undefined): ViewMode {
  if (mode === "paginated-single" || mode === "paginated-double") return mode;
  return "paginated-double";
}

// foliate's paginator owns the actual reflow column geometry and resets the
// publication body's max-width while paginating. Its default 720px column
// corresponds to the product's default 70ch preference; keep that baseline
// while mapping the user-facing scale onto the renderer's pixel contract.
export function applyPageWidth(renderer: RendererLike, pageWidthCh: number): void {
  const widthPx = Math.round((pageWidthCh * 720) / 70);
  renderer.setAttribute("max-inline-size", `${widthPx}px`);
}

export const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  "paginated-single": "Single page",
  "paginated-double": "Double page",
};

