# EbookReader Project Status

Last Updated: 2026-09-11 (Book Hours V1 Redesign — BH-3B Profile/Collection Navigation, Books Management & Book Setup Drawer Complete)

Current Phase: **Pre-Freeze Book Hours V1 Redesign (BH-3B Complete — BH-3C Next)**. The pre-Freeze V1 scope has been reopened for the Book Hours product amendment. Feature Freeze remains unapproved and M9 unstarted.

**Book Hours V1 Redesign — BH-3B Summary:**
- **By Profile Master-Detail Navigation (Tab 2)**:
  - Master list of all Reading Profiles displaying difficulty coefficient, total member books, and planned hours.
  - Detail area displaying profile metadata, shared difficulty, collections touched count, planned/current hours, and calculation coverage note.
  - Member books table showing book title, collection chips, independent reading progress bar, planned hours, current hours, remaining hours, and setup status with direct edit trigger.
- **By Collection Symmetric Master-Detail Navigation (Tab 3)**:
  - Master list of user-organized Collections displaying total book count and planned hours.
  - Detail area displaying collection metadata, total books, profiles represented count, planned/current hours, and coverage summary note (`X of Y Books currently contribute...`).
  - Member books table displaying single Profile badge, difficulty, independent reading progress, planned hours, current hours, and status badges (`Calculated` / `Needs setup`).
  - Preserved multi-Collection membership and Collection overlap semantics with global deduplication.
- **Books Management Table with Live Filtering & Search (Tab 4)**:
  - Library-wide book list with text search (title query), profile selector filter, collection selector filter, and calculation state filter (`All` / `Calculated` / `Needs setup`).
  - Full relational display with title, profile badge, collection chips, progress bar with %, planned hours, current hours, calculation status, and Edit / Set up action.
- **Book Hours Setup Drawer (`bhDrawer`)**:
  - Slide-out configuration drawer managing Book-specific inputs only: exactly one Reading Profile selector, Quantity input, Quantity Unit selector (`pages`, `words`, `characters`, `legacy_untyped`), and optional Baseline Speed override input.
  - Read-only display of Collections and independent Reading Progress.
  - Live dynamic calculation preview with full formula breakdown and status feedback before saving.
  - Positive/finite input validation and atomic persistence via `set_book_workload_command`, followed by automated overview refresh.
  - Accessible dialog structure with keyboard Escape listener.
- **Placeholder Retention (Tabs 5 & 6)**:
  - Preserved `Profiles` (Tab 5) and `Formula & Defaults` (Tab 6) as clearly marked inert placeholders for batch `BH-3C`.
- **Test Validation**:
  - Frontend unit tests `npm test -- --run`: 36 test files, 266 passed; 0 failed.
  - TypeScript typecheck `npm run typecheck`: 0 errors.
  - Rust workspace tests `cargo test`: 208 passed; 0 failed.
- **Implementation Batch Roadmap**:
  - `BH-1` / `BH-1.1` (Complete): Rust domain models, hardened SQLite schema migration (`reading_profiles`, `book.profile_id`, lossless legacy `workload_config` migration), dynamic formula & coverage calculations, aggregate queries.
  - `BH-2` / `BH-2.1` (Complete): Tauri command layer, IPC DTOs, validation & atomic recalculation preview/apply engine.
  - `BH-3A` / `BH-3A.1` (Complete): Book Hours Planning frontend foundation, 6-tab shell, read-only Overview, Organize cleanup, and completion metric parity.
  - `BH-3B` (Complete): Profile/Collection master-detail breakdown views, Books management table, and Book setup drawer.
  - `BH-3C` (Next): Reading Profile CRUD drawer, Formula & Defaults editor, recalculation impact preview modal, and Book Details integration.

Current Milestone: M1 — **Complete**, `94aff83`; M2 — **Complete**, `0a04fb4`; M3 — **Complete**, `096b90d` + durability test; M4 — **Complete**, `7f12173`; M5 — **Complete**, `67d32c5`; M6 — **Complete**, `9e99099`; M7 — **Complete**, `4d86045`; M8 — **Complete**, `2b81d54`. Full Exit Gate evidence for every Milestone is in `ROADMAP.md`.
Current Checkpoint / Promotion Unit: **Book Hours V1 Redesign Implementation Gate (BH-3B complete → Proceeding with BH-3C)**.
Current Branch / PR: `main`
Current Blockers: None.
Open Escalations: None.
Architecture State: **Accepted Architecture Baseline (Updated for Book Hours V1 Redesign BH-0.2 / BH-2.1 / BH-3A / BH-3B)**.
Feature Complete: Reopened for Book Hours V1 Redesign.
Feature Freeze: Unapproved (Awaiting user decision after Book Hours implementation; M9 unstarted).
RC / Release State: Not started.
Next Action: Proceed with BH-3C (Reading Profile CRUD, Formula & Defaults editor, recalculation impact preview modal, Book Details integration).









