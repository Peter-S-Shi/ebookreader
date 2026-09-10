# EbookReader Project Status

Last Updated: 2026-09-10 (Post-UI Residual 2 Phase 1 — IMPLEMENTED / AWAITING HUMAN RETEST)

Current Phase: **Post-UI Engineering Residual Resolution — Residual 2 Phase 1 Implemented; Awaiting Human Retest**. C0/C1/C2 B1–B8 Canonical UI Migration is human-PASSed; Post-UI residual resolution is in progress:
1. B1–B8 Canonical UI Migration: Complete & Human-Accepted (PASS, commit `2b7724a`)
2. Post-UI Residual 1: PDF Open Performance Optimization & Warm-Reopen Fix (CLOSED / HUMAN-PASSED, commits `114d3d0` and `37f6f19`)
3. Post-UI Residual 1.5: Reader UX & Search Closure (CLOSED / HUMAN-PASSED, commits `a35f7b2`, `2de96ca`, `95a9a27`, and `f3b5083`)
4. Post-UI Residual 2: OCR Engine Compatibility / Adaptive Resolution Scaling (Phase 1 Implemented — Awaiting Native Human Retest)
5. Required Pre-Freeze Follow-Up: Bilingual Manual-QA Fixture Prep (Unstarted — scheduled after Residual 2; must provide deterministic paired books, valid Alignment Package, and expected-result instructions)

**Post-UI Residual 2 — OCR Compatibility Corrective Implementation Summary (Phase 1 — 2026-09-10):**
- **Adaptive Target-Resolution Rasterization Policy (`ocrScaleUtils.ts`, `ocrScaleUtils.test.ts`, `OcrWorkspace.tsx`)**:
  - Replaced the hardcoded rasterization scale `1.2` with `calculateOcrRenderScale`, an adaptive target-resolution calculator targeting ~250 DPI / minimum shorter page side 1200px.
  - For small pocket PDF pages (e.g. 349.44 × 566.40 pt from real scanned book 《小说机杼》), rasterization scale increases from 1.2 (~419 × 680 px, line height 5–6px) to ~3.4722 (~1213 × 1967 px, line height 14–18px), eliminating stroke collision and enabling neural recognition.
  - Imposed safety bounds (`minScale = 1.5`, `maxScale = 4.0`, `maxLongSidePx = 3000`) so oversized / architectural pages cannot allocate pathological canvases.
  - Preserved all existing PP-OCRv6 detector/classifier/recognizer pipeline, ONNX Runtime lazy loading, job persistence, search indexing, and Reader UI semantics.
- **Verification**:
  - 10 unit tests in `src/ocrScaleUtils.test.ts` covering small pocket pages, A4, US Letter, oversized A3, giant blueprints, tiny icons, landscape orientations, and custom options.
  - Full frontend test suite: 34 test files / 246 tests passing (`cmd /c npm test -- --run`).
  - Rust domain test suite: 193 unit & integration tests passing (`cmd /c cargo test --package ebookreader-domain`).
  - TypeScript typecheck: 0 errors (`cmd /c npm run typecheck`).
  - Real end-to-end OCR model verification on 《小说机杼》 Page 15 and Page 1: clean Chinese & Latin text recognition across all body lines and title/author metadata.

Current Milestone: M1 — **Complete**, `94aff83`; M2 — **Complete**, `0a04fb4`; M3 — **Complete**, `096b90d` + durability test; M4 — **Complete**, `7f12173`; M5 — **Complete**, `67d32c5`; M6 — **Complete**, `9e99099`; M7 — **Complete**, `4d86045`; M8 — **Complete**, `2b81d54`. Full Exit Gate evidence for every Milestone is in `ROADMAP.md`.
Current Checkpoint / Promotion Unit: **Post-UI Residual 2 Phase 1 Implemented (Awaiting Native-Tauri Human Retest)**.
Current Branch / PR: `fix/residual-2-ocr-adaptive-scale`
Current Blockers: None.
Open Escalations: None.
Architecture State: **Accepted Architecture Baseline**.
Feature Complete: Second candidate produced (`ebe33f6`); Human Acceptance corrective loop closed (`HUMAN_ACCEPTANCE_DEFECT_REGISTER.md` 11/11 closed).
Feature Freeze: Unapproved (Post-UI engineering residuals pending resolution; M9 unstarted).
RC / Release State: Not started.
Next Action: Await native Tauri human retest for Post-UI Residual 2 OCR recognition quality on scanned PDFs.







