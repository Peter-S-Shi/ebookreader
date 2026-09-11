# EbookReader Project Status

Last Updated: 2026-09-11 (v1.0.0 Released — Milestone 10 Complete)

Current Phase: **Milestone 10 Complete (v1.0.0 Released) — Next Lifecycle Phase: Portfolio Packaging (PP)**. M10-A Clean Install is **HUMAN PASS** on clean Windows 11 VM. M10-B Packaged RC Acceptance is **HUMAN PASS** with full human verification across all 14 core reader workflows and Optional OCR Pack local discovery/inference. M10-C Release Governance & Publication is **Complete**; PR #1 merged into `main`, Git Tag `v1.0.0` pushed, and GitHub Release `v1.0.0` published with approved candidate artifacts and verified SHA256 checksums. Full Automated Regression and CI Promotion Gate are **PASS (All Green)**. Human Feature Freeze remains **APPROVED** and V1 scope remains locked.

**Feature Freeze Decision Summary:**
- The Human Feature Freeze Gate has been explicitly approved by the user after the Feature Complete Candidate #2 corrective pass and subsequent native Tauri acceptance.
- Native acceptance passed for Highlight lifecycle, Collections management, Library multi-select, Bilingual Alignment management, and Book Hours smoke coverage.
- The known native layout/form overlap and card/button overflow behavior was audited and resolved inside M9 Product Hardening within the frozen V1 scope.
- Feature Freeze remains in effect: no new features, workflow redesigns, Feature Freeze scope expansion, or unrelated refactors are permitted.

**M9 Product Hardening & Corrective Retest Summary:**
- Bounded release-blocker audit followed `ROADMAP.md` M9 scope. Earliest-wrong-layer attribution for the known native layout/form overlap and card/button overflow issue: shared CSS layout contracts, not domain or feature wiring, lacked a systemic viewport containment rule for compact native windows.
- Fixed the release-blocking layout family without redesigning accepted workflows: interactive controls are max-width bounded, long labels/titles can break safely, shell/reader/action toolbars wrap, modals and the Library bulk-action bar stay within the visible viewport, and fixed two-column Settings / Book Hours form rows collapse to one column on constrained widths.
- Added focused CSS-source regression coverage in `src/App.theme.test.ts` to keep the M9 viewport/overflow contract from regressing.
- Native Human Acceptance subsequently exposed three frozen-V1 defects (EPUB line-height publisher style overrides, PDF zoom/navigation controls, and Book Hours shell row geometry) plus a follow-up Reading Profile card layout stabilization (`5ccc240`). All corrections were implemented and formally verified via Targeted Native Human Retest with explicit user PASS.
- Reviewed correctness/data integrity, migrations/partial writes, relink/orphan handling, ReadingSession shutdown, Highlight/Alignment durability, OCR correction durability, Backup/Restore, empty/loading/error/degraded states, keyboard/focus, Light/Dark contrast, performance/memory, privacy, dependency/license hygiene, and font redistribution boundaries. No release blockers remain.

**M10-A RC Build & Clean Install Verification (Complete — HUMAN PASS):**
- Clean-environment acceptance testing in an isolated Clean-Windows-11 VM initially exposed two packaged-runtime dependency defects (`libstdc++-6.dll` and `WebView2Loader.dll`).
- Resolved by configuring `src-tauri/tauri.conf.json` `bundle.resources` mapping (`"redist/*": "./"`) with the complete four-DLL redistributable manifest (`WebView2Loader.dll`, `libstdc++-6.dll`, `libgcc_s_seh-1.dll`, `libwinpthread-1.dll`) in `src-tauri/redist/`.
- Automated Audit & Regression Coverage: Created `tooling/audit_runtime_closure.mjs` and vitest suite in `src/packagingRuntime.test.ts`. 100% dependency closure verified.
- Authoritative Human Evidence: NSIS installer installed cleanly in isolated Clean-Windows-11 VM without external dependencies; dual launches succeeded; AppData and SQLite initialized without error.
- **M10-A Verdict: HUMAN PASS (Closed).**

