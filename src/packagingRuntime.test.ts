import { describe, expect, it } from "vitest";
// @ts-expect-error type error without @types/node package
import { existsSync, readFileSync, statSync } from "node:fs";
// @ts-expect-error type error without @types/node package
import { join } from "node:path";
// @ts-expect-error type error without @types/node package
import process from "node:process";

const REQUIRED_REDIST_DLLS = [
  "libstdc++-6.dll",
  "libgcc_s_seh-1.dll",
  "libwinpthread-1.dll",
] as const;

describe("Packaging runtime dependency closure (Release Blocker: libstdc++-6.dll)", () => {
  const rootDir = process.cwd();
  const tauriConfPath = join(rootDir, "src-tauri", "tauri.conf.json");
  const redistDir = join(rootDir, "src-tauri", "redist");

  it("tauri.conf.json configures bundle.resources to map redist/* to installer root ./", () => {
    expect(existsSync(tauriConfPath)).toBe(true);
    const conf = JSON.parse(readFileSync(tauriConfPath, "utf-8"));
    expect(conf.bundle).toBeDefined();
    expect(conf.bundle.resources).toBeDefined();
    expect(conf.bundle.resources["redist/*"]).toBe("./");
  });

  it("src-tauri/redist contains all required non-empty MinGW runtime DLLs", () => {
    for (const dll of REQUIRED_REDIST_DLLS) {
      const dllPath = join(redistDir, dll);
      expect(existsSync(dllPath), `Missing required runtime DLL: ${dll}`).toBe(true);
      const stats = statSync(dllPath);
      expect(stats.size, `Runtime DLL ${dll} must not be empty`).toBeGreaterThan(1000);
    }
  });

  it("bundle configuration accurately covers each required redist DLL", () => {
    const conf = JSON.parse(readFileSync(tauriConfPath, "utf-8"));
    const resourceMapping = conf.bundle.resources;
    expect(resourceMapping["redist/*"]).toBe("./");
    for (const dll of REQUIRED_REDIST_DLLS) {
      const directPath = join(redistDir, dll);
      expect(existsSync(directPath)).toBe(true);
    }
  });
});

