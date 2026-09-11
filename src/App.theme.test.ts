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
  it("the Reader overlay resolves its background/color through the shared contextual surface tokens", () => {
    // HA-009's invisible Reader Aa panel and HA-010's stale contextual
    // panels have the same failure family: overlay surfaces should not
    // compete through one-off light/dark background declarations. The
    // Reader-scoped Aa panel must consume shared themed tokens so
    // explicit Dark and Match-System dark remain contrast-correct.
    expect(css).toMatch(/--contextual-surface-bg:\s*#2f2f2f/);
    expect(css).toMatch(/--contextual-surface-fg:\s*#f6f6f6/);
    const readerPanelRule = css.match(/\.reader \.typography-panel\s*\{([^}]*)\}/);
    expect(readerPanelRule).not.toBeNull();
    expect(readerPanelRule![1]).not.toMatch(/background-color:\s*#f6f6f6/);
    expect(readerPanelRule![1]).toContain("background-color: var(--contextual-surface-bg)");
    expect(readerPanelRule![1]).toContain("color: var(--contextual-surface-fg)");
  });
});

describe("App.css contextual surface theme contract (HA-010)", () => {
  it("contextual surfaces share semantic surface tokens instead of hard-coded competing light/dark backgrounds", () => {
    // HA-010 real desktop retest: explicit Light correctly reached the
    // shell and EPUB document, but Settings Typography and Reader
    // Contents stayed Dark. The recurring bug pattern is contextual
    // panels each owning hard-coded light/dark backgrounds with scattered
    // media-query overrides. The contract is one themed surface family:
    // Typography (Settings + Reader), Contents, Notebook, and adjacent
    // prompts/toolbars consume the same CSS variables so explicit Light,
    // explicit Dark, and Match System all resolve through the same
    // cascade.
    expect(css).toMatch(/--contextual-surface-bg:\s*#f6f6f6/);
    expect(css).toMatch(/--contextual-surface-fg:\s*#0f0f0f/);
    expect(css).toMatch(/:root\[data-theme="dark"\][\s\S]*--contextual-surface-bg:\s*#2f2f2f/);
    expect(css).toMatch(
      /:root:not\(\[data-theme="light"\]\)[\s\S]*--contextual-surface-bg:\s*#2f2f2f/,
    );

    for (const selector of [".typography-panel", ".toc-panel", ".notebook-panel", ".selection-toolbar", ".completion-prompt"]) {
      const rule = css.match(new RegExp(`(^|\\n)${selector.replace(".", "\\.")}\\s*\\{([^}]*)\\}`));
      expect(rule, `expected ${selector} rule`).not.toBeNull();
      expect(rule![2], `${selector} should consume the shared contextual surface background`).toContain(
        "background-color: var(--contextual-surface-bg)",
      );
      expect(rule![2], `${selector} should consume the shared contextual surface foreground`).toContain(
        "color: var(--contextual-surface-fg)",
      );
      expect(rule![2], `${selector} should consume the shared contextual surface border`).toContain(
        "border: 1px solid var(--contextual-surface-border)",
      );
    }
  });

  it("no prefers-dark media block rethemes contextual panels directly", () => {
    const darkBlocks = extractPrefersDarkBlocks(css);
    for (const block of darkBlocks) {
      expect(block).not.toMatch(/\.typography-panel\s*,|\s\.typography-panel\s*\{/);
      expect(block).not.toMatch(/\.toc-panel\s*,|\s\.toc-panel\s*\{/);
      expect(block).not.toMatch(/\.notebook-panel\s*,|\s\.notebook-panel\s*\{/);
      expect(block).not.toMatch(/\.selection-toolbar\s*,|\s\.selection-toolbar\s*\{/);
      expect(block).not.toMatch(/\.completion-prompt\s*,|\s\.completion-prompt\s*\{/);
    }
  });
});

describe("App.css M9 viewport and overflow hardening", () => {
  function ruleFor(selector: string): string {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = css.match(new RegExp(`(^|\\n)${escaped}\\s*\\{([^}]*)\\}`));
    expect(match, `expected ${selector} rule`).not.toBeNull();
    return match![2];
  }

  it("interactive controls and long text cannot force their containers wider than the viewport", () => {
    const globalControls = ruleFor("button, input, select, textarea");
    expect(globalControls).toContain("max-width: 100%");

    const longText = ruleFor(".title, .reader-title, .book-title, .resume-title-btn, .bhName, .kv, .notice, .networkNote");
    expect(longText).toContain("overflow-wrap: anywhere");
  });

  it("toolbar and action rows wrap instead of overlapping or overflowing in narrow native windows", () => {
    expect(ruleFor(".top")).toContain("flex-wrap: wrap");
    expect(ruleFor(".reader-toolbar")).toContain("flex-wrap: wrap");
    expect(ruleFor(".reader-toolbar-controls")).toContain("flex-wrap: wrap");
    expect(ruleFor(".settings-actions, .data-recovery-actions, .book-actions, .modalActions, .new-collection-form")).toContain(
      "flex-wrap: wrap",
    );
  });

  it("modal and floating bulk-action surfaces are bounded to the visible viewport", () => {
    expect(ruleFor(".overlay")).toContain("overflow-y: auto");
    expect(ruleFor(".modal")).toContain("max-width: min(560px, calc(100vw - 24px))");
    expect(ruleFor(".modal")).toContain("overflow-y: auto");
    expect(ruleFor(".modal > *")).toContain("min-width: 0");
    expect(ruleFor(".modalHead")).toContain("position: sticky");
    expect(ruleFor(".modalActions")).toContain("position: sticky");
    expect(ruleFor(".bulk-action-bar")).toContain("max-width: calc(100vw - 24px)");
  });

  it("fixed two-column form rows collapse to a single column at constrained widths", () => {
    const responsiveBlocks = css.match(/@media \(max-width: 720px\)\s*\{[\s\S]*?\.settingRow[\s\S]*?\.bhControl[\s\S]*?\}/);
    expect(responsiveBlocks, "expected shared narrow-viewport form-row media rule").not.toBeNull();
    expect(responsiveBlocks![0]).toContain("grid-template-columns: 1fr");
  });
});
