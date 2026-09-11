import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";

const rootDir = process.cwd();
const ocrAssetsDir = join(rootDir, "ocr-assets");
const outputDir = join(rootDir, "target", "release", "bundle", "ocr-pack");
const outputFile = join(outputDir, "EbookReader_OCR_Pack_0.1.0_x64-setup.exe");
const nsiScript = join(rootDir, "tooling", "ocr_pack.nsi");

export const REQUIRED_OCR_FILES = [
  "PP-OCRv6_det_medium.onnx",
  "PP-OCRv6_rec_small.onnx",
  "ch_ppocr_mobile_v2.0_cls_mobile.onnx",
  "onnxruntime.dll",
  "onnxruntime_providers_shared.dll",
];

export function findMakensis() {
  const localAppData = process.env.LOCALAPPDATA || "";
  const programFiles = process.env.ProgramFiles || "";
  const programFilesX86 = process.env["ProgramFiles(x86)"] || "";

  const candidates = [
    localAppData && join(localAppData, "tauri", "NSIS", "makensis.exe"),
    localAppData && join(localAppData, "tauri", "NSIS", "Bin", "makensis.exe"),
    programFiles && join(programFiles, "NSIS", "makensis.exe"),
    programFilesX86 && join(programFilesX86, "NSIS", "makensis.exe"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  // Fallback to searching PATH or local app cache
  return "makensis";
}

export function buildOcrPack() {
  console.log("==> Verifying source OCR assets...");
  for (const file of REQUIRED_OCR_FILES) {
    const filePath = join(ocrAssetsDir, file);
    if (!existsSync(filePath)) {
      throw new Error(`Missing source OCR asset: ${filePath}`);
    }
    const stat = statSync(filePath);
    console.log(`    ${file}: ${(stat.size / 1024 / 1024).toFixed(2)} MB`);
  }

  mkdirSync(outputDir, { recursive: true });

  const makensis = findMakensis();
  console.log(`==> Compiling OCR Pack installer using ${makensis}...`);
  execFileSync(makensis, [nsiScript], { cwd: join(rootDir, "tooling"), stdio: "inherit" });

  if (!existsSync(outputFile)) {
    throw new Error(`OCR Pack output not found at ${outputFile}`);
  }

  const stat = statSync(outputFile);
  const hash = createHash("sha256").update(readFileSync(outputFile)).digest("hex").toUpperCase();

  console.log("==> EbookReader Optional OCR Pack built successfully!");
  console.log(`    Path: ${outputFile}`);
  console.log(`    Size: ${(stat.size / 1024 / 1024).toFixed(2)} MB (${stat.size} bytes)`);
  console.log(`    SHA256: ${hash}`);

  return {
    outputFile,
    size: stat.size,
    sha256: hash,
  };
}

if (process.argv[1]?.endsWith("build_ocr_pack.mjs")) {
  buildOcrPack();
}
