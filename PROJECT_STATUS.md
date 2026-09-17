# EbookReader Project Status

Last Updated: 2026-09-17 (V2.0.0 Portfolio Packaging Complete — Flagship portfolio packaged; Local Workspace Cleanup next)

Current Phase: **V2.0.0 Released (Portfolio Packaging Complete — Local Workspace Cleanup next)**. V1.0.0 historical lifecycle records stay locked (see V1 Feature Freeze Decision Summary below, retained for history). V2-M1 through V2-M6, Pre-Freeze UX Addenda A, B, and C, V2-M5 Product Hardening, V2-M6 Regression & Manual Acceptance, V2 RC (RC-1B Release Identity Finalization to 2.0.0, RC-2 Candidate Build & Runtime Closure, and RC-3 Clean Windows Packaged Acceptance), and RC-4 Release Governance & Publication are fully **Complete**. PR #7 has merged into `main` (`e235562fa0cd9c9e201fad95072049cb36e4e34a`), Git tag `v2.0.0` pushed, and GitHub Release `v2.0.0` officially published with verified SHA256 candidate artifacts. **Portfolio Packaging (PP) is complete** with the V2 flagship README and public portfolio evidence packaged through the V2 portfolio promotion PR. The next lifecycle phase is **Local Workspace Cleanup**.

**V1 Feature Freeze Decision Summary (historical, retained; superseded for V2 scope only by explicit user authorization to begin V2-M1):**

**Feature Freeze Decision Summary:**
- The Human Feature Freeze Gate has been explicitly approved by the user after the Feature Complete Candidate #2 corrective pass and subsequent native Tauri acceptance.
- Native acceptance passed for Highlight lifecycle, Collections management, Library multi-select, Bilingual Alignment management, and Book Hours smoke coverage.
- The known native layout/form overlap and card/button overflow behavior was audited and resolved inside M9 Product Hardening within the frozen V1 scope.
- For the released v1.0.0 baseline, Feature Freeze remains in effect: no V1 scope expansion, workflow redesign, or unrelated refactor is permitted. Any maintenance work or future version planning requires explicit user authorization.

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

**V2-M1 EPUB Reader Preference Override Compatibility (Complete — Implementation, Targeted Verification, and Human A/B Retest all PASS):**
- Scope: Diagnose and correctly fix reader typography preferences (font size, page width, margins) becoming unresponsive against certain publisher EPUB CSS. No other V2 area in scope for M1.
- Implemented fix (`src/typography.ts`): every reader-controlled `body` rule declaration (font-size, line-height, max-width, margins, padding, font-family) carries its own `!important`. The prose-selector rule gives each declaration its own explicit `!important` and expresses font-size in root-relative `rem` instead of parent-relative `%`, preventing nested-compounding bugs.
- Regression mechanism covered by public, synthetic, CI-safe unit tests in `src/typography.test.ts` (39/39 passed) and `npx tsc --noEmit` (0 errors).
- **Human A/B Retest: PASS.** Verified across previously failing and control EPUBs.

**V2-M2 Reader Navigation & Reliability (Complete — Implementation, Targeted Verification, and Human Acceptance all PASS):**
- Scope: Hierarchical Contents collapse/expand (`src/TocPanel.tsx`), native PDF bookmarks in Contents (`src/pdfOutline.ts`), Light/Dark theme startup-persistence fix, in-app confirmation modal for Remove from Library, and direct PDF page jump (`src/pdfPageInput.ts`).
- Direct PDF page jump: `inputMode="numeric"` text field with validation (`1..N` exact jump, clamp, alert notices on invalid input, synchronized across all navigation triggers).
- Regression coverage: `src/TocPanel.test.tsx`, `src/pdfOutline.test.ts`, `src/pdfPageInput.test.ts`, `src/PdfReader.test.tsx`, `src/App.test.tsx` (164/164 tests passed; `tsc --noEmit` 0 errors).
- **Human Acceptance: PASS.**

**V2-M3 Reading Progress, Reflowable Reading UX & EPUB Embedded Covers (Complete — Implementation, Targeted Verification, Corrective Passes, and Human Acceptance all PASS):**
- Scope: Current-position reading progress semantics (`crates/domain/src/completion.rs`), Library progress display settings (Cumulative vs Current Read Progress), Completed Read Mark (`Read Nx` badge), free numeric typography inputs for EPUB/TXT (`src/typographyNumericInput.ts`), EPUB/TXT K/N reading-position indicators (`src/epubPageIndicator.ts`, `src/txtPageIndicator.ts`), in-app confirmation for Delete Reading Data + bulk action, and EPUB embedded cover extraction and display (`src/epubCover.ts`, `src/BookCover.tsx`).
- Regression & Targeted verification: 47/47 vitest suites (413/413 tests passed), `cargo test --workspace` (216/216 passed), `tsc --noEmit` 0 errors.
- **Human Acceptance: PASS.**

