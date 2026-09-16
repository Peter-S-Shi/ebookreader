# EbookReader Project Status

Last Updated: 2026-09-16 (V2 Active — V2-M1 Complete, V2-M2 Complete, V2-M3 Complete on long-lived V2 branch)

Current Phase: **V2 Development — V2-M1 Complete, V2-M2 Complete, V2-M3 Complete**. V1.0.0 remains released and its V1 scope stays locked (see V1 Feature Freeze Decision Summary below, retained for history); the Human Feature Freeze Gate's requirement of explicit user authorization before further work was satisfied on 2026-09-15, formally opening V2. V2-M1 (EPUB Reader Preference Override Compatibility), V2-M2 (Reader Navigation & Reliability), and V2-M3 (Reading Progress, Reflowable Reading UX & EPUB Embedded Covers) are now fully complete on the long-lived branch (`v2-m1/epub-preference-override-compat`); nothing V2 is in `main` yet. All implementation, targeted verification, corrective passes, and human acceptance for M1-M3 have passed.

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

**Full Automated Regression Verification:**
- Frontend unit tests `npm test`: 38 test files, 308 passed; 0 failed.
- TypeScript typecheck `npm run typecheck`: 0 errors.
- Rust workspace tests `cargo test --workspace` + `cargo test -p ebookreader`: 219 passed, 2 ignored; 0 failed.
- PE runtime dependency closure `node tooling/audit_runtime_closure.mjs`: 100% closure verified (0 unresolved DLLs).
- Production frontend build `npm run build`: passed.
- Production Tauri release build `npm run tauri build`: passed.

**V2-M1 EPUB Reader Preference Override Compatibility (Complete — Implementation, Targeted Verification, and Human A/B Retest all PASS):**
- Scope: Diagnose and correctly fix reader typography preferences (font size, page width, margins) becoming unresponsive against certain publisher EPUB CSS. No other V2 area in scope for M1.
- Evidence used: `tests/fixtures/private/epub-v2-compat/control-editable.epub` (real known-good), `tests/fixtures/private/epub-v2-compat/case-publisher-locked.epub` (real known-failing). Both are gitignored via a tracked `/tests/fixtures/private/` rule added to `.gitignore` in this milestone (previously only locally excluded via untracked `.git/info/exclude`); confirmed still ignored via `git check-ignore -v` before any staging. Never committed, pushed, attached, or excerpted into tracked docs.
- Root cause (confirmed via differential diagnosis of both EPUBs' OPF/CSS/XHTML): the failing book's publisher stylesheet applies a class directly to `<body>` (a Calibre-export convention: `<body class="calibre">`, with `.calibre { font-size: 1em; padding-left: 0; padding-right: 0; margin: 0 5pt; }`). A class selector has higher CSS specificity than the app's plain `body { ... }` typography-override rule, so the publisher's class won the cascade for font-size, margin, and padding regardless of rule order -- not an inheritance problem, a specificity problem, and not limited to font-size.
- `441ce2f` (withdrawn recovery-branch patch, not merged into `main`; used only as evidence, not cherry-picked) audited and found only partially correct:
  - It happened to make font-size respond for *this specific* failing book, but only because that book's paragraphs have no explicit font-size of their own -- a `:where(p,...)` rule with zero CSS specificity is still enough to beat pure inheritance in that one case. It would **not** hold against a publisher class applied directly to a paragraph (verified false: a synthetic `<p class="publisher-para">` with its own `font-size` fully blocks the un-important, zero-specificity rule).
  - It never touched the `body`-level rule at all, so the margin/page-width freeze against `.calibre`-style body classes was **left completely unfixed** -- confirmed against the real failing book's extracted CSS (`marginLeft: 6.66667px` instead of `auto`, `paddingLeft: 0px` instead of the configured percent, pre-fix).
  - Its own trailing `!important` (`` `${rules.join("; ")} !important; }` ``) binds, per CSS grammar, only to the *last* joined declaration -- confirmed empirically. With no chosen font, that accidentally protected `line-height` only; whenever a reader font is also chosen, `font-family` becomes the trailing declaration and `line-height`'s protection silently disappears, a real regression its own added test did not catch (the test's regex only checked that `!important` appears anywhere in the rule block, not that it binds to the property under test).
  - Its `font-size: X%` on the shared `:where(p, li, dd, dt, blockquote)` selector recompounds for prose nested in prose (e.g. a quoted `<p>` inside a `<blockquote>`, which is present in the real control-editable.epub fixture) -- confirmed empirically: a 160% setting computed to 40.96px for the nested paragraph vs. 25.6px for an equivalent non-nested one.
