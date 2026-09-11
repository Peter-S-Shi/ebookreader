# EbookReader Project Status

Last Updated: 2026-09-10 (Book Hours V1 Redesign — BH-3A Planning Frontend Foundation & Overview Complete)

Current Phase: **Pre-Freeze Book Hours V1 Redesign (BH-3A Planning Frontend Foundation & Read-Only Overview Complete — Awaiting Approval for BH-3B)**. The pre-Freeze V1 scope has been reopened for the Book Hours product amendment. Feature Freeze remains unapproved and M9 unstarted.

**Book Hours V1 Redesign — BH-3A Planning Frontend Foundation & Read-Only Overview Summary (2026-09-10):**
- **Data Workspace Book Hours Planning Entry**:
  - Added dedicated Book Hours Planning entry under Data workspace (`DataRecovery.tsx`), matching Prototype v0.6 visual hierarchy and IA.
  - Seamless navigation between Data and Book Hours Planning screen with persistent topbar back button (`←`).
- **Approved 6-Tab Shell & Inert Placeholders**:
  - Implemented 6-tab shell in [`src/BookHoursPlanning.tsx`](file:///f:/CodexWorkspaces/Ebookreader/src/BookHoursPlanning.tsx): `Overview` (active), `By Profile`, `By Collection`, `Books`, `Profiles`, and `Formula & Defaults`.
  - Non-overview tabs render clearly marked, inert placeholder panels explaining scope for upcoming batches (`BH-3B` / `BH-3C`), with accessible ARIA keyboard navigation.
- **Production Overview Connected to Real BH-2 Tauri IPC**:
  - Live data fetching via `get_book_hours_overview_command` without hardcoded or demo numbers.
  - Rendered Total Planned Book Hours, Current Book Hours, independent Reading Progress context, and Calculation Coverage with setup warnings (`.attn` state when uncalculated books exist).
  - Summary by Profile and Summary by Collection tables with exact coverage counts and overlap explanation.
  - Preserved semantic rules visibly: Planned Book Hours is system-calculated, Reading Progress is an independent fact, and Not Calculated books remain visible without false 0h representation.
- **Visual Design & Theme Convergence**:
  - Ported Prototype v0.6 styling into [`src/App.css`](file:///f:/CodexWorkspaces/Ebookreader/src/App.css) using canonical semantic theme tokens (`var(--surface)`, `var(--surface2)`, `var(--border)`, `var(--accent)`, `var(--accentSoft)`, `var(--text)`, `var(--muted)`).
  - Verified Light and Dark theme-safe rendering and responsive multi-column layouts.
- **Test Validation**:
  - Frontend unit tests `npm test -- --run`: 36 test files, 264 passed; 0 failed (added comprehensive `BookHoursPlanning.test.tsx` suite).
  - TypeScript typecheck `npm run typecheck`: 0 errors.
  - Rust workspace tests `cargo test`: 208 passed; 0 failed.
- **Implementation Batch Roadmap**:
  - `BH-1` / `BH-1.1` (Complete): Rust domain models, hardened SQLite schema migration (`reading_profiles`, `book.profile_id`, lossless legacy `workload_config` migration), dynamic formula & coverage calculations, aggregate queries.
  - `BH-2` / `BH-2.1` (Complete): Tauri command layer, IPC DTOs, validation & atomic recalculation preview/apply engine.
  - `BH-3A` (Complete): Book Hours Planning frontend foundation, 6-tab shell, and read-only Overview connected to real IPC.
  - `BH-3B` (Next): Profile/Collection master-detail breakdown views, Books management table, and Book setup drawer.
  - `BH-3C` (Upcoming): Reading Profile CRUD drawer, Formula & Defaults editor, recalculation impact preview modal, and Book Details integration.

Current Milestone: M1 — **Complete**, `94aff83`; M2 — **Complete**, `0a04fb4`; M3 — **Complete**, `096b90d` + durability test; M4 — **Complete**, `7f12173`; M5 — **Complete**, `67d32c5`; M6 — **Complete**, `9e99099`; M7 — **Complete**, `4d86045`; M8 — **Complete**, `2b81d54`. Full Exit Gate evidence for every Milestone is in `ROADMAP.md`.
Current Checkpoint / Promotion Unit: **Book Hours V1 Redesign Implementation Gate (BH-3A complete → awaiting user review/approval for BH-3B)**.
Current Branch / PR: `main`
Current Blockers: None.
Open Escalations: None.
Architecture State: **Accepted Architecture Baseline (Updated for Book Hours V1 Redesign BH-0.2 / BH-2.1 / BH-3A)**.
Feature Complete: Reopened for Book Hours V1 Redesign.
Feature Freeze: Unapproved (Awaiting user decision after Book Hours implementation; M9 unstarted).
RC / Release State: Not started.
Next Action: Await user visual and functional review of BH-3A before proceeding with BH-3B.









