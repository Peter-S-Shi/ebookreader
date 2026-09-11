import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const rootDir = process.cwd();
const tauriConfPath = join(rootDir, "src-tauri", "tauri.conf.json");
const redistDir = join(rootDir, "src-tauri", "redist");
const releaseDir = join(rootDir, "target", "release");

const SYSTEM_DLL_PATTERNS = [
  /^kernel32\.dll$/i,
  /^ntdll\.dll$/i,
  /^user32\.dll$/i,
  /^gdi32\.dll$/i,
  /^ole32\.dll$/i,
  /^oleaut32\.dll$/i,
  /^shell32\.dll$/i,
  /^shlwapi\.dll$/i,
  /^advapi32\.dll$/i,
  /^wtsapi32\.dll$/i,
  /^dwmapi\.dll$/i,
  /^comctl32\.dll$/i,
  /^combase\.dll$/i,
  /^bcryptprimitives\.dll$/i,
  /^api-ms-win-.*\.dll$/i,
  /^ext-ms-win-.*\.dll$/i,
];

function isSystemDll(dllName) {
  return SYSTEM_DLL_PATTERNS.some((pattern) => pattern.test(dllName));
}

function getImports(binaryPath) {
  try {
    const output = execSync(`objdump -p "${binaryPath}"`, {
      encoding: "utf-8",
      maxBuffer: 64 * 1024 * 1024,
    });
    const matches = output.match(/DLL Name:\s*([^\r\n]+)/gi) || [];
    return [...new Set(matches.map((m) => m.replace(/DLL Name:\s*/i, "").trim()))];
  } catch (err) {
    throw new Error(`Failed to parse PE imports for ${binaryPath}: ${err.message}`);
  }
}

export function auditRuntimeClosure() {
  const issues = [];
  const inventory = [];

  if (!existsSync(tauriConfPath)) {
    throw new Error("tauri.conf.json not found");
  }

  const conf = JSON.parse(readFileSync(tauriConfPath, "utf-8"));
  const resources = conf.bundle?.resources || {};
  const hasRedistMapping = resources["redist/*"] === "./" || resources["redist/*"] === "";
  if (!hasRedistMapping) {
    issues.push("tauri.conf.json bundle.resources must map 'redist/*' to './'");
  }

  const mainExePath = join(releaseDir, "ebookreader.exe");
  if (!existsSync(mainExePath)) {
    issues.push("target/release/ebookreader.exe not found. Build release binary first.");
  }

  const queue = ["ebookreader.exe"];
  const visited = new Set();
  const requiredRedistDlls = new Set();

  while (queue.length > 0) {
    const currentName = queue.shift();
    if (visited.has(currentName.toLowerCase())) continue;
    visited.add(currentName.toLowerCase());

    const isMainExe = currentName === "ebookreader.exe";
    let filePath = isMainExe ? mainExePath : join(redistDir, currentName);
    if (!existsSync(filePath) && !isMainExe) {
      filePath = join(releaseDir, currentName);
    }

    if (!existsSync(filePath)) {
      issues.push(`Referenced binary missing from redist and release: ${currentName}`);
      continue;
    }

    const imports = getImports(filePath);

    for (const imp of imports) {
      const impLower = imp.toLowerCase();
      if (isSystemDll(imp)) {
        inventory.push({
          source: currentName,
          dependency: imp,
          classification: "1. Windows System DLL",
          resolution: "Guaranteed by supported Windows 10/11",
          packaged: true,
        });
      } else {
        requiredRedistDlls.add(imp);
        const redistPath = join(redistDir, imp);
        const isPresentInRedist = existsSync(redistPath) && statSync(redistPath).size > 1000;

        inventory.push({
          source: currentName,
          dependency: imp,
          classification: "3. App-Owned Redistributable DLL",
          resolution: isPresentInRedist ? "Bundled in src-tauri/redist/" : "MISSING from redist",
          packaged: isPresentInRedist,
        });

        if (!isPresentInRedist) {
          issues.push(`Required runtime DLL missing from src-tauri/redist/: ${imp}`);
        }

        if (!visited.has(impLower)) {
          queue.push(imp);
        }
      }
    }
  }

  const nsisScriptPath = join(releaseDir, "nsis", "x64", "installer.nsi");
  if (existsSync(nsisScriptPath)) {
    const nsisContent = readFileSync(nsisScriptPath, "utf-8");
    for (const dll of requiredRedistDlls) {
      const expectedLine = `/oname=${dll}`;
      if (!nsisContent.includes(expectedLine)) {
        issues.push(`NSIS script installer.nsi does not package required DLL: ${dll}`);
      }
    }
  }

  const wixScriptPath = join(releaseDir, "wix", "x64", "main.wxs");
  if (existsSync(wixScriptPath)) {
    const wixContent = readFileSync(wixScriptPath, "utf-8");
    for (const dll of requiredRedistDlls) {
      if (!wixContent.includes(dll)) {
        issues.push(`WiX script main.wxs does not package required DLL: ${dll}`);
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    inventory,
    requiredRedistDlls: Array.from(requiredRedistDlls),
  };
}

if (process.argv[1]?.endsWith("audit_runtime_closure.mjs") || process.argv[1]?.endsWith("audit_runtime_closure.js")) {
  const result = auditRuntimeClosure();
  console.log("=== Runtime Dependency Closure Audit ===");
  console.log(`Required App Redistributables (${result.requiredRedistDlls.length}):`, result.requiredRedistDlls);
  if (!result.valid) {
    console.error("FAILED with issues:", result.issues);
    process.exit(1);
  } else {
    console.log("SUCCESS: 100% dependency closure verified.");
  }
}
