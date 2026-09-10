import { describe, expect, it } from "vitest";
// This project's tsconfig is browser-only (no `@types/node`); `vite.config.ts`
// already establishes the `@ts-expect-error` pattern for a Node built-in
// import, reused here rather than adding a new dependency.
// @ts-expect-error type error without @types/node package
import { readFileSync } from "node:fs";
// @ts-expect-error type error without @types/node package
import { join } from "node:path";
// @ts-expect-error type error without @types/node package
import process from "node:process";

// HA-007 Corrective Batch #2: these tests exercise the REAL `App.css`
// source text (not a hand-duplicated copy of it), because jsdom's own
// CSSOM does not reliably evaluate `@media (prefers-color-scheme)` for
// `getComputedStyle` -- see the project's established
// `[[feedback-native-gui-visual-verification]]` limitation. Instead of a
// generic CSS engine, this is a small, purpose-built structural check for
// exactly the bug class found by real human-desktop retest: a stray
// `@media (prefers-color-scheme: dark) { :root { ... } }` block with no
// `:not([data-theme="light"])` guard silently overrides an explicit
// Light choice whenever the OS itself prefers dark, because CSS gives a
// same-specificity, later-in-source rule priority over an explicit
// user choice it was never scoped to respect.
// Strip /* ... */ comments before any structural analysis -- otherwise a
// comment merely *describing* a pattern (as this file's own HA-007 fix
// comment does) would be indistinguishable from the pattern itself.
const appCssPath = join(process.cwd(), "src", "App.css");
const css = (readFileSync(appCssPath, "utf-8") as string).replace(/\/\*[\s\S]*?\*\//g, "");

/// Returns the *contents* of every `@media (prefers-color-scheme: dark) { ... }`
/// block in the given CSS text, brace-depth aware (so nested rule blocks
/// inside don't prematurely close the match).
function extractPrefersDarkBlocks(source: string): string[] {
  const marker = "@media (prefers-color-scheme: dark) {";
  const blocks: string[] = [];
  let searchFrom = 0;
  for (;;) {
    const start = source.indexOf(marker, searchFrom);
    if (start === -1) break;
    let depth = 1;
    let i = start + marker.length;
    while (depth > 0 && i < source.length) {
      if (source[i] === "{") depth++;
      else if (source[i] === "}") depth--;
      i++;
    }
    blocks.push(source.slice(start + marker.length, i - 1));
    searchFrom = i;
  }
  return blocks;
}

describe("App.css theme cascade (HA-007 Corrective Batch #2)", () => {
  it("no @media (prefers-color-scheme: dark) block contains a bare, unguarded `:root {` rule", () => {
    // A bare `:root {` (not `:root:not([data-theme=\"light\"])` and not
    // `:root[data-theme=...]`) inside a prefers-color-scheme:dark block
    // has equal-or-lower specificity than nothing standing in its way for
    // an explicit Light choice -- it silently wins over the OS-dark case
    // regardless of the user's explicit selection. This is the exact
    // defect the real desktop retest found: explicit Light + OS dark
    // still showed a dark app shell.
    const darkBlocks = extractPrefersDarkBlocks(css);
    expect(darkBlocks.length).toBeGreaterThan(0); // sanity: the file still has dark-mode CSS at all

    const bareRootPattern = /(^|[^:\w-]):root\s*\{/;
    for (const block of darkBlocks) {
      expect(block).not.toMatch(bareRootPattern);
    }
  });

  it("no @media (prefers-color-scheme: dark) block styles a:hover / input,button without the explicit-Light guard", () => {
    // The same unguarded-block bug also carried unrelated shell styling
    // (link hover color, form control colors) that leaked through an
    // explicit Light choice on a dark OS along with the background.
    const darkBlocks = extractPrefersDarkBlocks(css);
    for (const block of darkBlocks) {
      const hasUnguardedHover = /(^|[^:\w-])a:hover\s*\{/.test(block) && !block.includes(':not([data-theme="light"]) a:hover');
      const hasUnguardedInputButton =
        /(^|[^:\w-])input,\s*\n?\s*button\s*\{/.test(block) &&
        !block.includes(':not([data-theme="light"]) input');
      expect(hasUnguardedHover).toBe(false);
      expect(hasUnguardedInputButton).toBe(false);
    }
  });

  it("the explicit-Dark shell background/foreground values match the system-dark (Match System) values", () => {
    // The leftover unguarded block used #2f2f2f while the canonical
    // explicit-dark rule used #1a1a1a -- two different colors for the
    // same "app dark background" concept, only reconciled by
    // specificity accident. Assert both canonical rules now agree.
    const explicitDarkMatch = css.match(/:root\[data-theme="dark"\]\s*\{([^}]*)\}/);
    expect(explicitDarkMatch).not.toBeNull();
    const explicitDarkBody = explicitDarkMatch![1];

    const darkBlocks = extractPrefersDarkBlocks(css);
    const systemDarkBlock = darkBlocks.find((b) => b.includes(':root:not([data-theme="light"])'));
    expect(systemDarkBlock).toBeDefined();
    const systemDarkRootMatch = systemDarkBlock!.match(/:root:not\(\[data-theme="light"\]\)\s*\{([^}]*)\}/);
    expect(systemDarkRootMatch).not.toBeNull();
    const systemDarkBody = systemDarkRootMatch![1];

    const bg = /background-color:\s*(#[0-9a-fA-F]+)/;
    const fg = /(?<!background-)color:\s*(#[0-9a-fA-F]+)/;
    expect(explicitDarkBody.match(bg)?.[1]).toBe(systemDarkBody.match(bg)?.[1]);
    expect(explicitDarkBody.match(fg)?.[1]).toBe(systemDarkBody.match(fg)?.[1]);
  });
});

describe("App.css .typography-panel dark-mode contrast (HA-009)", () => {
  it("the Reader overlay's dark-mode background/color rule specificity beats the base .reader .typography-panel rule", () => {
    // Batch #1 (HA-008) added `.reader .typography-panel { background-color: #f6f6f6; }`
    // with higher specificity (.reader .typography-panel, 2 classes) than
    // the pre-existing dark-mode override `.typography-panel { background-color: #2f2f2f }`
    // (1 class, inside @media). That silently pinned the Reader's Aa
    // overlay to a light background in every theme, while its label text
    // still inherited a themed (light-in-dark-mode) foreground -- light
    // text on a light background, "effectively invisible" per the real
    // desktop retest.
    // A themed override must exist that targets `.reader .typography-panel`
    // specifically (not just the bare `.typography-panel`, which would be
    // beaten by the base rule's higher specificity) for both explicit
    // Dark and system/Match-System dark, each setting both background AND
    // an explicit foreground color rather than relying on inheritance.
    const explicitDarkPanelMatch = css.match(
      /:root\[data-theme="dark"\][^{]*\.reader \.typography-panel[^{]*\{([^}]*)\}/,
    );
    expect(explicitDarkPanelMatch, "expected an explicit-Dark rule targeting `.reader .typography-panel`").not.toBeNull();
    expect(explicitDarkPanelMatch![1]).toMatch(/background-color:\s*#2f2f2f/);
    expect(explicitDarkPanelMatch![1]).toMatch(/(?<!background-)color:\s*#f6f6f6/);

    const darkBlocks = extractPrefersDarkBlocks(css);
    const systemDarkPanelBlock = darkBlocks.find((b) => /\.reader \.typography-panel/.test(b));
    expect(systemDarkPanelBlock, "expected a system-dark (Match System) rule targeting `.reader .typography-panel`").toBeDefined();
    const systemDarkPanelMatch = systemDarkPanelBlock!.match(/\.reader \.typography-panel[^{]*\{([^}]*)\}/);
    expect(systemDarkPanelMatch).not.toBeNull();
    expect(systemDarkPanelMatch![1]).toMatch(/background-color:\s*#2f2f2f/);
    expect(systemDarkPanelMatch![1]).toMatch(/(?<!background-)color:\s*#f6f6f6/);
  });
});
