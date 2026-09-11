# EbookReader Project Status

Last Updated: 2026-09-11 (Native Human Acceptance Corrective Pass Implemented)

Current Phase: **Native Human Acceptance Corrective Pass Implemented — Awaiting Targeted Native Human Retest**. Full Automated Regression had passed before native testing exposed three frozen-V1 defects. Human Feature Freeze remains **APPROVED**, V1 scope remains locked, M9 Product Hardening is complete, and M10 / RC / Windows Release has **not** started.

**Feature Freeze Decision Summary:**
- The Human Feature Freeze Gate has been explicitly approved by the user after the Feature Complete Candidate #2 corrective pass and subsequent native Tauri acceptance.
- Native acceptance passed for Highlight lifecycle, Collections management, Library multi-select, Bilingual Alignment management, and Book Hours smoke coverage.
- The known native layout/form overlap and card/button overflow behavior is carried forward into M9 Product Hardening as a release-readiness defect to audit and fix inside the frozen V1 scope.
- No new features, workflow redesigns, Feature Freeze scope expansion, RC promotion, or M10 packaging work is authorized by this status transition.

**M9 Product Hardening Summary:**
- Bounded release-blocker audit followed `ROADMAP.md` M9 scope. Earliest-wrong-layer attribution for the known native layout/form overlap and card/button overflow issue: shared CSS layout contracts, not domain or feature wiring, lacked a systemic viewport containment rule for compact native windows.
- Fixed the release-blocking layout family without redesigning accepted workflows: interactive controls are max-width bounded, long labels/titles can break safely, shell/reader/action toolbars wrap, modals and the Library bulk-action bar stay within the visible viewport, and fixed two-column Settings / Book Hours form rows collapse to one column on constrained widths.
- Added focused CSS-source regression coverage in `src/App.theme.test.ts` to keep the M9 viewport/overflow contract from regressing.
- Reviewed correctness/data integrity, migrations/partial writes, relink/orphan handling, ReadingSession shutdown, Highlight/Alignment durability, OCR correction durability, Backup/Restore, empty/loading/error/degraded states, keyboard/focus, Light/Dark contrast, performance/memory, privacy, dependency/license hygiene, and font redistribution boundaries through existing source/tests plus the new focused regression. No additional release blocker was found inside the frozen V1 scope.

**Pre-Freeze Systemic UX Hardening Summary:**
- **Persistent Highlights Stable Identity**:
  - Attached stable `ReadingAsset.id` to DOM nodes (`data-asset-id`) across EPUB (`Reader.tsx`), PDF (`PdfReader.tsx`), and TXT (`TxtReader.tsx`) readers on both creation and rehydration.
  - Recolor and deletion operate strictly by asset ID (`update_reading_asset_anchor_command`, `delete_reading_asset_command`) rather than fuzzy text matches; orphaned assets are safely excluded from reader rehydration.
- **Library Multi-Select & Soft Removal**:
  - Library multi-select mode with floating bulk action bar.
  - Bulk "Remove from Library" strictly invokes existing soft removal semantics (`remove_book_command` / `library_status = 'removed'`), preserving book rows, bindings, reading progress, notes/highlights, Book Hours, alignment data, and source files on disk with zero hard deletion.
  - Bulk "Add to Collection" dialog supporting multi-book categorization in one step.
- **Collections Management IA**:
  - Clean filter chips without fragile hover delete buttons in Library toolbar.
  - Dedicated "Manage Collections" modal with collection creation, inline renaming, and safe deletion confirmation dialog explaining book/data preservation.
- **Bilingual Alignment Visibility & Management in Data Center**:
  - Added Bilingual Alignments card in `DataRecovery.tsx` displaying aggregate alignment statistics, package summary table (clean 1:1 vs review mapping counts), package import, direct bilingual reading launcher, and safe unpair confirmation modal.
  - Eliminated singular `LIMIT 1` assumption across backend and frontend; added `list_alignment_packages_for_book_command` and `get_alignment_package_by_id_command` for truthful plural alignment handling.
- **Systemic Layout & UX Polish**:
  - Sticky top header in `BookDetails.tsx`.
  - Viewport-constrained scrollable modals with fixed headers and action footers.

**Book Hours V1 Redesign & Core Systems Status:**
- Reading Profiles CRUD (Tab 5) & Formula Defaults (Tab 6) fully integrated.
- Book Details deep-linking into Data → Book Hours Planning consumed as a one-shot intent.
- All unit-default dependencies strictly bound to IPC data without synthetic defaults.

