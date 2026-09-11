# EbookReader Project Status

Last Updated: 2026-09-10 (Book Hours V1 Redesign — BH-0 Contract & Architecture Reconciliation Complete)

Current Phase: **Pre-Freeze Book Hours V1 Redesign (BH-0 Complete — Awaiting Approval for BH-1)**. The pre-Freeze V1 scope has been reopened for the Book Hours product amendment. Feature Freeze remains unapproved and M9 unstarted.

**Book Hours V1 Redesign — BH-0 Reconciliation Summary (2026-09-10):**
- **Normative Authority & Rules Reconciled**:
  - `docs/design/EbookReader_UI_Prototype_v0_6_Book_Hours_Planning.html` established as canonical visual and information-architecture authority for `ER-BH-001`.
  - Canonical formula locked: `Planned Book Hours = (Quantity / Baseline Speed) × Difficulty Coefficient`; `Current Book Hours = Planned Book Hours × Cumulative Reading % / 100`.
  - System-calculated only: Planned Book Hours is always derived, never directly user-entered.
  - "Needs Setup" state: Books missing inputs are excluded from aggregate sums and tracked with explicit coverage counts (`11 / 13 calculated`, never coerced to 0h).
  - Singular Reading Profile (1:1 or 1:0) replaces legacy Book-Hours tags/categories and owns difficulty coefficient and speed defaults. Generic tags remain decoupled.
  - Non-interference guarantee: Modifying formulas, profiles, or recalculating Book Hours never alters reading progress %, reading position, completed-read count, actual reading time, or `ReadingSession` history.
  - Multi-collection aggregation: Global totals deduplicate books; collection totals reflect local workload and may overlap.
- **Canonical Documents Updated**:
  - `PRODUCT_SPEC.md` (§4.3–4.5, §9.1–9.4)
  - `ARCHITECTURE.md` (§8.1–8.5, database schema, migration path, IPC commands)
  - `DESIGN.md` (§3 `ER-BH-001`, §13.2 Book Hours Planning sub-screens, side drawers, badges, and modals)
- **Implementation Batch Roadmap**:
  - `BH-1`: Rust domain models, SQLite schema migration (`reading_profiles`, `books.profile_id`, legacy `workload_config` migration), dynamic formula & coverage calculations, aggregate queries, unit/integration tests.
  - `BH-2`: Tauri command layer, IPC DTOs, settings/profile command integration, recalculation preview engine, durability & integration tests.
  - `BH-3`: Frontend UI implementation matching Prototype v0.6 (`BookHoursPlanning.tsx`, overview metrics, profile/collection views, books table, profile management, formula/defaults drawer, recalculation preview modal, details integration).

Current Milestone: M1 — **Complete**, `94aff83`; M2 — **Complete**, `0a04fb4`; M3 — **Complete**, `096b90d` + durability test; M4 — **Complete**, `7f12173`; M5 — **Complete**, `67d32c5`; M6 — **Complete**, `9e99099`; M7 — **Complete**, `4d86045`; M8 — **Complete**, `2b81d54`. Full Exit Gate evidence for every Milestone is in `ROADMAP.md`.
Current Checkpoint / Promotion Unit: **Book Hours V1 Redesign Implementation Gate (BH-0 complete → ready for BH-1)**.
Current Branch / PR: `main`
Current Blockers: None.
Open Escalations: None.
Architecture State: **Accepted Architecture Baseline (Updated for Book Hours V1 Redesign)**.
Feature Complete: Reopened for Book Hours V1 Redesign.
Feature Freeze: Unapproved (Awaiting user decision after Book Hours implementation; M9 unstarted).
RC / Release State: Not started.
Next Action: Await user review and approval of BH-0 reconciliation before starting production implementation (`BH-1`).







