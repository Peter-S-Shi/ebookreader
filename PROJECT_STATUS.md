# EbookReader Project Status

Last Updated: 2026-09-10 (Book Hours V1 Redesign — BH-0.2 Final Model Closure Complete)

Current Phase: **Pre-Freeze Book Hours V1 Redesign (BH-0.2 Final Model Closure Complete — Awaiting Approval for BH-1)**. The pre-Freeze V1 scope has been reopened for the Book Hours product amendment. Feature Freeze remains unapproved and M9 unstarted.

**Book Hours V1 Redesign — BH-0.2 Final Model Closure Summary (2026-09-10):**
- **Semantic Model & Decoupling Locked**:
  - `ReadingProfile` owns the **Difficulty Coefficient only** (plus identity/description). Format-dependent baseline speeds and quantity units are decoupled from profiles.
  - Baseline speed is resolved by quantity unit via configurable global defaults (`pages/hour` for PDF, `words/hour` and `characters/hour` for EPUB/TXT), with optional per-Book speed overrides (`workload_speed_override`).
  - Format-appropriate trustworthy quantity discovery: PDF uses physical pages; reflowable EPUB/TXT uses supported words/characters when available, otherwise remaining in `Needs Setup` (`Not Calculated`), never fabricating page counts.
  - Formula: `Planned Book Hours = (Quantity / Baseline Speed) × Difficulty Coefficient`; `Current Book Hours = Planned Book Hours × Cumulative Reading % / 100`.
  - Stale `Tag` and `WorkloadCategory` entries purged from Architecture domain concept list.
  - Prototype v0.6 (`docs/design/EbookReader_UI_Prototype_v0_6_Book_Hours_Planning.html`) and `DESIGN.md` updated to remove preferred speed from profile cards/editor and display unit-based speed defaults in Formula & Defaults.
  - Genuinely lossless legacy migration: Preserves legacy `baseline_speed` in `workload_speed_override`, marks unit as `legacy_untyped` to retain exact historical calculation without inventing semantics, maps custom difficulties into explicit user-visible profiles (e.g. `Custom (1.1x)`), and preserves `workload_config_revision` audit history. Difficulty is 100% Profile-owned with zero hidden secondary multipliers.
  - Non-interference guarantee: Modifying formulas, profiles, or recalculating Book Hours never alters reading progress %, reading position, completed-read count, actual reading time, or `ReadingSession` history.
- **Canonical Documents Updated**:
  - `PRODUCT_SPEC.md` (§3.3, §4.3–4.4, §9.1–9.4)
  - `ARCHITECTURE.md` (§3.3 domain concepts, §8.1–8.5 database schema, lossless migration path, IPC commands)
  - `DESIGN.md` (§3 `ER-BH-001`, §13.2 Book Hours Planning sub-screens, side drawers, badges, and modals)
  - `docs/design/EbookReader_UI_Prototype_v0_6_Book_Hours_Planning.html` (Profile cards/editor & Formula tab unit speeds)
- **Implementation Batch Roadmap**:
  - `BH-1`: Rust domain models, SQLite schema migration (`reading_profiles`, `books.profile_id`, lossless legacy `workload_config` migration), dynamic formula & coverage calculations, aggregate queries, unit/integration tests.
  - `BH-2`: Tauri command layer, IPC DTOs, settings/profile command integration, recalculation preview engine, durability & integration tests.
  - `BH-3`: Frontend UI implementation matching Prototype v0.6 (`BookHoursPlanning.tsx`, overview metrics, profile/collection views, books table, profile management, formula/defaults drawer, recalculation preview modal, details integration).

Current Milestone: M1 — **Complete**, `94aff83`; M2 — **Complete**, `0a04fb4`; M3 — **Complete**, `096b90d` + durability test; M4 — **Complete**, `7f12173`; M5 — **Complete**, `67d32c5`; M6 — **Complete**, `9e99099`; M7 — **Complete**, `4d86045`; M8 — **Complete**, `2b81d54`. Full Exit Gate evidence for every Milestone is in `ROADMAP.md`.
Current Checkpoint / Promotion Unit: **Book Hours V1 Redesign Implementation Gate (BH-0.2 complete → awaiting user approval for BH-1)**.
Current Branch / PR: `main`
Current Blockers: None.
Open Escalations: None.
Architecture State: **Accepted Architecture Baseline (Updated for Book Hours V1 Redesign BH-0.2)**.
Feature Complete: Reopened for Book Hours V1 Redesign.
Feature Freeze: Unapproved (Awaiting user decision after Book Hours implementation; M9 unstarted).
RC / Release State: Not started.
Next Action: Await user review and approval of BH-0.2 final model closure before starting production implementation (`BH-1`).







