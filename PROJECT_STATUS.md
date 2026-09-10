# EbookReader Project Status

Last Updated: 2026-09-10 (Post-UI Residual 2 — CLOSED / HUMAN-PASSED)

Current Phase: **Post-UI Engineering Residual Resolution — Residual 2 Closed / Human-Passed; Next: Bilingual Manual-QA Fixture Prep**. C0/C1/C2 B1–B8 Canonical UI Migration is human-PASSed; Post-UI residual resolution is in progress:
1. B1–B8 Canonical UI Migration: Complete & Human-Accepted (PASS, commit `2b7724a`)
2. Post-UI Residual 1: PDF Open Performance Optimization & Warm-Reopen Fix (CLOSED / HUMAN-PASSED, commits `114d3d0` and `37f6f19`)
3. Post-UI Residual 1.5: Reader UX & Search Closure (CLOSED / HUMAN-PASSED, commits `a35f7b2`, `2de96ca`, `95a9a27`, and `f3b5083`)
4. Post-UI Residual 2: OCR Engine Compatibility & Workspace UX Convergence (CLOSED / HUMAN-PASSED — commits `996b780`, `94fbf08`, and `59902a2`)
5. Required Pre-Freeze Follow-Up: Bilingual Manual-QA Fixture Prep (Next Activity — scheduled before Human Feature Freeze; must provide deterministic paired books, valid Alignment Package, and expected-result instructions)

**Post-UI Residual 2 — OCR Compatibility & Workspace UX Summary (CLOSED / HUMAN-PASSED — 2026-09-10):**
- **Phase 1: Adaptive Target-Resolution Rasterization Policy (`ocrScaleUtils.ts`, `ocrScaleUtils.test.ts`, `OcrWorkspace.tsx` — merged `996b780`)**:
  - Replaced hardcoded rasterization scale `1.2` with `calculateOcrRenderScale` targeting ~250 DPI / minimum shorter side 1200px (scale ~3.4722 for pocket PDF 《小说机杼》), preventing character stroke collision and achieving high-fidelity OCR text extraction.
- **Phase 1.5: OCR Workspace UX Convergence (`OcrWorkspace.tsx`, `PdfReader.tsx`, `App.css`, `OcrWorkspace.test.tsx`, `PdfReader.test.tsx` — merged `94fbf08`, layout fix `59902a2`)**:
  - **Eliminated Competing In-Reader Context**: Removed inline raw OCR text dumping (`ocrTextRef`), inline textarea editing (`ocrEditing`), and duplicate `run_ocr_command` buttons from `PdfReader.tsx`.
  - **Restrained Reader Affordance**: Surfaced a clean, compact Scanned-PDF notice indicating degraded state and OCR availability with a direct "Open OCR Workspace" action.
  - **Side-by-Side OCR Workspace Layout (`ER-OCR-001`)**: Re-architected `OcrWorkspace.tsx` so the rendered source PDF page remains the primary visual reference on the left pane while OCR recognized text, character count, and the correction editor are presented in the adjacent right pane, eliminating vertical hunting. Multi-page navigation is supported via page controls and a compact thumbnail strip.
  - **Layout Constraints Fix**: Enforced `position: fixed; inset: 0`, `min-width: 0`, and `grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)` so large PDF canvases cannot expand the source pane beyond 50% width and push the recognized text editor offscreen.
  - **Preserved Core Capabilities**: Kept text selection, search indexing, annotations, saved corrections, degraded-state truth, lazy OCR, and all existing OCR results intact.
  - **Human Retest Outcome**: PASS. Native Tauri retest verified both recognition quality on scanned PDF pages and side-by-side workspace interaction.
- **Verification**:
  - 35 test files / 251 tests passing (`cmd /c npm test -- --run`) including new interaction tests in `src/OcrWorkspace.test.tsx` and `src/PdfReader.test.tsx`.
  - Rust domain test suite: 193 unit & integration tests passing (`cmd /c cargo test --package ebookreader-domain`).
  - TypeScript typecheck: 0 errors (`cmd /c npm run typecheck`).

Current Milestone: M1 — **Complete**, `94aff83`; M2 — **Complete**, `0a04fb4`; M3 — **Complete**, `096b90d` + durability test; M4 — **Complete**, `7f12173`; M5 — **Complete**, `67d32c5`; M6 — **Complete**, `9e99099`; M7 — **Complete**, `4d86045`; M8 — **Complete**, `2b81d54`. Full Exit Gate evidence for every Milestone is in `ROADMAP.md`.
Current Checkpoint / Promotion Unit: **Post-UI Residual 2 Closed / Human-Passed (Next: Bilingual Manual-QA Fixture Prep)**.
Current Branch / PR: `main`
Current Blockers: None.
Open Escalations: None.
Architecture State: **Accepted Architecture Baseline**.
Feature Complete: Second candidate produced (`ebe33f6`); Human Acceptance corrective loop closed (`HUMAN_ACCEPTANCE_DEFECT_REGISTER.md` 11/11 closed).
Feature Freeze: Unapproved (Post-UI engineering residuals & QA fixture prep pending completion; M9 unstarted).
RC / Release State: Not started.
Next Action: Bilingual Manual-QA Fixture Prep (Required pre-Freeze follow-up: prepare deterministic paired books, valid Alignment Package, and expected-result instructions).







