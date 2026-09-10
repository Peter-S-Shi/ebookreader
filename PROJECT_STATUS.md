# EbookReader Project Status

Last Updated: 2026-09-10 (B5 Corrective Reconstruction Complete — Awaiting Native-Tauri Human Visual Checkpoint)

Current Phase: **Canonical UI Migration — C2 Management Surfaces Corrected (B1–B5)**. The C0 Migration Study and C1 Migration Plan established the approved roadmap:
1. B1 Foundation: Desktop Shell, Design Tokens, Shared Surface Baseline (Complete, commit `7f64ea2`, human-PASSed)
2. B2 Settings & Appearance (`ER-SET-001`) (Corrected with canonical 2-column `settingsLayout` & persistent subnav)
3. B3 Data / Recovery (`ER-DATA-001`) (Corrected with canonical `dataAside` Recovery Status composition)
4. B4 Global Notes & Calendar (`ER-NOTES-001`, `ER-CAL-001`) (Corrected with canonical Global Notes Library hierarchy & hint formatting)
5. B5 Library & Book Grid (`ER-LIB-001`) (Complete, commit `2e815a6`)
6. B6 Book Details / OCR / Bilingual (`ER-BOOK-001`, `ER-OCR-001`, `ER-BI-001`) (Next up after human checkpoint)
7. B7 Protected Reader Zone (`ER-READER-001`, `ER-FOCUS-001`, `ER-TYPE-001`)
8. B8 Motion / Sound / Final Convergence

**Canonical UI Migration — C2 Management Surfaces Corrective Alignment (2026-09-10):**
- **Settings (`ER-SET-001`)**: Replaced vertically stacked all-sections page with canonical 2-column `settingsLayout` & persistent secondary `settingsSubnav` (Appearance, Reading, Typography, Sound & Motion, Files & Data, About & Updates), showing only the selected subnav item's `settingsPane` in main viewport while preserving 100% of settings state and persistence.
- **Data & Recovery (`ER-DATA-001`)**: Resolved right-hand panel overflow/compressed defect in `dataAside` by reconstructing it to canonical Recovery Status composition (`.backupStatus`, `.backupMini` for App Data & Full Library backups, automatic recovery snapshot, `.snapshotTimeline` for recent snapshots, and `.safetyNote`), preserving real production data authority.
- **Global Notes (`ER-NOTES-001`) & Calendar (`ER-CAL-001`)**: Restored canonical Global Notes Library section title and hint formatting (`Notes · Excerpts · Annotations`); cleaned up Calendar hint classes.
- **Verification**: All 30 test files / 225 unit & integration tests green; TypeScript typecheck 0 errors; Vite production build success.

Current Milestone: M1 — **Complete**, `94aff83`; M2 — **Complete**, `0a04fb4`; M3 — **Complete**, `096b90d` + durability test; M4 — **Complete**, `7f12173`; M5 — **Complete**, `67d32c5`; M6 — **Complete**, `9e99099`; M7 — **Complete**, `4d86045`; M8 — **Complete**, `2b81d54`. Full Exit Gate evidence for every Milestone is in `ROADMAP.md`.
Current Checkpoint / Promotion Unit: **Canonical UI Migration — B5 Corrective Reconstruction Complete (Awaiting Native-Tauri Human Visual Checkpoint)**.
Current Branch / PR: `main`
Current Blockers: None.
Open Escalations: None.
Architecture State: **Accepted Architecture Baseline**.
Feature Complete: Second candidate produced (`ebe33f6`); Human Acceptance corrective loop closed (`HUMAN_ACCEPTANCE_DEFECT_REGISTER.md` 11/11 closed).
Feature Freeze: No — UI migration in progress.
RC / Release State: Not started.
Next Action: HARD STOP for Native-Tauri human visual checkpoint on corrected management surfaces (B1–B5) before beginning B6 (Book Details / OCR / Bilingual).