**Test Validation:**
- Focused M9 regression `npm test -- --run src/App.theme.test.ts`: 10 passed; 0 failed.
- Frontend unit tests `npm test`: 36 test files, 285 passed; 0 failed.
- TypeScript typecheck `npm run typecheck`: 0 errors.
- Rust workspace tests `cargo test`: 216 passed, 2 ignored; 0 failed.
- Production frontend build `npm run build`: passed. Vite emitted the existing >500 kB chunk-size warning for the main bundle.
- Tauri/Rust release build `cargo build --manifest-path src-tauri\Cargo.toml --release`: passed on the local GNU toolchain after elevated execution, with the existing non-fatal `.rsrc merge failure: multiple non-default manifests` linker warning.
- Production Tauri bundle build `npm run tauri build`: passed; generated MSI and NSIS bundles locally. This was a build check only, not RC promotion.

**Full Automated Regression (2026-09-11):**
- `npm test`: passed, 36 test files, 285 tests.
- `npm run typecheck`: passed.
- `cargo test`: passed under elevated local execution, 216 passed, 2 ignored, doc-tests passed. The non-elevated sandbox run still fails at Windows test-binary execution with `0xc0000022`, while the identical elevated command and CI Windows runner pass; this is attributed to the local execution environment, not a product test failure.
- `npm run build`: passed. Vite emitted the existing main-bundle >500 kB warning.
- `cargo build --manifest-path src-tauri\Cargo.toml --release`: passed. The local GNU toolchain emitted the existing non-fatal `.rsrc merge failure: multiple non-default manifests` linker warning.
- `npm run tauri build`: passed; generated local MSI and NSIS bundles as a build check only. M10 / RC packaging has not started.

**Native Human Acceptance Corrective Pass (2026-09-11):**
- Reflowable typography: EPUB Line Height now overrides representative publisher paragraph/list/blockquote rules at the rendered-document stylesheet boundary while leaving ruby, superscript/subscript, tables, and code/preformatted structures outside the override. TXT continues to use the same persisted typography model through its existing native style mapping.
- PDF reader: replaced fixed-scale rendering with shared zoom state for single-page and continuous modes; added Zoom Out/In, visible percentage, Fit Page, Fit Width, guarded Left/Right navigation, and protected continuous-mode location/progress from intermediate programmatic-scroll events. The initial 120% visual baseline is preserved.
- Book Hours Planning: corrected the shell to three explicit rows (header, six-tab navigation, content viewport); the shell owns clipping and only the content viewport scrolls.
- Focused corrective regression: 42 tests passed across typography, PDF reader, Book Hours behavior, and Book Hours CSS structure.
- Full post-correction verification: `npm test` passed (37 files, 293 tests); `npm run typecheck` passed; `cargo test` passed (216 passed, 2 ignored, doc-tests passed); `npm run build` passed with the existing main-bundle size warning.

**Targeted Native Human Retest Checklist:**
1. EPUB/TXT typography: in a real EPUB whose paragraphs define their own line height, move Line Height across clearly different values and confirm ordinary prose changes while ruby, super/subscript, tables, and code/preformatted content remain structurally readable; confirm TXT line height still responds.
2. PDF: in both Single Page and Continuous Scroll, verify Zoom Out/In, percentage, Fit Page, Fit Width, canvas/text-layer alignment, Left/Right adjacent-page navigation, ignored shortcuts while a control or overlay has focus, and correct reopen location/progress.
3. Book Hours Planning: at normal and constrained native window sizes, visit Overview, By Profile, By Collection, Books, Profiles, and Formula & Defaults; confirm the header and all six tabs remain visible and only content scrolls without overlap or clipping.

Current Milestone: M1 — **Complete**, `94aff83`; M2 — **Complete**, `0a04fb4`; M3 — **Complete**, `096b90d` + durability test; M4 — **Complete**, `7f12173`; M5 — **Complete**, `67d32c5`; M6 — **Complete**, `9e99099`; M7 — **Complete**, `4d86045`; M8 — **Complete**, `2b81d54`. Full Exit Gate evidence for every Milestone is in `ROADMAP.md`.
Current Checkpoint / Promotion Unit: **Native Human Acceptance Corrective Pass Implemented → Awaiting Targeted Native Human Retest**.
Current Branch / PR: `main`
Current Blockers: No known implementation blocker; targeted native human retest is pending.
Current Escalations: None.
Architecture State: **Accepted Architecture Baseline (Updated for Pre-Freeze UX Hardening & Book Hours V1 Redesign)**.
Feature Complete: Complete; Candidate #2 accepted through the Human Feature Freeze Gate.
Feature Freeze: **Approved by human decision on 2026-09-11. V1 scope locked.**
RC / Release State: Not started.
Next Action: HARD STOP for targeted native Human Acceptance using the three-item checklist above. Do not start M10 / RC without explicit authorization.






