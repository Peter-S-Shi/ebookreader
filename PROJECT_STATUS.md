# EbookReader Project Status

Last Updated: 2026-09-11 (Pre-Freeze Systemic UX Hardening Implementation Complete)

Current Phase: **Pre-Freeze Systemic UX Hardening Complete — Awaiting Combined Native Human Acceptance**. Feature Freeze remains unapproved and M9 unstarted.

**Pre-Freeze Systemic UX Hardening Summary:**
- **Persistent Highlights Stable Identity**:
  - Attached stable `ReadingAsset.id` to DOM nodes (`data-asset-id`) across EPUB (`Reader.tsx`), PDF (`PdfReader.tsx`), and TXT (`TxtReader.tsx`) readers on both creation and rehydration.
  - Recolor and deletion operate strictly by asset ID (`update_reading_asset_anchor_command`, `delete_reading_asset_command`) rather than fuzzy text matches; orphaned assets are safely excluded from reader rehydration.
- **Library Multi-Select & Soft Removal**:
  - Library multi-select mode with floating bulk action bar.
  - Bulk "Remove from Library" strictly invokes existing soft removal semantics (`remove_book_command` / `library_status = 'removed'`), preserving book rows, bindings, reading progress, notes/highlights, Book Hours, alignment data, and source files on disk with zero hard deletion.
  - Bulk "Add to Collection" dialog supporting multi-book categorization in one step.
- **Collections Management IA**:
  - Clean filter chips without fragile hover delete buttons in Library toolbar.
  - Dedicated "Manage Collections" modal with collection creation, inline renaming, and safe deletion confirmation dialog explaining book/data preservation.
- **Bilingual Alignment Visibility & Management in Data Center**:
  - Added Bilingual Alignments card in `DataRecovery.tsx` displaying aggregate alignment statistics, package summary table (clean 1:1 vs review mapping counts), package import, direct bilingual reading launcher, and safe unpair confirmation modal.
  - Eliminated singular `LIMIT 1` assumption across backend and frontend; added `list_alignment_packages_for_book_command` and `get_alignment_package_by_id_command` for truthful plural alignment handling.
- **Systemic Layout & UX Polish**:
  - Sticky top header in `BookDetails.tsx`.
  - Viewport-constrained scrollable modals with fixed headers and action footers.

**Book Hours V1 Redesign & Core Systems Status:**
- Reading Profiles CRUD (Tab 5) & Formula Defaults (Tab 6) fully integrated.
- Book Details deep-linking into Data → Book Hours Planning consumed as a one-shot intent.
- All unit-default dependencies strictly bound to IPC data without synthetic defaults.

**Test Validation:**
- Frontend unit tests `npx vitest run`: 36 test files, 281 passed; 0 failed.
- TypeScript typecheck `npm run typecheck`: 0 errors.
- Rust workspace tests `cargo test`: 216 passed; 0 failed.

Current Milestone: M1 — **Complete**, `94aff83`; M2 — **Complete**, `0a04fb4`; M3 — **Complete**, `096b90d` + durability test; M4 — **Complete**, `7f12173`; M5 — **Complete**, `67d32c5`; M6 — **Complete**, `9e99099`; M7 — **Complete**, `4d86045`; M8 — **Complete**, `2b81d54`. Full Exit Gate evidence for every Milestone is in `ROADMAP.md`.
Current Checkpoint / Promotion Unit: **Pre-Freeze Systemic UX Hardening & Book Hours V1 Redesign Gate (Complete → Awaiting Combined Native Human Acceptance)**.
Current Branch / PR: `main`
Current Blockers: None.
Current Escalations: None.
Architecture State: **Accepted Architecture Baseline (Updated for Pre-Freeze UX Hardening & Book Hours V1 Redesign)**.
Feature Complete: Reopened for Book Hours V1 Redesign and UX Hardening.
Feature Freeze: Unapproved (Awaiting native human review of BH-3B + BH-3C + BH-3C.1 + UX Hardening; M9 unstarted).
RC / Release State: Not started.
Next Action: HARD STOP for combined native human acceptance.










