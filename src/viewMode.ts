// Reflowable-EPUB view mode, per FORMAT_CAPABILITY_MATRIX.md's required
// "Continuous scroll / Single-page / paged / Double-page" rows and
// DESIGN.md SS7's "view mode where supported" control. foliate-js's
// <foliate-paginator> exposes this via two real, public HTML attributes:
// `flow` ("scrolled" for continuous, absent for paginated) and
// `max-column-count` (1 = single page, 2 = double/spread).

export type ViewMode = "paginated-single" | "paginated-double" | "scrolled";

export interface RendererLike {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}

export function applyViewMode(renderer: RendererLike, mode: ViewMode): void {
  if (mode === "scrolled") {
    renderer.setAttribute("flow", "scrolled");
    return;
  }
  renderer.removeAttribute("flow");
  renderer.setAttribute("max-column-count", mode === "paginated-double" ? "2" : "1");
}

export const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  "paginated-single": "Single page",
  "paginated-double": "Double page",
  scrolled: "Continuous scroll",
};
