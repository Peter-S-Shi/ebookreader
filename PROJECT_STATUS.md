# EbookReader Project Status

Last Updated: 2026-09-11 (Book Hours V1 Redesign — BH-3A.1 Targeted Frontend Contract Cleanup Complete)

Current Phase: **Pre-Freeze Book Hours V1 Redesign (BH-3A / BH-3A.1 Planning Frontend Foundation, Overview & Contract Cleanup Complete — Awaiting Approval for BH-3B)**. The pre-Freeze V1 scope has been reopened for the Book Hours product amendment. Feature Freeze remains unapproved and M9 unstarted.

**Book Hours V1 Redesign — BH-3A / BH-3A.1 Planning Frontend & Contract Cleanup Summary:**
- **Library Organize Contract Cleanup (BH-3A.1)**:
  - Eliminated legacy Generic Tags inputs and editable Book Hours workload controls from `Library` → `Organize` in [`src/App.tsx`](file:///f:/CodexWorkspaces/Ebookreader/src/App.tsx).
  - Preserved Collections management intact as the sole organization mechanism in Organize panel.
  - Replaced legacy workload editor with a read-only Book Hours summary (`Base Xh, Cumulative Yh`) and a direct navigation button to `Data` → `Book Hours Planning`.
- **Book Hours Completion Metric Parity (BH-3A.1)**:
  - Replaced arithmetic-average progress calculation in [`src/BookHoursPlanning.tsx`](file:///f:/CodexWorkspaces/Ebookreader/src/BookHoursPlanning.tsx) with canonical weighted `Book Hours Completion = Total Current Book Hours / Total Planned Book Hours × 100%`.
  - Truthfully renders unavailable dash state (`—` and `"No planned book hours available yet."`) when total planned hours is 0.
  - Preserved clear explanatory text that Reading Progress is an independent per-Book reading fact never altered by Book Hours recalculation.
- **Data Workspace Book Hours Planning Entry & 6-Tab Shell (BH-3A)**:
  - Added dedicated Book Hours Planning entry under Data workspace (`DataRecovery.tsx`), matching Prototype v0.6 visual hierarchy and IA.
  - 6-tab shell in [`src/BookHoursPlanning.tsx`](file:///f:/CodexWorkspaces/Ebookreader/src/BookHoursPlanning.tsx): `Overview` (active), `By Profile`, `By Collection`, `Books`, `Profiles`, and `Formula & Defaults`.
  - Non-overview tabs render inert placeholder panels explaining scope for upcoming batches (`BH-3B` / `BH-3C`), with accessible ARIA keyboard navigation.
- **Production Overview Connected to Real BH-2 Tauri IPC**:
  - Live data fetching via `get_book_hours_overview_command` without hardcoded or demo numbers.
  - Rendered Total Planned Book Hours, Current Book Hours, independent Reading Progress context, and Calculation Coverage with setup warnings (`.attn` state when uncalculated books exist).
  - Summary by Profile and Summary by Collection tables with exact coverage counts and overlap explanation.
- **Test Validation**:
  - Frontend unit tests `npm test -- --run`: 36 test files, 263 passed; 0 failed.
  - TypeScript typecheck `npm run typecheck`: 0 errors.
  - Rust workspace tests `cargo test`: 208 passed; 0 failed.
- **Implementation Batch Roadmap**:
  - `BH-1` / `BH-1.1` (Complete): Rust domain models, hardened SQLite schema migration (`reading_profiles`, `book.profile_id`, lossless legacy `workload_config` migration), dynamic formula & coverage calculations, aggregate queries.
  - `BH-2` / `BH-2.1` (Complete): Tauri command layer, IPC DTOs, validation & atomic recalculation preview/apply engine.
  - `BH-3A` / `BH-3A.1` (Complete): Book Hours Planning frontend foundation, 6-tab shell, read-only Overview, Organize cleanup, and completion metric parity.
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









