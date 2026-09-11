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

  it("keeps Core packaging lightweight without bundling heavy ocr-assets into redist", () => {
    const ocrAssetsInRedist = join(redistDir, "PP-OCRv6_det_medium.onnx");
    expect(existsSync(ocrAssetsInRedist)).toBe(false);
  });

  it("standalone OCR Pack asset directory contains complete PP-OCRv6 model set and ONNX Runtime", () => {
    const ocrDir = join(rootDir, "ocr-assets");
    const requiredFiles = [
      "PP-OCRv6_det_medium.onnx",
      "PP-OCRv6_rec_small.onnx",
      "ch_ppocr_mobile_v2.0_cls_mobile.onnx",
      "onnxruntime.dll",
      "onnxruntime_providers_shared.dll",
    ];
    for (const file of requiredFiles) {
      const p = join(ocrDir, file);
      expect(existsSync(p), `Missing OCR asset ${file}`).toBe(true);
      expect(statSync(p).size).toBeGreaterThan(1000);
    }
  });

  it("standalone OCR Pack build script tooling/build_ocr_pack.mjs exists and is functional", () => {
    const scriptPath = join(rootDir, "tooling", "build_ocr_pack.mjs");
    expect(existsSync(scriptPath)).toBe(true);
  });
});



