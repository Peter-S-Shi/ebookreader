// Typography settings shared by the reflowable EPUB and TXT readers, per
// DESIGN.md SS8 ("Typography UI": Font / Size / Line Height / Page Width /
// Margins) and PRODUCT_SPEC.md SS7.4. Font choices carry provenance
// because "usable on this machine" and "redistributable with EbookReader"
// are separate product facts.

export type FontSource = "PUBLISHER" | "BUILT_IN" | "SYSTEM" | "CUSTOM";

export type TypographyFont =
  | { source: "PUBLISHER" }
  | { source: "BUILT_IN"; family: string; assetPath: string }
  | { source: "SYSTEM"; family: string }
  | { source: "CUSTOM"; family: string; path: string };

export interface TypographySettings {
  font: TypographyFont;
  cjkFont: Exclude<TypographyFont, { source: "PUBLISHER" }> | null;
  fontSizePercent: number;
  lineHeight: number;
  pageWidthCh: number;
  marginPercent: number;
}

export const DEFAULT_TYPOGRAPHY: TypographySettings = {
  font: { source: "PUBLISHER" },
  cjkFont: null,
  fontSizePercent: 100,
  lineHeight: 1.5,
  pageWidthCh: 70,
  marginPercent: 6,
};

// No font files are currently checked into the repository with verified
// redistribution evidence. Keeping the catalog explicit prevents SYSTEM
// or CUSTOM fonts from being mislabeled as BUILT_IN product assets.
export const BUILT_IN_FONTS: Array<{ family: string; assetPath: string }> = [];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFont(value: unknown, allowPublisher: boolean): value is TypographyFont {
  if (!isRecord(value) || typeof value.source !== "string") return false;
  if (value.source === "PUBLISHER") return allowPublisher;
  if (value.source === "SYSTEM") return typeof value.family === "string";
  if (value.source === "CUSTOM") return typeof value.family === "string" && typeof value.path === "string";
  if (value.source === "BUILT_IN") return typeof value.family === "string" && typeof value.assetPath === "string";
  return false;
}

function isTypographySettings(value: unknown): value is TypographySettings {
  return (
    isRecord(value) &&
    isFont(value.font, true) &&
    (value.cjkFont === null || isFont(value.cjkFont, false)) &&
    typeof value.fontSizePercent === "number" &&
    typeof value.lineHeight === "number" &&
    typeof value.pageWidthCh === "number" &&
    typeof value.marginPercent === "number"
  );
}

export function serializeTypographySettings(settings: TypographySettings): string {
  return JSON.stringify(settings);
}

export function deserializeTypographySettings(serialized: string | null): TypographySettings {
  if (!serialized) return DEFAULT_TYPOGRAPHY;
  try {
    const parsed = JSON.parse(serialized);
    return isTypographySettings(parsed) ? parsed : DEFAULT_TYPOGRAPHY;
  } catch {
    return DEFAULT_TYPOGRAPHY;
  }
}

function quoteCss(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function fontFamily(font: TypographyFont): string | null {
  return font.source === "PUBLISHER" ? null : font.family;
}

function fontFace(font: TypographyFont): string | null {
  if (font.source === "CUSTOM") {
    return `@font-face { font-family: ${quoteCss(font.family)}; src: url(${quoteCss(font.path)}); }`;
  }
  if (font.source === "BUILT_IN") {
    return `@font-face { font-family: ${quoteCss(font.family)}; src: url(${quoteCss(font.assetPath)}); }`;
  }
  return null;
}

function familyStack(settings: TypographySettings): string | null {
  const families = [fontFamily(settings.font), settings.cjkFont ? fontFamily(settings.cjkFont) : null].filter(
    (name): name is string => Boolean(name),
  );
  return families.length > 0 ? families.map(quoteCss).join(", ") : null;
}

/// Build the CSS foliate-js's `renderer.setStyles()` expects for a
/// reflowable EPUB: a `body` rule reflecting the current settings. When
/// the primary font is Publisher / Original, no primary font-family rule is
/// emitted at all, so the publication's own embedded/original styling
/// wins (ARCHITECTURE.md SS14 PUBLISHER: "use within the publication").
export function toEpubCss(settings: TypographySettings): string {
  const rules: string[] = [
    `font-size: ${settings.fontSizePercent}%`,
    `line-height: ${settings.lineHeight}`,
    `max-width: ${settings.pageWidthCh}ch`,
    "margin-left: auto",
    "margin-right: auto",
    `padding-left: ${settings.marginPercent}%`,
    `padding-right: ${settings.marginPercent}%`,
  ];
  const stack = familyStack(settings);
  if (stack) {
    rules.push(`font-family: ${stack}`);
  }
  const faces = [fontFace(settings.font), settings.cjkFont ? fontFace(settings.cjkFont) : null].filter(Boolean);
  return [...faces, `body { ${rules.join("; ")}; }`].join("\n");
}

export function toTextStyle(settings: TypographySettings): Record<string, string | number | undefined> {
  return {
    fontFamily: familyStack(settings) ?? undefined,
    fontSize: `${settings.fontSizePercent}%`,
    lineHeight: settings.lineHeight,
    maxWidth: `${settings.pageWidthCh}ch`,
    paddingLeft: `${settings.marginPercent}%`,
    paddingRight: `${settings.marginPercent}%`,
  };
}
