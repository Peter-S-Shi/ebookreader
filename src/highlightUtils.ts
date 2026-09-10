export type HighlightColor = "yellow" | "green" | "blue" | "purple" | "orange";

export const HIGHLIGHT_COLORS: HighlightColor[] = ["yellow", "green", "blue", "purple", "orange"];

export function formatContextSelector(text: string, color: HighlightColor = "yellow"): string {
  const snippet = text.slice(0, 80);
  return `color:${color}|${snippet}`;
}

export function extractHighlightColor(contextSelector?: string | null): HighlightColor {
  if (!contextSelector || !contextSelector.startsWith("color:")) {
    return "yellow";
  }
  const pipeIndex = contextSelector.indexOf("|");
  if (pipeIndex === -1) return "yellow";
  const colorStr = contextSelector.substring(6, pipeIndex);
  if (HIGHLIGHT_COLORS.includes(colorStr as HighlightColor)) {
    return colorStr as HighlightColor;
  }
  return "yellow";
}
