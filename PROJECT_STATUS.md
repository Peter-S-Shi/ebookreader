# EbookReader Project Status

Last Updated: 2026-09-10 (Human Acceptance corrective loop closed)

Current Phase: **Canonical UI Migration — C2 Batch 1 Complete (Awaiting Native-Tauri Human Checkpoint)**. The C0 Migration Study and C1 Migration Plan established the approved roadmap. C2 Batch 1 (Foundation: Desktop Shell, Design Tokens, Shared Surface Baseline) has reconstructed the management shell into the frozen V1 desktop composition (`DESIGN.md`, `docs/design/EbookReader_UI_Prototype_v0_5.html`) with a 94px persistent left rail, 74px topbar with active destination title and search, shared main/content grid, semantic design tokens, and preserved theme contract. All 26 test files (220 tests), TypeScript typecheck, and Vite production build pass cleanly.

**Canonical UI Migration — C2 Batch 1 (2026-09-10):**
- Reconstructed management shell into 2-column desktop grid: Left Rail (`.rail` 94px with "ER" brand and 5 canonical destinations: Library, Notes, Calendar, Data, Settings) + Topbar (`.top` 74px with destination title & search) + Main Viewport (`.main`) + Content scroll region (`.content`).
- Established semantic design tokens (`--bg`, `--surface`, `--surface2`, `--text`, `--muted`, `--border`, `--accent`, `--accentSoft`, `--shadow`, etc.) in `src/App.css` while strictly preserving contextual surface tokens (`--contextual-surface-bg`, `--contextual-surface-fg`, `--contextual-surface-border`) for `HA-009`/`HA-010` theme integrity.
- Foundation-only: preserved all routing, commands, data semantics, search indexing, and existing production behavior.
- Added regression test suite in `src/App.shell.test.tsx` (Left rail brand, 5 destinations with `aria-current="page"`, active topbar title, destination switching).
- Full verification: 26 test files / 220 tests green (`npm test`), `npm run typecheck` 0 errors, `npm run build` success.

Current Milestone: M1 — **Complete**, `94aff83`; M2 — **Complete**, `0a04fb4`; M3 — **Complete**, `096b90d` + durability test; M4 — **Complete**, `7f12173`; M5 — **Complete**, `67d32c5`; M6 — **Complete**, `9e99099`; M7 — **Complete**, `4d86045`; M8 — **Complete**, `2b81d54`. Full Exit Gate evidence for every Milestone is in `ROADMAP.md`.
Current Checkpoint / Promotion Unit: **Canonical UI Migration C2 Batch 1 Human Checkpoint**. Awaiting native-Tauri human visual check of the reconstructed desktop shell and token system before starting C2 Batch 2 (Management Surfaces Migration).
Current Branch / PR: `main`
Current Blockers: None.
Open Escalations: None.
Architecture State: **Accepted Architecture Baseline**.
Feature Complete: Second candidate produced (`ebe33f6`); Human Acceptance corrective loop closed (`HUMAN_ACCEPTANCE_DEFECT_REGISTER.md` 11/11 closed).
Feature Freeze: No — UI migration in progress.
RC / Release State: Not started.
Next Action: **STOP for Native-Tauri human visual checkpoint.** Validate Desktop Shell and theme behavior in running Tauri app before proceeding to C2 Batch 2 (Management Surfaces Migration).

