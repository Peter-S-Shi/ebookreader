import { describe, expect, it } from "vitest";
// @ts-expect-error type error without @types/node package
import { existsSync, readFileSync, statSync } from "node:fs";
// @ts-expect-error type error without @types/node package
import { join } from "node:path";
// @ts-expect-error type error without @types/node package
import process from "node:process";
// @ts-expect-error local module import
import { auditRuntimeClosure } from "../tooling/audit_runtime_closure.mjs";

const REQUIRED_REDIST_DLLS = [
  "WebView2Loader.dll",
  "libstdc++-6.dll",
  "libgcc_s_seh-1.dll",
  "libwinpthread-1.dll",
] as const;

describe("Packaging runtime dependency closure (Release Blockers: WebView2Loader & MinGW DLLs)", () => {
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

  it("src-tauri/redist contains all required non-empty redistributable DLLs", () => {
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

  it("auditRuntimeClosure passes with 100% complete dependency closure", () => {
    const releaseExe = join(rootDir, "target", "release", "ebookreader.exe");
    if (existsSync(releaseExe)) {
      const result = auditRuntimeClosure();
      expect(result.issues).toEqual([]);
      expect(result.valid).toBe(true);
      for (const dll of REQUIRED_REDIST_DLLS) {
        expect(result.requiredRedistDlls).toContain(dll);
      }
    }
  });
});