- Implemented fix (`src/typography.ts`): every reader-controlled `body` rule declaration (font-size, line-height, max-width, margins, padding, font-family) now carries its own `!important`, matching the precedent already established for dark-mode color (HA-007) -- this is the actual fix for the margin/page-width symptom, not just font-size. The prose-selector rule gives each declaration its own explicit `!important` (fixing the trailing-only-important bug) and expresses font-size in root-relative `rem` instead of parent-relative `%` (eliminating the nested-compounding bug) rather than percent.
- Regression mechanism now covered by public, synthetic, CI-safe unit tests in `src/typography.test.ts` (no private EPUB dependency), each tied to a specific piece of evidence: a publisher class applied to `<body>` itself (mirrors case-publisher-locked.epub's real `.calibre` class), nested prose `<blockquote><p>` not compounding (mirrors a real structure in control-editable.epub), and a chosen font-family plus a line-height override both winning together (regression test for the concrete 441ce2f trailing-`!important` defect found during the patch audit).
- Targeted verification: `npx vitest run src/typography.test.ts src/Reader.test.tsx` (39/39 passed) and `npx tsc --noEmit` (0 errors). Also manually verified (local-only, not committed) against the real failing book's extracted CSS: font-size, margin, and padding all now respond correctly.
- **Human A/B Retest: PASS.** The original failing EPUB now responds correctly, the known-good control EPUB remains correct, and additional previously unseen English and Chinese EPUBs were also tested successfully across font size, line height, page width/margins, and font-family behavior.
- Verified by GitHub Actions CI (full frontend + Windows Rust promotion gate) on PR #6, which was then closed without merging so V2-M1 could be folded into the same long-lived branch as subsequent V2 milestones instead of landing in `main` on its own; the fix exists only on `v2-m1/epub-preference-override-compat`, not yet in `main`.
- **V2-M1 Verdict: Complete** (implementation/verification/CI/human retest all PASS; not yet merged to `main`).

**V2-M2 Reader Navigation & Reliability (Complete — Implementation, Targeted Verification, and Human Acceptance all PASS, including the page-jump addendum):**
- Scope: hierarchical Contents collapse/expand, native PDF bookmarks in the same shared Contents UI, a Light/Dark theme startup-persistence bug, a Remove-from-Library confirmation bug, plus a small addendum (direct PDF page jump). No Book Hours, OCR, Notes, Authoring, or packaging work.
- **Hierarchical Contents collapse/expand** (`src/TocPanel.tsx`): parent entries with children get a `▾`/`▸` toggle separate from the navigable label button; expanded by default so no existing reader loses visibility of anything already visible; real parent/child hierarchy preserved, not flattened.
- **Native PDF bookmarks → Contents** (new `src/pdfOutline.ts` + `src/PdfReader.tsx`): pdf.js's `getOutline()` converted to the same `TocItem[]` shape EPUB already uses, feeding the same `TocPanel` -- no PDF-through-EPUB navigation path; PDF bookmark clicks stay PDF-native (`setViewMode("single"); setPageNumber(page)`, mirroring the existing NotebookPanel jump pattern). The Contents button is hidden entirely for a PDF with no usable outline. Human-verified against the 3 real private PDF samples in `tests/fixtures/private/pdf label trial/` (never committed).
- **Light theme persistence bug (real, confirmed, fixed):** `loadAndApplyAppearance()` was only ever called from Settings' own mount effect, never from `App.tsx`'s own startup, so an explicit Light/Dark choice was not honored until the user happened to visit Settings that session -- exactly the "exits in Light, reopens in Dark" symptom. Fixed by calling it at `App.tsx` startup, mirroring the existing Reduced-Motion precedent. Human-verified: Light -> restart -> Light, Dark -> restart -> Dark.
- **Remove from Library confirmation (real runtime bug found and fixed, not a redesign):** a human check in the running dev app confirmed `window.confirm()` silently does nothing in this Tauri/WebView2 build -- clicking Remove deleted the book instantly with no prompt at all -- despite passing unit tests, because those tests mock `window.confirm` and can't observe the real webview's behavior. Replaced with the same in-app modal dialog pattern already used for bulk-remove. `deleteReadingData`/`deleteManagedCopyFile` have the identical latent bug but are out of this milestone's stated scope; flagged separately as follow-up work, not fixed here.
- **Addendum: direct PDF page jump** (new `src/pdfPageInput.ts` + `src/PdfReader.tsx`): the current-page portion of "Page N of M" is now an editable `inputMode="numeric"` text field (own validation, not browser-native number-input validity). Contract: integer `1..N` jumps exactly; `0` normalizes to `1`; `> N` clamps to `N`; leading zeros normalize away; decimals/negatives/letters/symbols show an inline `role="alert"` warning (no `window.alert`) and do not navigate; an empty submission silently restores the real current page. The field stays synchronized with `pageNumber` regardless of which path changed it (Previous/Next, a bookmark jump, continuous-scroll tracking), since all of them funnel through the same state. Human-verified PASS in the running app.
- Regression coverage: `src/TocPanel.test.tsx`, `src/pdfOutline.test.ts`, `src/pdfPageInput.test.ts`, `src/PdfReader.test.tsx`, `src/App.test.tsx` -- all synthetic/CI-safe, no private-fixture dependency in any tracked test.
- Targeted verification: 164/164 relevant tests passed across all touched files; `npx tsc --noEmit` 0 errors. Full frontend/Rust CI not run repeatedly during this milestone's dev loop, per instruction; deferred to PR time.
- **V2-M2 Verdict: Complete.** Not yet a PR.

**V2-M3 Reading Progress, Reflowable Reading UX & EPUB Embedded Covers (Complete — Implementation, Targeted Verification, Corrective Passes, and Human Acceptance all PASS):**
- Scope: Current-position reading progress semantics, Library progress display settings, completed read mark (Read Nx badge), free numeric typography controls for EPUB/TXT, EPUB/TXT K/N reading position indicators, in-app confirmation for Delete Reading Data + bulk action, and EPUB embedded cover extraction and display.
- **Current-position Reading Progress Semantics** (`crates/domain/src/completion.rs`): Replaced V1's monotonic "furthest point reached" active-read progress with current-position semantics (`active_pass_progress` follows current position forward or backward); `completed_read_count * 100` remains permanent, irreversible completed credit.
- **Library Progress Display Settings & Read Nx Mark** (`src/libraryProgressDisplay.ts`, `src/Settings.tsx`, `src/App.tsx`): Configurable progress mode (Cumulative Progress vs Current Read Progress) and Completed Read Mark visibility (Show vs Hide); badge renders cleanly across all card states and edge cases (never opened = 0%, completed with no active read = 100% in current read mode).
- **EPUB & TXT K/N Reading-Position Indicators** (`src/epubPageIndicator.ts`, `src/txtPageIndicator.ts`, `src/Reader.tsx`, `src/TxtReader.tsx`): Robust reading position indicator estimation displaying page / section progression cleanly without layout jitter.
- **Free Numeric Typography Controls** (`src/typographyNumericInput.ts`, `src/TypographyPanel.tsx`): Direct numeric inputs with boundaries and step validation for font size, line height, page width, and margins.
- **Delete Reading Data In-App Confirmation & Bulk Action** (`src/App.tsx`): Replaced silent failure of `window.confirm()` in WebView2 with native in-app confirmation modal for single and bulk Delete Reading Data actions.
- **EPUB Embedded-Cover Extraction & Library Display** (`src/epubCover.ts`, `src/BookCover.tsx`, `src/App.tsx`, `src/App.css`): Thin native EPUB cover extraction via existing foliate-js `book.getCover()` path. Features in-flight Promise and in-memory Object URL caching, deduplication across Continue Reading and Main Library grid, non-distorted aspect ratio (`object-fit: contain`), safe lifecycle revocation, graceful format-placeholder fallback on failure/missing/non-EPUB, and 0 DB schema migrations.
- Regression & Targeted verification: `src/epubCover.test.ts`, `src/BookCover.test.tsx`, `src/App.covers.test.tsx`, `src/libraryProgressDisplay.test.ts`, `src/epubPageIndicator.test.ts`, `src/txtPageIndicator.test.ts`, `src/typographyNumericInput.test.ts`, `src/App.test.tsx`, `src/Settings.test.tsx` all pass (47/47 vitest suites, 413/413 tests passed); `cargo test --workspace` (216/216 passed); `npm run typecheck` 0 errors.
- **Human Acceptance: PASS.** All M3 capabilities verified in the live desktop app.
- **V2-M3 Verdict: Complete.**

Current Milestone: M1 — **Complete**, `94aff83`; M2 — **Complete**, `0a04fb4`; M3 — **Complete**, `096b90d` + durability test; M4 — **Complete**, `7f12173`; M5 — **Complete**, `67d32c5`; M6 — **Complete**, `9e99099`; M7 — **Complete**, `4d86045`; M8 — **Complete**, `2b81d54`; M9 — **Complete**, `5ccc240`; M10 — **Complete** (M10-A Complete [HUMAN PASS], M10-B Complete [HUMAN PASS], M10-C Complete [RELEASED]); V2-M1 — **Complete**; V2-M2 — **Complete**; V2-M3 — **Complete** (all on long-lived V2 branch; not yet merged to `main`).
Current Checkpoint: **V1_0_0_RELEASED_M10_COMPLETE_PP_COMPLETE_WORKSPACE_SLIMMING_COMPLETE / V2_M1_COMPLETE_UNMERGED / V2_M2_COMPLETE_UNMERGED / V2_M3_COMPLETE_UNMERGED**.
Current Branch / PR: `v2-m1/epub-preference-override-compat` (long-lived V2 branch carrying V2-M1, V2-M2, and V2-M3; no open PR).
Current Blockers: None.
Current Escalations: None.
Architecture State: **Accepted Architecture Baseline (Updated for Pre-Freeze UX Hardening, Book Hours V1 Redesign, Optional Local OCR Pack, and V2 M1-M3 Additions)**.
Feature Complete (V1): Complete; Candidate #2 accepted through the Human Feature Freeze Gate.
Feature Freeze (V1 scope): **Approved by human decision on 2026-09-11. V1 scope remains locked; V2 is additive, opened by explicit user authorization on 2026-09-15.**
RC / Release State: **v1.0.0 Released (GitHub Release & Assets Published)**; no V2 release yet.
Portfolio Packaging State: **Complete** — public README portfolio packaging and showcase assets merged via PR #3.
Next Action: Ready for V2-M4 planning and implementation on the long-lived V2 branch.