**M10-B Packaged RC Acceptance & OCR Corrective Pass (Complete — HUMAN PASS & CI GREEN):**
- Scope: Full end-to-end acceptance across the 14 core workflows on clean Windows 11 environment.
- OCR Architectural Reconciliation:
  - EbookReader Core is a lightweight standalone application (~13 MB installed); heavy neural network models (~100 MB) are decoupled from the Core installer.
  - Scanned PDFs remain fully readable visually without OCR; text-dependent features present a truthful, neutral degraded state (`OCR Pack Not Installed`).
  - Standalone Optional OCR Pack: Created official `EbookReader_OCR_Pack_1.0.0_x64-setup.exe` (~56.5 MB solid LZMA compression) packaging ONNX Runtime (MIT) and PaddleOCR DBNet/SVTR-LCNet models (Apache-2.0).
  - Zero-Configuration Discovery: Core automatically detects installed OCR assets in `%APPDATA%\com.peter-shi.ebookreader\ocr-assets\` or `$INSTDIR\ocr-assets\` with full integrity validation (`is_complete_ocr_dir`).
- Authoritative Human Acceptance Evidence:
  - Clean Core install on Windows 11 VM passed.
  - Neutral degraded state when no pack is installed verified.
  - Scanned PDF visual reading works normally.
  - Optional OCR Pack standalone installation and zero-config auto-discovery passed.
  - Real local OCR inference executed and verified.
  - OCR corrections persistence across sessions passed.
  - Restart rediscovery and data integrity verified.
  - Explicit user **HUMAN PASS** recorded.
- CI Test-Contract Resolution: Decoupled tracked packaging contract validation from gitignored binary preflight; full CI promotion gate green on PR #1 (`f718cf4`, Run `34645518509`).
- **M10-B Verdict: HUMAN PASS & CI GREEN (Closed).**

**M10-C Release Governance & Publication (Complete — RELEASED):**
- Release Identity Finalization: Upgraded release identity consistently to **v1.0.0** across all package manifests, Tauri configuration, Update Awareness, OCR pack builder, tests, and documentation.
- Release Verification & Promotion: PR #1 merged into `main` (`dea8d82`), Git tag `v1.0.0` pushed, and GitHub Release `v1.0.0` published.
- Verified release artifacts, exact file sizes, and SHA256 checksums:
  - Core NSIS Installer: `EbookReader_1.0.0_x64-setup.exe` (4,818,366 bytes, SHA256: `87C6F9AD61E3D5832CCDCAC4C9B165C64C88AC51349109B0678724FFE3A0D212`)
  - Core MSI Installer: `EbookReader_1.0.0_x64_en-US.msi` (6,361,088 bytes, SHA256: `3CD29E9114225E03BAD875BEF1237685A6CC6C164F8EB95DACF164057A713BC9`)
  - Optional OCR Pack: `EbookReader_OCR_Pack_1.0.0_x64-setup.exe` (59,183,570 bytes, SHA256: `6A9D8ECD1500EE4C8DFE2DE610F2398EA72F51B222BDE4B4A4C1DFED0DA8ECA3`)
- Verified third-party redistribution licenses & attributions: Microsoft ONNX Runtime (MIT), PaddleOCR DBNet/SVTR-LCNet models (Apache-2.0), Microsoft Edge WebView2.

**Full Automated Regression Verification:**
- Frontend unit tests `npm test`: 38 test files, 308 passed; 0 failed.
- TypeScript typecheck `npm run typecheck`: 0 errors.
- Rust workspace tests `cargo test --workspace` + `cargo test -p ebookreader`: 219 passed, 2 ignored; 0 failed.
- PE runtime dependency closure `node tooling/audit_runtime_closure.mjs`: 100% closure verified (0 unresolved DLLs).
- Production frontend build `npm run build`: passed.
- Production Tauri release build `npm run tauri build`: passed.

Current Milestone: M1 — **Complete**, `94aff83`; M2 — **Complete**, `0a04fb4`; M3 — **Complete**, `096b90d` + durability test; M4 — **Complete**, `7f12173`; M5 — **Complete**, `67d32c5`; M6 — **Complete**, `9e99099`; M7 — **Complete**, `4d86045`; M8 — **Complete**, `2b81d54`; M9 — **Complete**, `5ccc240`; M10 — **Complete** (M10-A Complete [HUMAN PASS], M10-B Complete [HUMAN PASS], M10-C Complete [RELEASED]).
Current Checkpoint: **V1_0_0_RELEASED_M10_COMPLETE_PP_NEXT**.
Current Branch: `main` (`dea8d82`, Tag: `v1.0.0`)
Current Blockers: None.
Current Escalations: None.
Architecture State: **Accepted Architecture Baseline (Updated for Pre-Freeze UX Hardening, Book Hours V1 Redesign, and Optional Local OCR Pack)**.
Feature Complete: Complete; Candidate #2 accepted through the Human Feature Freeze Gate.
Feature Freeze: **Approved by human decision on 2026-09-11. V1 scope locked.**
RC / Release State: **v1.0.0 Released (GitHub Release & Assets Published)**.
Next Action: Proceed to Portfolio Packaging (PP) phase when authorized.







