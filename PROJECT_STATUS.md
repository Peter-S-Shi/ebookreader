# EbookReader Project Status

Last Updated: 2026-09-11 (M10-C Release Governance & Publication Active)

Current Phase: **Milestone 10 Active (M10-C — Release Governance & Publication)**. M10-A Clean Install is **HUMAN PASS** on clean Windows 11 VM. M10-B Packaged RC Acceptance is **HUMAN PASS** with full human verification across all 14 core reader workflows and Optional OCR Pack local discovery/inference. Full Automated Regression and PR Promotion Gate CI are **PASS (All Green)**. Human Feature Freeze remains **APPROVED**, V1 scope remains locked, and Milestone 10-C is explicitly authorized and ACTIVE.

**Feature Freeze Decision Summary:**
- The Human Feature Freeze Gate has been explicitly approved by the user after the Feature Complete Candidate #2 corrective pass and subsequent native Tauri acceptance.
- Native acceptance passed for Highlight lifecycle, Collections management, Library multi-select, Bilingual Alignment management, and Book Hours smoke coverage.
- The known native layout/form overlap and card/button overflow behavior was audited and resolved inside M9 Product Hardening within the frozen V1 scope.
- Feature Freeze remains in effect: no new features, workflow redesigns, Feature Freeze scope expansion, or unrelated refactors are permitted during M10.

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
  - Standalone Optional OCR Pack: Created official `EbookReader_OCR_Pack_0.1.0_x64-setup.exe` (~56.5 MB solid LZMA compression) packaging ONNX Runtime (MIT) and PaddleOCR DBNet/SVTR-LCNet models (Apache-2.0).
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

**M10-C Release Governance & Publication (Active):**
- Verified release-facing candidate artifacts and SHA256 checksums:
  - Core NSIS Installer: `target/release/bundle/nsis/EbookReader_0.1.0_x64-setup.exe` (4,817,866 bytes, SHA256: `1F947C2482FF0734ACDAD9EEC036B47265A488F5EBC7FEAE82709626ED8C6D64`)
  - Core MSI Installer: `target/release/bundle/msi/EbookReader_0.1.0_x64_en-US.msi` (6,365,184 bytes, SHA256: `9BF631C346AE43C9EC1E33B5E19F13FBF364774FFC32B7208A7BEE27BA7A03C2`)
  - Optional OCR Pack: `target/release/bundle/ocr-pack/EbookReader_OCR_Pack_0.1.0_x64-setup.exe` (59,202,756 bytes, SHA256: `F446F02E2528625B5F35253328D7E497D93B786703CB55E840B32C2664920B3D`)
- Verified third-party redistribution licenses & attributions: Microsoft ONNX Runtime (MIT), PaddleOCR DBNet/SVTR-LCNet models (Apache-2.0).

**Full Automated Regression Verification:**
- Frontend unit tests `npm test`: 38 test files, 307 passed; 0 failed.
- TypeScript typecheck `npm run typecheck`: 0 errors.
- Rust workspace tests `cargo test --workspace` + `cargo test -p ebookreader`: 219 passed, 2 ignored; 0 failed.
- PE runtime dependency closure `node tooling/audit_runtime_closure.mjs`: 100% closure verified (0 unresolved DLLs).
- Production frontend build `npm run build`: passed.
- Production Tauri release build `npm run tauri build`: passed.

Current Milestone: M1 — **Complete**, `94aff83`; M2 — **Complete**, `0a04fb4`; M3 — **Complete**, `096b90d` + durability test; M4 — **Complete**, `7f12173`; M5 — **Complete**, `67d32c5`; M6 — **Complete**, `9e99099`; M7 — **Complete**, `4d86045`; M8 — **Complete**, `2b81d54`; M9 — **Complete**, `5ccc240`; M10 — **Active** (M10-A Complete [HUMAN PASS], M10-B Complete [HUMAN PASS], M10-C Active).
Current Checkpoint / Promotion Unit: **M10-C (Release Governance & Publication Preflight — RELEASE_READY_FOR_HUMAN_APPROVAL)**.
Current Branch / PR: `milestone/10a-rc-clean-install` / PR #1
Current Blockers: None.
Current Escalations: None.
Architecture State: **Accepted Architecture Baseline (Updated for Pre-Freeze UX Hardening, Book Hours V1 Redesign, and Optional Local OCR Pack)**.
Feature Complete: Complete; Candidate #2 accepted through the Human Feature Freeze Gate.
Feature Freeze: **Approved by human decision on 2026-09-11. V1 scope locked.**
RC / Release State: M10-A Clean Install PASS (HUMAN PASS); M10-B Packaged RC Acceptance PASS (HUMAN PASS); M10-C Release Governance Active.
Next Action: Await human approval for release tag creation and GitHub publication.