**V2-M4 PDF Reading Experience, Hyperlinks, Appearance & OCR Architecture (Complete — Implementation, Targeted Verification, and Human Acceptance all PASS):**
- Scope: PDF text highlight geometry and presentation cleanup, PDF Page Appearance modes, native internal and external hyperlinks, WASM JBIG2 runtime integration, and document-level OCR classification.
- **Highlight Presentation & TextLayer Geometry**: PDF highlights add translucent background tinting while preserving the original glyph color and contrast without washed-out text artifacts.
- **PDF Page Appearance Modes**: Added `Default`, `Day`, `Eye Care`, `Parchment`, and `Night` modes via composited overlay canvases. Embedded photo and image rects extracted from pdf.js operator streams are protected from color-filter distortion. Scanned/image-only pages in Night mode preserve the original scanned raster rather than applying destructive global pixel inversion.
- **Native PDF Hyperlinks**: Resolves internal link destinations directly to page numbers with single-click jump; detects external HTTP/HTTPS links and prompts for user confirmation before delegating to the system browser; blocks unsupported or unsafe URI schemes.
- **pdf.js WASM Runtime Integration**: Statically integrates local WASM binary decoders (`/wasm/`) into pdf.js loading configuration, resolving the blank-page rendering defect for JBIG2-encoded scanned PDF documents.
- **Document OCR Eligibility & Classification**: Upgraded naive boolean checks to document-level heuristics (`TEXT`, `SCAN`, `HYBRID`), ensuring predominantly scanned books with incidental watermark text retain OCR affordance while predominantly healthy text documents keep OCR hidden.
- **Known Source Limitation Explicitly Recorded**: Some PDFs may visually render correctly while their embedded Unicode/text mapping is intrinsically corrupted; EbookReader does not invent or heuristically reconstruct missing source Unicode in V2.
- **Human Acceptance: PASS.**

**Pre-Freeze UX Addenda (Complete — Human Acceptance PASS):**
- **Addendum A — Library Sorting & Duplicate Import Clarity**: Added compact `Sort by:` dropdown supporting 6 sort modes (`Title A → Z`, `Title Z → A`, `Recently Imported newest/oldest`, `Recently Opened newest/oldest`). Implemented deterministic multilingual sorting with numeric natural sort, English collation, and Simplified Chinese pinyin collation (`zh-CN-u-co-pinyin`) with leading punctuation normalization (`《》`, quotes, brackets). Duplicate import dialog clearly surfaces the current Library title.
- **Addendum B — PDF Reader Toolbar Re-layout**: Reorganized PDF Reader chrome into clear header identity (Row 1), reading configuration (Row 2: Document, Appearance, Geometry), and actions/tools (Row 3: Navigation, Tools) with responsive group wrapping.
- **Addendum C — PDF Page 1 Cover Thumbnails in Library**: Extended `BookCover` to render Page 1 PDF thumbnails using offscreen canvas and session-memory caching. Features `IntersectionObserver` visibility-gated lazy loading, bounded concurrency queue (`MAX_CONCURRENT_PDF_COVERS = 2`), in-flight deduplication, and format placeholder fallback.

**V2-M5 Hardening Product Scope Decision (Complete):**
- **Reading Mode Standardization**: V2 standardizes EPUB and PDF reading on validated page-based reading modes (EPUB: Single page, Double page; PDF: Single page). Selectable Continuous Scroll is deferred to V3 as a separately scoped reading experience. Native TXT scrolling remains unaffected.
- **Production Cleanup**: Removed selectable continuous reading mode from EPUB (`scrolled`) and PDF (`continuous`), cleaned up obsolete toolbar selectors, and added backward-compatible fallback normalization for legacy persisted modes.

**V2-M6 Regression & Manual Acceptance (Complete — R3 Gate PASS):**
- **Risk-Based Regression Matrix & Automated Sweep (R1)**: Reconciled cumulative human and automated evidence across Areas A–N; verified domain/storage regression coverage and source/build-level runtime dependency closure (packaged-runtime closure remains an RC verification item).
- **Pre-R3 Contents / TOC Dynamic Bulk Toggle Addendum**: Integrated dynamic `Expand all` / `Collapse all` compact boxed icons into the shared `TocPanel` component header for EPUB and PDF readers with real-time recalculation across single-node and mixed-state toggles (Human Accepted).
- **Cumulative Manual Acceptance Reconciliation (R2)**: Reconciled human acceptance across all 14 core workflows; zero manual-only evidence gaps remain.
- **Final Automated Gate (R3)**: 100% green across all 54 test files (500 passed), TypeScript typecheck (0 errors), production frontend build, and Rust workspace tests (216 passed).

