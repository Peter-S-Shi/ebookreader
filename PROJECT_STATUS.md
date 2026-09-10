# EbookReader Project Status

Last Updated: 2026-09-10 (Post-UI Residual 1.5 — CLOSED / HUMAN-PASSED)

Current Phase: **Post-UI Engineering Residual Resolution — Residual 1.5 Closed; Proceeding to Residual 2**. C0/C1/C2 B1–B8 Canonical UI Migration is human-PASSed; Post-UI residual resolution is in progress:
1. B1–B8 Canonical UI Migration: Complete & Human-Accepted (PASS, commit `2b7724a`)
2. Post-UI Residual 1: PDF Open Performance Optimization & Warm-Reopen Fix (CLOSED / HUMAN-PASSED, commits `114d3d0` and `37f6f19`)
3. Post-UI Residual 1.5: Reader UX & Search Closure (CLOSED / HUMAN-PASSED, commits `a35f7b2`, `2de96ca`, `95a9a27`, and `f3b5083`)
4. Post-UI Residual 2: OCR Engine Compatibility / Recognition Quality Investigation on Scanned PDF (Next Engineering Activity)
5. Required Pre-Freeze Follow-Up: Bilingual Manual-QA Fixture Prep (Unstarted — scheduled after Residual 2; must provide deterministic paired books, valid Alignment Package, and expected-result instructions)

**Post-UI Residual 1.5 — Reader UX & Search Closure Summary (2026-09-10 — CLOSED / HUMAN-PASSED):**
- **Global Search Defect (`App.tsx`, `App.css`, `searchUtils.ts`)**: Traced search query execution and UI rendering. Implemented `formatSearchSnippet` to extract a ~120-character centered window snippet around query matches, preventing whole-book indexed text from overrunning the Library. Styled `.search-results` into a canonical dropdown container (`position: absolute`, `380px` max-width, `380px` max-height with auto scroll). Clears search state on item click while preserving exact-jump semantics (`FC-C01`/`FC-C02`).
- **Compact In-Reader Reading Progress Affordance (`ReaderShell.tsx`, `App.css`, `Reader.tsx`, `PdfReader.tsx`, `TxtReader.tsx`)**: Added percentage readout and a restrained progress bar fill to the `ReaderShell` toolbar using canonical `useReadingProgress` state without extra persistence models.
- **Subtle Page-Turn Sound & Visual Transition (`pageTurnSound.ts`, `App.css`, `Reader.tsx`, `PdfReader.tsx`)**: Replaced harsh bandpass noise with soft paper-rustle noise decay (1000Hz lowpass, 0.035 peak gain). Added a lightweight `.page-turn-animating` horizontal slide transition for paginated reading modes; respects `prefers-reduced-motion` and `:root[data-motion="reduced"]`.
- **Active Highlight Palette & Management (`highlightUtils.ts`, `App.css`, `Reader.tsx`, `PdfReader.tsx`, `TxtReader.tsx`, `typography.ts`)**:
  - Initial implementation (`a35f7b2`): Promoted 5-color curated preset palette (`yellow`, `green`, `blue`, `purple`, `orange`) into active V1 scope.
  - EPUB & Sizing Corrective (`2de96ca`): Restored `<foliate-view>` full-container sizing (`width:100%;height:100%;display:block`) and Uint8Array BlobPart file construction.
  - Iframe Styling & Contrast Corrective (`95a9a27`): Injected highlight preset CSS declarations into EPUB document iframe (`toEpubCss`) and enhanced Dark Mode highlight contrast and selection swatch visibility (`!important`).
  - Replacement & Clear Action Corrective (`f3b5083`): Implemented single-layer highlight color replacement (updating existing `<mark>` `data-color` directly without nesting duplicate marks) and added clear/remove highlight action (`.highlight-swatch--clear` white circle with red `×`).
- **Human Retest Verdict**: PASS (User native-Tauri retest verified search dropdown, progress affordance, page-turn sound/transition, single-layer color replacement, clear swatch action, and dark mode highlight contrast).
- **Verification**: 33 test files / 236 unit & integration tests green (`searchUtils.test.ts`, `highlightUtils.test.ts`, `ReaderShell.test.tsx`, `typography.test.ts`, `Reader.test.tsx`); TypeScript typecheck 0 errors; Vite production build success.

Current Milestone: M1 — **Complete**, `94aff83`; M2 — **Complete**, `0a04fb4`; M3 — **Complete**, `096b90d` + durability test; M4 — **Complete**, `7f12173`; M5 — **Complete**, `67d32c5`; M6 — **Complete**, `9e99099`; M7 — **Complete**, `4d86045`; M8 — **Complete**, `2b81d54`. Full Exit Gate evidence for every Milestone is in `ROADMAP.md`.
Current Checkpoint / Promotion Unit: **Post-UI Residual 1.5 Closed / Human-Passed (Proceeding to Residual 2)**.
Current Branch / PR: `main`
Current Blockers: None.
Open Escalations: None.
Architecture State: **Accepted Architecture Baseline**.
Feature Complete: Second candidate produced (`ebe33f6`); Human Acceptance corrective loop closed (`HUMAN_ACCEPTANCE_DEFECT_REGISTER.md` 11/11 closed).
Feature Freeze: Unapproved (Post-UI engineering residuals pending resolution; M9 unstarted).
RC / Release State: Not started.
Next Action: Begin Post-UI Residual 2 — OCR Engine Compatibility / Recognition Quality Investigation on Scanned PDF.







