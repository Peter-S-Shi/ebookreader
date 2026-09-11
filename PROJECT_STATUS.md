# EbookReader Project Status

Last Updated: 2026-09-10 (Book Hours V1 Redesign — BH-2.1 Application-Boundary Hardening Complete)

Current Phase: **Pre-Freeze Book Hours V1 Redesign (BH-2.1 Application-Boundary Hardening Complete — Awaiting Approval for BH-3)**. The pre-Freeze V1 scope has been reopened for the Book Hours product amendment. Feature Freeze remains unapproved and M9 unstarted.

**Book Hours V1 Redesign — BH-2 / BH-2.1 Tauri IPC, Application Services, Validation & Atomic Recalculation Engine Summary (2026-09-10):**
- **Typed Tauri IPC Commands & DTOs**:
  - Reading Profile CRUD: `list_reading_profiles_command`, `get_reading_profile_command`, `create_reading_profile_command`, `update_reading_profile_command`, `delete_reading_profile_command` (reassigns referencing books to default profile).
  - Book Workload Setup: `get_book_workload_command`, `set_book_workload_command`.
  - Global Defaults Persistence: `get_global_book_hours_defaults_command`, `set_global_book_hours_defaults_command` backed by `ebookreader_domain::settings` (`keys::BOOK_HOURS_DEFAULTS`).
  - Book Hours Overview & Single Book Query: `get_book_hours_overview_command`, `get_book_hours_item_command` returning full calculations and coverage.
  - Recalculation Preview & Atomic Apply Engine: `preview_book_hours_recalculation_command` (strictly read-only calculation, non-mutating on DB, computes affected books, coverage deltas, profile/collection impacts, guarantees `progress_changed_count = 0`), and `apply_book_hours_recalculation_command` (atomic transactional savepoint commit/rollback, guarantees complete mutation safety).
- **BH-2.1 Targeted Application-Boundary Hardening**:
  - Positive/finite numeric validation: Strict rejection of zero, negative, NaN, infinity on `pages_per_hour`, `words_per_hour`, `characters_per_hour`, and Profile `difficulty_multiplier`.
  - Input guards on direct setters and Profile CRUD: `save_global_book_hours_defaults`, `create_reading_profile`, and `update_reading_profile` enforce validation and reject unknown profile IDs.
  - Validation Parity: `preview_book_hours_recalculation` and `apply_book_hours_recalculation` share the identical validation contract (`validate_recalculation_request`), rejecting duplicate profile IDs, unknown profile IDs, and invalid numbers before any execution.
  - Atomic Savepoint Rollback: `apply_book_hours_recalculation` wraps all mutations inside a SQLite savepoint transaction, ensuring rollback and complete preservation of live database state on mid-apply failure.
- **Backward Compatibility**:
  - Preserved legacy `get_book_hours_command`, `save_workload_config_command`, `list_workload_config_revisions_command` for existing frontend components.
- **Test Validation**:
  - `ebookreader-domain`: 208 passed; 0 failed (includes new tests for invalid numerics rejection, profile CRUD validation, preview/apply parity, trigger-verified mid-apply atomic savepoint rollback, and multi-profile atomic persistence).
  - Rust workspace `cargo test`: 208 passed; 0 failed.
  - Frontend `npm.cmd test -- --run`: 35 test files, 256 passed; 0 failed.
  - TypeScript typecheck `npm.cmd run typecheck`: 0 errors.
- **Implementation Batch Roadmap**:
  - `BH-1` / `BH-1.1` (Complete): Rust domain models, hardened SQLite schema migration (`reading_profiles`, `book.profile_id`, lossless legacy `workload_config` migration), dynamic formula & coverage calculations, aggregate queries, unit/integration tests.
  - `BH-2` / `BH-2.1` (Complete): Tauri command layer, IPC DTOs, settings/profile command integration, validation & atomic recalculation preview/apply engine, durability & integration tests.
  - `BH-3` (Next): Frontend UI implementation matching Prototype v0.6 (`BookHoursPlanning.tsx`, overview metrics, profile/collection views, books table, profile management, formula/defaults drawer, recalculation preview modal, details integration).

Current Milestone: M1 — **Complete**, `94aff83`; M2 — **Complete**, `0a04fb4`; M3 — **Complete**, `096b90d` + durability test; M4 — **Complete**, `7f12173`; M5 — **Complete**, `67d32c5`; M6 — **Complete**, `9e99099`; M7 — **Complete**, `4d86045`; M8 — **Complete**, `2b81d54`. Full Exit Gate evidence for every Milestone is in `ROADMAP.md`.
Current Checkpoint / Promotion Unit: **Book Hours V1 Redesign Implementation Gate (BH-2.1 complete → awaiting user approval for BH-3)**.
Current Branch / PR: `main`
Current Blockers: None.
Open Escalations: None.
Architecture State: **Accepted Architecture Baseline (Updated for Book Hours V1 Redesign BH-0.2 / BH-2.1)**.
Feature Complete: Reopened for Book Hours V1 Redesign.
Feature Freeze: Unapproved (Awaiting user decision after Book Hours implementation; M9 unstarted).
RC / Release State: Not started.
Next Action: Await user review and approval of BH-2.1 before starting Frontend UI implementation (`BH-3`).