**V2 Release Governance & Publication (Complete — RELEASED):**
- **Release Identity Finalization (RC-1B)**: Upgraded release identity consistently to **2.0.0** across all package manifests, Tauri configuration, Cargo metadata, Update Awareness, OCR pack builder, tests, and documentation.
- **Candidate Build & Runtime Closure (RC-2)**: Verified 100% PE import dependency closure; statically bundled WASM runtime decoders (JBIG2, OpenJPEG, QCMS) and CMap character maps into production output without external network dependencies.
- **Clean Windows Packaged Acceptance (RC-3)**: Human PASS across clean Windows 11 VM testing for Core installation, dual launches, format smoke (EPUB, PDF, TXT), Core-only OCR degraded state, and Optional OCR Pack auto-discovery, inference, and persistence.
- **Release Verification & Publication (RC-4)**: PR #7 merged into `main` (`e235562fa0cd9c9e201fad95072049cb36e4e34a`), Git tag `v2.0.0` pushed, and GitHub Release `v2.0.0` officially published with verified candidate artifacts.
- **Verified release artifacts, exact file sizes, and SHA256 checksums**:
  - Core NSIS Installer: `EbookReader_2.0.0_x64-setup.exe` (6,639,883 bytes, SHA256: `B341C835678055088866BE0302FBF063255B04552013ADEC7F27B2A4C6B5F003`)
  - Core MSI Installer: `EbookReader_2.0.0_x64_en-US.msi` (8,171,520 bytes, SHA256: `318FD76E78B59D830A427141CAE1257EF974BBED21921F5543FF4DAEF65D81D5`)
  - Optional OCR Pack: `EbookReader_OCR_Pack_2.0.0_x64-setup.exe` (59,219,745 bytes, SHA256: `04D9E6CBA87F10718BDDE8C77F1984541C3FA941958A82016BC5C5E99D6E0611`)

**Automated Verification State (on `main` Baseline):**
- Frontend unit & integration tests `npm test`: 54 test files, 500 passed; 0 failed.
- TypeScript typecheck `npm run typecheck`: 0 errors.
- Production frontend build `npm run build`: Succeeded.
- Rust workspace tests `cargo test --workspace`: 216 passed; 0 failed.
- Full automated gate passed on the released V2.0.0 baseline.

---

## Lifecycle Snapshot

- **Current Milestone**: V2-M1 Complete, V2-M2 Complete, V2-M3 Complete, V2-M4 Complete, Pre-Freeze UX Addenda A/B/C Complete, V2-M5 Product Hardening Complete, V2-M6 Regression & Manual Acceptance Complete (R3 Gate: PASS); V2 RC Preparation (RC-1B, RC-2, RC-3 Complete); V2.0.0 Released (Official Release Complete).
- **Current Checkpoint**: `V2_PORTFOLIO_PACKAGING_COMPLETE_WORKSPACE_CLEANUP_ENTRY`.
- **Current Branch / PR**: `main` after V2 Portfolio Packaging merge.
- **Current Blockers**: None.
- **Current Escalations**: None.
- **Architecture State**: **Accepted V2 Architecture Baseline** (Incorporates EPUB typography overrides, PDF WASM decoders, Page Appearance compositing, Document OCR classification, lazy PDF cover thumbnails, standardized page-based reading modes, and dynamic TOC bulk expand/collapse).
- **Feature Complete (V2)**: **Complete** — All planned V2 feature milestones (M1–M4), Addenda (A–C), Hardening scope corrections, Regression validation, Packaged Acceptance, and Release Publication have been executed.
- **Feature Freeze (V2 Scope)**: **ACTIVE / FROZEN**.
- **V2 Product Hardening**: **Complete** (Hardening Exit Gate: PASS).
- **V2 Regression & Manual Acceptance**: **Complete** (R3 Closeout Gate: PASS).
- **V2 Packaged Acceptance**: **Complete** (RC-3 Clean Windows Packaged Acceptance: PASS).
- **Release Identity**: **v2.0.0 Officially Released** (Git tag `v2.0.0`, GitHub Release `v2.0.0`).
- **RC / Release State**: `v2.0.0` officially published on `main`.
- **Next Action**: **Local Workspace Cleanup.**


