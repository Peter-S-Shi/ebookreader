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

// HA-007: foliate-js renders each EPUB section into its own isolated
// document (an iframe under the view's shadow root), so the app shell's
// `data-theme`/`prefers-color-scheme` CSS cascade never reaches it -- a
// Book's own light-on-white (or unset) styling stays exactly as
// published regardless of the app's Dark theme, which can make text
// unreadable against whatever background that section renders (or the
// UA-default white page showing through a dark app chrome). These are
// the exact values `App.css` already uses for the app shell's own Dark
// theme, kept in sync so the reading surface and the chrome around it
// agree. This overrides color only, never font-family -- Publisher
// typography (SS7.4/ARCHITECTURE.md SS14) is a font-provenance choice,
// unrelated to the orthogonal need for the text to stay legible.
const DARK_MODE_FOREGROUND = "#f6f6f6";
const DARK_MODE_BACKGROUND = "#1a1a1a";

/// Build the CSS foliate-js's `renderer.setStyles()` expects for a
/// reflowable EPUB: a `body` rule reflecting the current settings. When
/// the primary font is Publisher / Original, no primary font-family rule is
/// emitted at all, so the publication's own embedded/original styling
/// wins (ARCHITECTURE.md SS14 PUBLISHER: "use within the publication").
/// `darkMode` (the app's own currently-effective Dark theme, computed by
/// the caller) forces a readable foreground/background on the rendered
/// section regardless of font source -- see HA-007 above.
export function toEpubCss(settings: TypographySettings, darkMode = false): string {
  const rules: string[] = [
    `font-size: ${settings.fontSizePercent}%`,
    `line-height: ${settings.lineHeight}`,
    `max-width: ${settings.pageWidthCh}ch`,
    "margin-left: auto",
    "margin-right: auto",
    `padding-left: ${settings.marginPercent}%`,
    `padding-right: ${settings.marginPercent}%`,
  ];
  if (darkMode) {
    rules.push("color-scheme: dark");
  }
  const stack = familyStack(settings);
  if (stack) {
    rules.push(`font-family: ${stack}`);
  }
  const faces = [fontFace(settings.font), settings.cjkFont ? fontFace(settings.cjkFont) : null].filter(Boolean);
  const bodyRule = `body { ${rules.join("; ")}; }`;
  // Publisher styles commonly assign line-height directly to paragraphs
  // and list content, which prevents an inherited body value from taking
  // effect. Apply the reader preference to ordinary reflowable prose only.
  // Deliberately exclude ruby, super/subscript, tables, and preformatted or
  // code structures whose internal metrics carry semantic layout.
  const proseLineHeightRule = `:where(p, li, dd, dt, blockquote) { line-height: ${settings.lineHeight} !important; }`;
  // `!important` because a Book's own embedded stylesheet frequently sets
  // `color`/`background-color` on `body` (or `html`) with higher
  // specificity than this single element selector -- without it, dark
  // mode legibility would depend on the publication's CSS never doing
  // so, which is exactly the failure HA-007 reports.
  //
  // HA-007 Corrective Batch #2 (real desktop retest): `html, body` alone
  // was not enough -- CSS inheritance only applies to a descendant that
  // has no `color` of its own, and publisher stylesheets frequently set
  // `color` directly on paragraph/heading elements, not just `body`. An
  // element with its own explicit color never even consults its
  // inherited value, so no `!important` on `body` can reach it. `html *,
  // body *` forces every descendant's foreground directly; background is
  // left at `html, body` only (the whole-page canvas), not forced onto
  // every descendant, so a publisher's own deliberate highlight/callout
  // background is preserved -- only legibility (foreground) is forced,
  // matching "must not fix color by breaking Publisher typography".
  const highlightCss = darkMode
    ? `\nmark.reader-highlight, .reader-highlight { background-color: rgba(255, 215, 0, 0.45) !important; color: #ffffff !important; box-shadow: 0 0 0 1px rgba(255, 215, 0, 0.5) !important; border-radius: 2px; padding: 1px 2px; }` +
      `\nmark.reader-highlight[data-color="green"], .reader-highlight[data-color="green"] { background-color: rgba(76, 217, 100, 0.45) !important; color: #ffffff !important; box-shadow: 0 0 0 1px rgba(76, 217, 100, 0.5) !important; }` +
      `\nmark.reader-highlight[data-color="blue"], .reader-highlight[data-color="blue"] { background-color: rgba(64, 169, 255, 0.45) !important; color: #ffffff !important; box-shadow: 0 0 0 1px rgba(64, 169, 255, 0.5) !important; }` +
      `\nmark.reader-highlight[data-color="purple"], .reader-highlight[data-color="purple"] { background-color: rgba(186, 104, 200, 0.45) !important; color: #ffffff !important; box-shadow: 0 0 0 1px rgba(186, 104, 200, 0.5) !important; }` +
      `\nmark.reader-highlight[data-color="orange"], .reader-highlight[data-color="orange"] { background-color: rgba(255, 152, 0, 0.45) !important; color: #ffffff !important; box-shadow: 0 0 0 1px rgba(255, 152, 0, 0.5) !important; }`
    : `\nmark.reader-highlight, .reader-highlight { background-color: rgba(255, 215, 0, 0.42) !important; box-shadow: 0 0 0 1px rgba(255, 215, 0, 0.3) !important; border-radius: 2px; padding: 1px 2px; }` +
      `\nmark.reader-highlight[data-color="green"], .reader-highlight[data-color="green"] { background-color: rgba(76, 175, 80, 0.42) !important; box-shadow: 0 0 0 1px rgba(76, 175, 80, 0.3) !important; }` +
      `\nmark.reader-highlight[data-color="blue"], .reader-highlight[data-color="blue"] { background-color: rgba(33, 150, 243, 0.42) !important; box-shadow: 0 0 0 1px rgba(33, 150, 243, 0.3) !important; }` +
      `\nmark.reader-highlight[data-color="purple"], .reader-highlight[data-color="purple"] { background-color: rgba(156, 39, 176, 0.42) !important; box-shadow: 0 0 0 1px rgba(156, 39, 176, 0.3) !important; }` +
      `\nmark.reader-highlight[data-color="orange"], .reader-highlight[data-color="orange"] { background-color: rgba(255, 152, 0, 0.42) !important; box-shadow: 0 0 0 1px rgba(255, 152, 0, 0.3) !important; }`;
  const colorOverride = darkMode
    ? `\nhtml, body { color: ${DARK_MODE_FOREGROUND} !important; background-color: ${DARK_MODE_BACKGROUND} !important; }` +
      `\nhtml *, body * { color: ${DARK_MODE_FOREGROUND} !important; }`
    : "";
  return [...faces, bodyRule, proseLineHeightRule, colorOverride, highlightCss].filter(Boolean).join("\n");
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
