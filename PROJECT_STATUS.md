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
- Clean-environment acceptance testing revealed two packaging omissions: first `libstdc++-6.dll`, then `WebView2Loader.dll` on clean Windows 11.
- Root Cause / Earliest Wrong Layer: Packaging & Bundling Configuration (`src-tauri/tauri.conf.json`). Under the MinGW GNU toolchain, the C++ runtime and WebView2 loader were generated in `target/release/`, but Tauri's NSIS packager only copies resources explicitly mapped in `bundle.resources`.
- Production Fix: Configured `src-tauri/tauri.conf.json` `bundle.resources` mapping (`"redist/*": "./"`) with the complete four-DLL redistributable manifest (`WebView2Loader.dll`, `libstdc++-6.dll`, `libgcc_s_seh-1.dll`, `libwinpthread-1.dll`) in `src-tauri/redist/`.
- Automated Audit & Regression Coverage:
  - Created `tooling/audit_runtime_closure.mjs` performing recursive PE dependency closure analysis.
  - Added deterministic vitest regression tests in `src/packagingRuntime.test.ts` (asserting `tauri.conf.json` mapping, physical DLL existence in redist, and complete `auditRuntimeClosure` validation).
  - Mechanically verified silent scratch installation from the generated NSIS setup executable, proving that all 4 runtime DLLs land directly in `$INSTDIR` alongside `ebookreader.exe`.
- Dependency Closure: Verified with `objdump -p` and `tooling/audit_runtime_closure.mjs` that all runtime dependencies are either co-located in `$INSTDIR` or resolve to standard Windows OS libraries in `System32`. Zero external runtime DLL dependencies remain unresolved.
- Rebuilt Production Installers:
  - NSIS Installer: `target/release/bundle/nsis/EbookReader_0.1.0_x64-setup.exe` (SHA256: `224B93C2AB71A2400E4531C5D0CBEE9BFD747DDECB10332A4C78A04DAF4B13BA`)
  - MSI Installer: `target/release/bundle/msi/EbookReader_0.1.0_x64_en-US.msi` (SHA256: `25DCB0A0BBAA97B6C7F18E00755106BB06B83DDB03EF563A520A2BD7CD742C19`)

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






