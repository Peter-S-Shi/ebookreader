import { describe, expect, it } from "vitest";
// @ts-expect-error type error without @types/node package
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
// @ts-expect-error type error without @types/node package
import { join } from "node:path";
// @ts-expect-error type error without @types/node package
import process from "node:process";
// @ts-expect-error local module import
import { auditRuntimeClosure } from "../tooling/audit_runtime_closure.mjs";
// @ts-expect-error local module import
import { REQUIRED_OCR_FILES, findMakensis, buildOcrPack } from "../tooling/build_ocr_pack.mjs";

const REQUIRED_REDIST_DLLS = [
  "WebView2Loader.dll",
  "libstdc++-6.dll",
  "libgcc_s_seh-1.dll",
  "libwinpthread-1.dll",
] as const;

describe("Packaging runtime dependency closure & Core lightweight boundary", () => {
  const rootDir = process.cwd();
  const tauriConfPath = join(rootDir, "src-tauri", "tauri.conf.json");
  const redistDir = join(rootDir, "src-tauri", "redist");
  const ocrNsiPath = join(rootDir, "tooling", "ocr_pack.nsi");
  const ocrBuildScriptPath = join(rootDir, "tooling", "build_ocr_pack.mjs");
  const ocrDir = join(rootDir, "ocr-assets");

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

  it("auditRuntimeClosure passes with complete dependency closure when release binary exists", () => {
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

  it("keeps Core packaging lightweight without bundling heavy ocr-assets into redist", () => {
    const ocrAssetsInRedist = join(redistDir, "PP-OCRv6_det_medium.onnx");
    expect(existsSync(ocrAssetsInRedist)).toBe(false);
  });

  it("standalone OCR Pack build tooling and manifest contract are fully specified in tracked sources", () => {
    expect(existsSync(ocrBuildScriptPath)).toBe(true);
    expect(typeof buildOcrPack).toBe("function");
    expect(typeof findMakensis).toBe("function");
    expect(Array.isArray(REQUIRED_OCR_FILES)).toBe(true);
    expect(REQUIRED_OCR_FILES.length).toBe(5);

    const expectedOcrFiles = [
      "PP-OCRv6_det_medium.onnx",
      "PP-OCRv6_rec_small.onnx",
      "ch_ppocr_mobile_v2.0_cls_mobile.onnx",
      "onnxruntime.dll",
      "onnxruntime_providers_shared.dll",
    ];
    for (const file of expectedOcrFiles) {
      expect(REQUIRED_OCR_FILES).toContain(file);
    }

    expect(existsSync(ocrNsiPath)).toBe(true);
    const nsiContent = readFileSync(ocrNsiPath, "utf-8");
    expect(nsiContent).toContain("InstallDir \"$APPDATA\\com.peter-shi.ebookreader\\ocr-assets\"");
    for (const file of expectedOcrFiles) {
      expect(nsiContent).toContain(`File "..\\ocr-assets\\${file}"`);
      expect(nsiContent).toContain(`Delete "$INSTDIR\\${file}"`);
    }
  });

  it("validates local OCR Pack asset payload when present in local packaging environment", () => {
    const hasLocalOcrFiles = existsSync(ocrDir) && readdirSync(ocrDir).some((f: string) => f.endsWith(".onnx") || f.endsWith(".dll"));
    if (hasLocalOcrFiles) {
      for (const file of REQUIRED_OCR_FILES) {
        const p = join(ocrDir, file);
        expect(existsSync(p), `Missing local OCR asset ${file}`).toBe(true);
        expect(statSync(p).size).toBeGreaterThan(1000);
      }
    }
  });

  it("enforces release identity consistency (v1.0.0) across all packaging and manifest sources", () => {
    const pkg = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf-8"));
    expect(pkg.version).toBe("1.0.0");

    const tauriConf = JSON.parse(readFileSync(tauriConfPath, "utf-8"));
    expect(tauriConf.version).toBe("1.0.0");

    const srcTauriCargo = readFileSync(join(rootDir, "src-tauri", "Cargo.toml"), "utf-8");
    expect(srcTauriCargo).toMatch(/^version\s*=\s*"1\.0\.0"/m);

    const domainCargo = readFileSync(join(rootDir, "crates", "domain", "Cargo.toml"), "utf-8");
    expect(domainCargo).toMatch(/^version\s*=\s*"1\.0\.0"/m);

    const updateAwarenessTs = readFileSync(join(rootDir, "src", "updateAwareness.ts"), "utf-8");
    expect(updateAwarenessTs).toContain('export const CURRENT_VERSION = "1.0.0";');

    const ocrNsi = readFileSync(ocrNsiPath, "utf-8");
    expect(ocrNsi).toContain('!define PRODUCT_VERSION "1.0.0"');
    expect(ocrNsi).toContain('EbookReader_OCR_Pack_1.0.0_x64-setup.exe');

    const ocrBuildScript = readFileSync(ocrBuildScriptPath, "utf-8");
    expect(ocrBuildScript).toContain('EbookReader_OCR_Pack_1.0.0_x64-setup.exe');
  });
});
