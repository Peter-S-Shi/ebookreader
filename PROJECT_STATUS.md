# EbookReader Project Status

Last Updated: 2026-09-11 (Book Hours V1 Redesign — BH-3B + BH-3C + BH-3C.1 Implementation Complete)

Current Phase: **Pre-Freeze Book Hours V1 Redesign (BH-3B + BH-3C + BH-3C.1 Implementation Complete — Awaiting Combined Native Human Acceptance)**. Feature Freeze remains unapproved and M9 unstarted.

**Book Hours V1 Redesign — BH-3C & BH-3C.1 Summary:**
- **Reading Profiles CRUD & Management (Tab 5)**:
  - Reading Profile card grid displaying name, default status, description, difficulty multiplier, book count, planned hours, and current hours.
  - Create & Edit profile drawer: manages name, difficulty coefficient (> 0), and description.
  - Set Default Profile action with backend synchronization (`set_default_reading_profile_command`) protected with transactional `SAVEPOINT` atomicity.
  - Delete Profile confirmation dialog with safe automatic reassignment of member books to the current default profile (`delete_reading_profile_command`) protected with transactional `SAVEPOINT` atomicity and explicit rejection if no valid default profile exists.
- **Formula & Defaults Surface (Tab 6)**:
  - Visual formula flow showing the canonical formula: `(Quantity / Baseline Speed) × Difficulty = Planned Book Hours`, and `Planned Book Hours × Reading Progress % = Current Book Hours`.
  - Editable global unit-specific baseline speeds for pages/hour (PDF), words/hour (EPUB/TXT), and characters/hour (EPUB/TXT).
  - Truthful missing defaults handling: no hardcoded fallback numbers (60/15000/30000); displays truthful error/unavailable banner and disables dependent recalculation actions when defaults fail to load.
  - Recalculation Impact Preview modal (`preview_book_hours_recalculation_command`): shows affected books, profiles, and collections counts, old vs new planned hours, affected books table with delta formatting, and `Reading Progress changes = 0`.
  - Atomic recalculation Apply action (`apply_book_hours_recalculation_command`) with full error feedback and automatic overview refresh.
- **Book Details Integration & Organize Migration**:
  - Removed cramped inline Organize card expansion from Library; "Organize" on book cards navigates into `BookDetails` focused on the `Organization` section (`initialFocusSection="organization"`).
  - Multi-Collection membership editing (add/remove collections) housed in `BookDetails`.
  - Hardened truthfulness in `BookDetails`: IPC failures for Reading Progress, Actual Reading Time, Book Hours, or Collections render visible non-destructive error notices and never masquerade as `0m`, `Not configured yet`, or `No Collections assigned`.
  - Displays Book's single Reading Profile as Book Hours identity.
  - Read-only Book Hours summary in `BookDetails` with one-shot deep-link navigation intent into `Data → Book Hours Planning` (`initialTab="books"`, `initialBookId={bookId}`), consumed and cleared upon drawer open.
- **Integration Debts & Polish**:
  - Deep-link from `Book Details → Manage in Data` consumed exactly once; closing drawer or normal navigation from Data does not resurrect the previously managed book.
  - Restricted `legacy_untyped` unit: visible only when editing an existing migrated legacy book (with a warning banner advising migration to standard units); excluded from new setups.
- **Test Validation**:
  - Frontend unit tests `npm test -- --run`: 36 test files, 277 passed; 0 failed.
  - TypeScript typecheck `npm run typecheck`: 0 errors.
  - Rust workspace tests `cargo test`: 212 passed; 0 failed.
- **Implementation Batch Roadmap**:
  - `BH-1` / `BH-1.1` (Complete): Rust domain models, hardened SQLite schema migration (`reading_profiles`, `book.profile_id`, lossless legacy `workload_config` migration), dynamic formula & coverage calculations, aggregate queries.
  - `BH-2` / `BH-2.1` (Complete): Tauri command layer, IPC DTOs, validation & atomic recalculation preview/apply engine.
  - `BH-3A` / `BH-3A.1` (Complete): Book Hours Planning frontend foundation, 6-tab shell, read-only Overview, Organize cleanup, and completion metric parity.
  - `BH-3B` (Complete): Profile/Collection master-detail breakdown views, Books management table, and Book setup drawer.
  - `BH-3C` / `BH-3C.1` (Complete): Reading Profile CRUD drawer, Formula & Defaults editor, recalculation impact preview modal, Book Details integration, one-shot deep-linking, transactional profile mutations, and truthful error reporting.

Current Milestone: M1 — **Complete**, `94aff83`; M2 — **Complete**, `0a04fb4`; M3 — **Complete**, `096b90d` + durability test; M4 — **Complete**, `7f12173`; M5 — **Complete**, `67d32c5`; M6 — **Complete**, `9e99099`; M7 — **Complete**, `4d86045`; M8 — **Complete**, `2b81d54`. Full Exit Gate evidence for every Milestone is in `ROADMAP.md`.
Current Checkpoint / Promotion Unit: **Book Hours V1 Redesign Implementation Gate (BH-3B + BH-3C + BH-3C.1 complete → Awaiting Combined Native Human Acceptance)**.
Current Branch / PR: `main`
Current Blockers: None.
Current Escalations: None.
Architecture State: **Accepted Architecture Baseline (Updated for Book Hours V1 Redesign BH-0.2 / BH-2.1 / BH-3A / BH-3B / BH-3C / BH-3C.1)**.
Feature Complete: Reopened for Book Hours V1 Redesign.
Feature Freeze: Unapproved (Awaiting native human review of BH-3B + BH-3C + BH-3C.1; M9 unstarted).
RC / Release State: Not started.
Next Action: HARD STOP for combined native human acceptance of BH-3B + BH-3C + BH-3C.1.










