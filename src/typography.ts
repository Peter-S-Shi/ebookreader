// Typography settings shared by the reflowable EPUB and TXT readers, per
// DESIGN.md SS8 ("Typography UI": Font / Size / Line Height / Page Width /
// Margins) and PRODUCT_SPEC.md SS7.4. Global defaults (Settings ->
// Typography) and Custom/CJK-override fonts are a later checkpoint --
// this is the Reader `Aa` per-book override surface only, session-only
// (not yet persisted).

export interface TypographySettings {
  // null = "Publisher / Original" (DESIGN.md SS8) -- no font-family
  // override at all.
  fontFamily: string | null;
  fontSizePercent: number;
  lineHeight: number;
  pageWidthCh: number;
}

export const DEFAULT_TYPOGRAPHY: TypographySettings = {
  fontFamily: null,
  fontSizePercent: 100,
  lineHeight: 1.5,
  pageWidthCh: 70,
};

/// Build the CSS foliate-js's `renderer.setStyles()` expects for a
/// reflowable EPUB: a `body` rule reflecting the current settings. When
/// `fontFamily` is null (Publisher / Original), no font-family rule is
/// emitted at all, so the publication's own embedded/original styling
/// wins (ARCHITECTURE.md SS14 PUBLISHER: "use within the publication").
export function toEpubCss(settings: TypographySettings): string {
  const rules: string[] = [
    `font-size: ${settings.fontSizePercent}%`,
    `line-height: ${settings.lineHeight}`,
    `max-width: ${settings.pageWidthCh}ch`,
    "margin-left: auto",
    "margin-right: auto",
  ];
  if (settings.fontFamily) {
    rules.push(`font-family: "${settings.fontFamily}"`);
  }
  return `body { ${rules.join("; ")}; }`;
}
