# EbookReader Project Status

Last Updated: 2026-09-10 (Book Hours V1 Redesign — BH-1 Domain & SQLite Migration Complete)

Current Phase: **Pre-Freeze Book Hours V1 Redesign (BH-1 Domain & SQLite Migration Complete — Awaiting Approval for BH-2)**. The pre-Freeze V1 scope has been reopened for the Book Hours product amendment. Feature Freeze remains unapproved and M9 unstarted.

**Book Hours V1 Redesign — BH-1 Domain & SQLite Migration Summary (2026-09-10):**
- **Domain Models & Calculation Engine**:
  - `ReadingProfile`: Profile owns identity, description, and `difficulty_multiplier` only. Decoupled from format-dependent baseline speed and quantity units. Default profile `profile-default` (1.0x difficulty, `is_default = true`) seeded by migration.
  - `QuantityUnit`: `pages`, `words`, `characters`, `legacy_untyped`.
  - `GlobalBookHoursDefaults`: Unit-specific baseline speeds (60 pph for pages, 15,000 wph for words, 30,000 cph for characters), with optional per-Book speed overrides (`workload_speed_override`).
  - Pure calculation engine: `calculate_book_hours` dynamically derives Planned Book Hours `(Quantity / Baseline Speed) × Difficulty` and Current Book Hours `Planned × Cumulative Reading % / 100` (supports >100% rereads). Returns `None` (`Needs Setup` / `Not Calculated`) when quantity or baseline speed is missing.
  - Aggregation engine: `compute_book_hours_overview` computes global deduplicated totals, calculation coverage (`calculated_books`, `uncalculated_books`, `total_books`), profile-level summaries, and collection-level summaries.
  - Backward compatibility: Preserved legacy `WorkloadConfig`, `save_workload_config`, `load_workload_config`, `WorkloadConfigRevision`, `list_workload_config_revisions`, `base_book_hours`, and `cumulative_book_hours`.
- **SQLite Migration v15**:
  - Creates `reading_profiles` table and seeds default profile `profile-default`.
  - Alters `book` table to add `profile_id`, `workload_quantity`, `workload_unit`, and `workload_speed_override` columns and `idx_book_profile` index.
  - Losslessly migrates legacy `workload_config` rows into `book` table columns: legacy `baseline_speed` -> `workload_speed_override`, `quantity` -> `workload_quantity`, `workload_unit` -> `'legacy_untyped'`, legacy difficulty 1.0 -> `'profile-default'`, custom difficulties -> deterministic user-visible profiles (`Custom (X.Xx)`).
  - Preserves `workload_config_revision` audit history.
  - Updates `delete_reading_data` to clear book workload columns without mutating `reading_progress`, `document_location`, `actual_reading_time`, or `reading_session`.
- **Test Validation**:
  - `ebookreader-domain`: 198 passed; 0 failed.
  - Rust workspace `cargo test`: 198 passed; 0 failed.
  - Frontend `npm.cmd test -- --run`: 35 test files, 256 passed; 0 failed.
- **Implementation Batch Roadmap**:
  - `BH-1` (Complete): Rust domain models, SQLite schema migration (`reading_profiles`, `book.profile_id`, lossless legacy `workload_config` migration), dynamic formula & coverage calculations, aggregate queries, unit/integration tests.
  - `BH-2` (Next): Tauri command layer, IPC DTOs, settings/profile command integration, recalculation preview engine, durability & integration tests.
  - `BH-3`: Frontend UI implementation matching Prototype v0.6 (`BookHoursPlanning.tsx`, overview metrics, profile/collection views, books table, profile management, formula/defaults drawer, recalculation preview modal, details integration).

Current Milestone: M1 — **Complete**, `94aff83`; M2 — **Complete**, `0a04fb4`; M3 — **Complete**, `096b90d` + durability test; M4 — **Complete**, `7f12173`; M5 — **Complete**, `67d32c5`; M6 — **Complete**, `9e99099`; M7 — **Complete**, `4d86045`; M8 — **Complete**, `2b81d54`. Full Exit Gate evidence for every Milestone is in `ROADMAP.md`.
Current Checkpoint / Promotion Unit: **Book Hours V1 Redesign Implementation Gate (BH-1 complete → awaiting user approval for BH-2)**.
Current Branch / PR: `main`
Current Blockers: None.
Open Escalations: None.
Architecture State: **Accepted Architecture Baseline (Updated for Book Hours V1 Redesign BH-0.2 / BH-1)**.
Feature Complete: Reopened for Book Hours V1 Redesign.
Feature Freeze: Unapproved (Awaiting user decision after Book Hours implementation; M9 unstarted).
RC / Release State: Not started.
Next Action: Await user review and approval of BH-1 before starting Tauri IPC command implementation (`BH-2`).








