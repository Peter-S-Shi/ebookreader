// @ts-expect-error Vitest runs in Node; production TypeScript intentionally excludes Node types.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Book Hours Planning layout contract", () => {
  it("allocates separate header, tab, and scrolling viewport rows without viewport subtraction", () => {
    const css = readFileSync("src/App.css", "utf8");
    const shellRule = css.match(/\.bhShell\s*\{([^}]*)\}/)?.[1] ?? "";
    const viewportRule = css.match(/\.bhViewport\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(shellRule).toContain("grid-template-rows: auto auto minmax(0, 1fr)");
    expect(shellRule).toContain("overflow: hidden");
    expect(shellRule).not.toContain("calc(100vh - 74px)");
    expect(viewportRule).toContain("min-height: 0");
    expect(viewportRule).toContain("overflow-y: auto");
    expect(css.match(/\.bhTabs\s*\{([^}]*)\}/)?.[1] ?? "").toContain("overflow-x: auto");
  });
});
