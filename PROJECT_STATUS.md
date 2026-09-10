# EbookReader Project Status

Last Updated: 2026-09-10 (C2 B6+B7 Corrective Pass Complete — Awaiting Human Retest for Combined Native-Tauri Human Checkpoint)

Current Phase: **Canonical UI Migration — C2 B6+B7 Corrective Pass Complete (Awaiting Human Retest)**. The C0 Migration Study and C1 Migration Plan established the approved roadmap:
1. B1 Foundation: Desktop Shell, Design Tokens, Shared Surface Baseline (Complete, commit `7f64ea2`, human-PASSed)
2. B2 Settings & Appearance (`ER-SET-001`) (Complete & Corrected, commit `7764ee2`)
3. B3 Data / Recovery (`ER-DATA-001`) (Complete & Corrected, commit `8357631`)
4. B4 Global Notes & Calendar (`ER-NOTES-001`, `ER-CAL-001`) (Complete & Corrected, commit `7764ee2`)
5. B5 Library & Book Grid (`ER-LIB-001`) (Complete & Corrected, commit `2e815a6`, human-PASSed)
6. B6 Book Details / OCR / Bilingual (`ER-BOOK-001`, `ER-OCR-001`, `ER-BI-001`) (Corrective pass complete, commit `5c587ed` + corrective, awaiting retest)
7. B7 Protected Reader Zone (`ER-READER-001`, `ER-FOCUS-001`, `ER-TYPE-001`) (Corrective pass complete, commit `2189a87` + corrective, awaiting retest)
8. B8 Motion / Sound / Final Convergence (Unstarted — awaiting human visual checkpoint approval for B6+B7)

**Canonical UI Migration — C2 B6+B7 Corrective Pass Summary (2026-09-10):**
- **Initial Native Checkpoint State**: Combined B6+B7 Native-Tauri Human Checkpoint FAILED on three real-user defects: (1) P0 PDF visual rendering race (canvas stayed blank on page 1), (2) Bilingual Reading entry button missing/unconnected in BookDetails, and (3) Highlight selection saving annotations to SQLite without rendering visible persistent highlights.
- **P0 PDF Render Fix (`PdfReader.tsx`)**: Replaced asynchronous `pdfRef.current` assignment with explicit `pdfDoc` React state so single-page and continuous render effects re-execute upon document load completion, rendering page 1 and transitioning status to `"Ready"`.
- **Bilingual Entry & Error Handling Fix (`BookDetails.tsx`, `App.tsx`)**: Connected `onOpenBilingual` prop in `BookDetails.tsx`, wired `openBilingualForBook` in `App.tsx`, and added user-facing error modal/notice when Alignment Package is missing or invalid.
- **Highlight Rendering & Rehydration (`Reader.tsx`, `TxtReader.tsx`, `PdfReader.tsx`, `App.css`)**: Added immediate DOM range wrapping with `<mark className="reader-highlight">` on selection annotation capture, added tree-walker highlight rehydration on EPUB/TXT section load and PDF textLayer render, and defined `.reader-highlight` CSS styling.
- **Verification**: All 30 test files / 225 unit & integration tests green; TypeScript typecheck 0 errors; Vite production build success.

Current Milestone: M1 — **Complete**, `94aff83`; M2 — **Complete**, `0a04fb4`; M3 — **Complete**, `096b90d` + durability test; M4 — **Complete**, `7f12173`; M5 — **Complete**, `67d32c5`; M6 — **Complete**, `9e99099`; M7 — **Complete**, `4d86045`; M8 — **Complete**, `2b81d54`. Full Exit Gate evidence for every Milestone is in `ROADMAP.md`.
Current Checkpoint / Promotion Unit: **Canonical UI Migration — C2 B6+B7 Corrective Pass Complete (Awaiting Human Retest)**.
Current Branch / PR: `main`
Current Blockers: None.
Open Escalations: None.
Architecture State: **Accepted Architecture Baseline**.
Feature Complete: Second candidate produced (`ebe33f6`); Human Acceptance corrective loop closed (`HUMAN_ACCEPTANCE_DEFECT_REGISTER.md` 11/11 closed).
Feature Freeze: Unapproved (UI migration in progress).
RC / Release State: Not started.
Next Action: HARD STOP for Combined Native-Tauri Human Retest on Book Details / OCR / Bilingual (B6) and Protected Reader Zone (B7) before beginning B8. Do not begin B8 until the user has retested the real desktop Book Details/OCR/Bilingual and Reader workflows.



