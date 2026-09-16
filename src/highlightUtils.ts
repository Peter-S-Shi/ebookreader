export type HighlightColor = "yellow" | "green" | "blue" | "purple" | "orange";

export const HIGHLIGHT_COLORS: HighlightColor[] = ["yellow", "green", "blue", "purple", "orange"];

export function formatContextSelector(
  text: string,
  color: HighlightColor = "yellow",
  prefix = "",
  suffix = "",
): string {
  const snippet = text.slice(0, 80);
  if (prefix || suffix) {
    const cleanPrefix = prefix.slice(-20).replace(/\|/g, " ");
    const cleanSuffix = suffix.slice(0, 20).replace(/\|/g, " ");
    return `color:${color}|prefix:${cleanPrefix}|suffix:${cleanSuffix}|${snippet}`;
  }
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

export function extractContextDetails(contextSelector?: string | null): {
  color: HighlightColor;
  prefix?: string;
  suffix?: string;
} {
  const color = extractHighlightColor(contextSelector);
  if (!contextSelector) return { color };

  const parts = contextSelector.split("|");
  let prefix: string | undefined;
  let suffix: string | undefined;

  for (const part of parts) {
    if (part.startsWith("prefix:")) {
      prefix = part.slice(7);
    } else if (part.startsWith("suffix:")) {
      suffix = part.slice(7);
    }
  }

  return { color, prefix, suffix };
}
