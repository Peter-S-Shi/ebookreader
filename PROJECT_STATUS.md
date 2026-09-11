# EbookReader Project Status

Last Updated: 2026-09-11 (M10-A RC Build & Clean Install Active)

Current Phase: **Milestone 10 Active (M10-A — RC Build & Clean Install)**. Full Automated Regression and Native Human Acceptance are **PASS** (closed at `5ccc240`). Human Feature Freeze remains **APPROVED**, V1 scope remains locked, M9 Product Hardening is complete, and Milestone 10 is explicitly authorized and ACTIVE.

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

**M10-A RC Build & Packaging Verification:**
- Initial clean-environment installation exposed a packaged-runtime dependency defect: `libstdc++-6.dll was not found` on a clean Windows 11 environment due to `clipper-sys` MinGW dynamic linkage.
- Root Cause / Earliest Wrong Layer: Packaging & Bundling Configuration (`src-tauri/tauri.conf.json`). Under the MinGW GNU toolchain, the C++ runtime (`libstdc++-6.dll`) and its prerequisites (`libgcc_s_seh-1.dll`, `libwinpthread-1.dll`) were linked dynamically but not provisioned in the installer payload.
- Production Fix: Configured `src-tauri/tauri.conf.json` `bundle.resources` mapping (`"redist/*": "./"`) to package the full MinGW redistributable DLL closure into `$INSTDIR` alongside `ebookreader.exe` and `WebView2Loader.dll`.
- Regression Coverage: Added `src/packagingRuntime.test.ts` (4 deterministic tests verifying resource configuration, non-empty redist DLLs, and NSIS/WiX installer script emission).
- Dependency Closure: Verified with `objdump -p` that all runtime dependencies (`ebookreader.exe`, `libstdc++-6.dll`, `libgcc_s_seh-1.dll`, `libwinpthread-1.dll`, `WebView2Loader.dll`) are either co-located in `$INSTDIR` or resolve to standard Windows OS libraries in `System32`. Zero external runtime DLL dependencies remain unresolved.
- Rebuilt Production Installers:
  - NSIS Installer: `target/release/bundle/nsis/EbookReader_0.1.0_x64-setup.exe` (SHA256: `B62B7828F4746FC977F5257190F29F99A70515B3FB64540BCA9285D87FC58F07`)
  - MSI Installer: `target/release/bundle/msi/EbookReader_0.1.0_x64_en-US.msi` (SHA256: `D260CD581EDECEEA690455DC7FCCF2487D4C8E293B61C3F1A2A7F41196BBBF94`)

**Full Automated Regression Verification:**
- Frontend unit tests `npm test`: 38 test files, 302 passed; 0 failed.
- TypeScript typecheck `npm run typecheck`: 0 errors.
- Rust workspace tests `cargo test --workspace`: 216 passed, 2 ignored; 0 failed.
- Production frontend build `npm run build`: passed.
- Production Tauri release build `npm run tauri build`: passed.

Current Milestone: M1 — **Complete**, `94aff83`; M2 — **Complete**, `0a04fb4`; M3 — **Complete**, `096b90d` + durability test; M4 — **Complete**, `7f12173`; M5 — **Complete**, `67d32c5`; M6 — **Complete**, `9e99099`; M7 — **Complete**, `4d86045`; M8 — **Complete**, `2b81d54`; M9 — **Complete**, `5ccc240`; M10 — **Active** (M10-A in progress).
Current Checkpoint / Promotion Unit: **M10-A (Packaged Runtime Blocker Resolved → Awaiting Clean Retest)**.
Current Branch / PR: `milestone/10a-rc-clean-install` / PR #1
Current Blockers: None.
Current Escalations: None.
Architecture State: **Accepted Architecture Baseline (Updated for Pre-Freeze UX Hardening & Book Hours V1 Redesign)**.
Feature Complete: Complete; Candidate #2 accepted through the Human Feature Freeze Gate.
Feature Freeze: **Approved by human decision on 2026-09-11. V1 scope locked.**
RC / Release State: M10-A candidate rebuilt with bundled runtime DLLs; awaiting clean-environment retest.
Next Action: Provide rebuilt candidate installer artifact for targeted human clean-environment retest.






