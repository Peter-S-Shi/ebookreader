# Feature Complete — Requirement-to-Implementation Coverage Audit

Written: 2026-09-09
Status: **Initial corrective-pass audit** (post first Human Feature Freeze Gate rejection at `f47452f`). This is promotion evidence, not a canonical spec. It supersedes any implicit "Milestone Complete -> requirement complete" reasoning from the first `FEATURE_COMPLETE_CANDIDATE_REPORT.md`.

Method: every row below was produced by reading the actual production source (`src/`, `src-tauri/src/`, `crates/domain/src/`) against the frozen authorities (`PRODUCT_SPEC.md`, `DESIGN.md`, `FORMAT_CAPABILITY_MATRIX.md`, `MANUAL_QA.md`), not by citing Milestone-complete status or CI green.

Classification values: `IMPLEMENTED_USER_REACHABLE`, `IMPLEMENTED_BACKEND_ONLY`, `IMPLEMENTED_PARTIAL`, `PROTOTYPE_ONLY`, `MISSING`, `LEGITIMATE_DEFERRED_NON_GOAL`, `NEEDS_HUMAN_CONFLICT_DECISION`.

## Confirmed defects from the first Human Feature Freeze Gate

| ID | Requirement | Classification | Evidence | Ticket |
|---|---|---|---|---|
| FC-C01 | Search result exact-location jump | **IMPLEMENTED_USER_REACHABLE** (closed 2026-09-09) | `crates/domain/src/search.rs`: `SearchHit.anchor`, `search_index.anchor_json`, `index_text_with_anchor`; `Reader.tsx`/`PdfReader.tsx`/`TxtReader.tsx` each index book text with a real per-section/page/paragraph anchor (`sections[i].cfi`, page number, paragraph char-offset respectively) and accept an `initialAnchor` prop that seeks there on open, reporting an unresolvable anchor truthfully via a `jumpFailed` banner rather than silently opening page one | — (closed) |
| FC-C02 | Global Notes exact source jump | **IMPLEMENTED_USER_REACHABLE** (closed 2026-09-09) | Failure Attribution found the domain layer already had this: `ReadingAsset.anchor: Option<DocumentLocation>` was already fully persisted and tested. The actual gap was `App.tsx`'s `ReadingAssetDTO` not exposing it and the click handler not using it -- `openBookAtLocation` now threads `asset.anchor` the same way as Search; a free-standing Note (`anchor: null`) opens the Book plainly, which is truthful (there is no location to fail to reach), not a degraded jump | — (closed) |
| FC-C03 | Book Data completed-read override UI | **IMPLEMENTED_USER_REACHABLE** (closed 2026-09-09) | `src\DataRecovery.tsx` exposes Data -> Book Data: load Library books, set non-negative completed-read count per Book, confirm with warning that active progress is cleared while Actual Reading Time and ReadingSession history stay unchanged, then call `override_completed_reads_command`. Existing domain command remains the persistence seam | — (closed) |
| FC-C04 | Destructive semantics separation | **IMPLEMENTED_USER_REACHABLE** (closed 2026-09-09) | Domain/data semantics are split first: `remove_from_library` hides a Book from Library without deleting reading data or file bytes; `delete_reading_data` clears book-scoped reading/user data while keeping the Book and file binding; `delete_managed_copy_file` deletes only app-managed bytes and rejects Reference-mode Books. UI exposes truthful labels and confirmations: `Remove from Library`, `Delete Reading Data`, and Managed-Copy-only `Delete Managed-Copy File` | — (closed) |
| FC-C05 | Canonical Settings surface | **IMPLEMENTED_PARTIAL** (updated 2026-09-09) | `src/Settings.tsx` + `crates/domain/src/settings.rs` (`app_setting` table, migration v9): Appearance (theme mode, accent color) is real, persisted, user-reachable. Reading-time policy toggles, Reading Checkpoint, typography defaults, sound/motion, default import mode, update-awareness preference, and About & Updates are still not in this surface -- each is owned by ticket 9-16 per `FEATURE_COMPLETE_CORRECTIVE_TICKETS.md` and lands inside this same `Settings.tsx`, not a second location | FC-C05 (Appearance slice closed; remainder tracked under tickets 9-16) |
| FC-C06 | Top-level management IA (Library/Notes/Calendar/Data/Settings) | **IMPLEMENTED_USER_REACHABLE** (closed 2026-09-09) | `src/App.tsx`: real `<nav aria-label="Main">` with 5 destinations, `aria-current="page"` on the active one, Library default; Search is a persistent topbar section independent of destination; Reader/Bilingual remain contextual overlays (no nav entry). Verified by dedicated tests in `App.test.tsx` ("Top-level navigation" describe block) | — (closed) |
| FC-C07 | Full Library Backup Reference-file opt-in | **IMPLEMENTED_BACKEND_ONLY** | `backup.rs:117-150` / `commands.rs:417-436` support it; `src/DataRecovery.tsx:60-64` hard-codes `extraReferenceFiles: []` | FC-C07 |
| FC-C08 | Startup Update Awareness + preference | **IMPLEMENTED_PARTIAL** | `updateAwareness.ts:47-66` correct logic; no startup call site, no preference to disable it (nothing to disable) | FC-C08 |

## Audit-discovered defects (not previously confirmed, found by this pass)

| ID | Requirement | Classification | Evidence | Ticket |
|---|---|---|---|---|
| FC-A01 | Collections and Tags (V1 domain entities) | **MISSING** | Zero matches for `collection`/`tag` in `store.rs` schema, `commands.rs`, or `src/App.tsx` | FC-A01 |
| FC-A02 | Metadata editing / user-correction precedence | **MISSING** | Only `title` persisted, set once at import (`store.rs:199-268`); no edit UI, no re-detection path, so the invariant is vacuously true because nothing exists to violate it | FC-A02 |
| FC-A03 | Duplicate fingerprint UX (3-choice dialog) | **IMPLEMENTED_BACKEND_ONLY** | `store.rs:190-240` silently returns existing `book_id`; `App.tsx:73-83` shows no dialog at all | FC-A03 |
| FC-A04 | Notebook Markdown export | **MISSING** | No `markdown`/`export` hits anywhere in production source beyond JS keyword noise | FC-A04 |
| FC-A05 | Book Hours configuration/history fidelity | **IMPLEMENTED_PARTIAL** | `book_hours.rs:41-76` overwrites current config (`ON CONFLICT DO UPDATE`), no history table (comment at 21-24 admits this is deferred); no UI at all calls the existing commands | FC-A05 |
| FC-A06 | Actual Reading Time policy controls | **IMPLEMENTED_PARTIAL** | Only OS lock/sleep pause is real (`reading_session_hook.rs`); background-pause, 5-min inactivity, note-taking-counts have zero code; no Settings UI for any of the four toggles | FC-A06 |
| FC-A07 | Automatic Recovery Snapshots (migration + destructive mutation) | **IMPLEMENTED_PARTIAL** | Restore path snapshots correctly (`backup.rs:242-244`); `remove_book_command` (`commands.rs:110-114`) and startup `run_migrations` (`store.rs:36`) have no pre-operation snapshot | FC-A07 |
| FC-A08 | Typography/font provenance | **IMPLEMENTED_PARTIAL** | Publisher/Original + SYSTEM fonts real and wired; BUILT_IN, CUSTOM import, CJK override, margins, and all persistence (global default / per-book) are missing (`TypographyPanel.tsx` own comment admits this) | FC-A08 |
| FC-A09 | Page-turn sound + reduced motion | **IMPLEMENTED_PARTIAL** | Sound playback real and wired into `Reader.tsx`/`PdfReader.tsx`, but toggle state is session-only, not persisted; reduced-motion relies solely on OS `prefers-reduced-motion`, no in-app override | FC-A09 |
| FC-A10 | Reading Checkpoint | **MISSING** | Every "checkpoint" hit in source is the *development-process* meaning (Milestone commits); the product feature exists only in `DESIGN.md`/`MANUAL_QA.md`/the prototype | FC-A10 |
| FC-A11 | Book Details / Continue Reading composition | **IMPLEMENTED_PARTIAL** | Reread completion prompt is real and correctly gated (`CompletionPrompt.tsx`, `completionTrigger.ts`); no Book Details view, no Continue Reading section, Book Hours/Actual Reading Time never surfaced to the user | FC-A11 |
| FC-A12 | OCR full user workflow | **IMPLEMENTED_USER_REACHABLE** | End-to-end real, including durable correction persistence; vertical-CJK residual truthfully still recorded in `ROADMAP.md:609-632`, not relabeled fixed. No corrective ticket needed. | — |
| FC-A13 | Bilingual Alignment workflow | **IMPLEMENTED_USER_REACHABLE** | End-to-end real at its documented, deliberately-scoped level (scroll-sync, not per-paragraph); scope narrowing is recorded in `alignment.rs` module doc, not silently substituted. No corrective ticket needed. | — |
| FC-A14 | Backup/Restore completeness | **IMPLEMENTED_PARTIAL** | DB-resident data (Notes/OCR/BookHours) round-trips and is tested; Managed-Copy bytes round-trip and are tested; no test proves ReadingSessions or Alignment Packages survive restore; Collections/Tags round trip is moot until FC-A01 exists; Reference-file round trip is UI-unreachable pending FC-C07 | FC-A14 |

## Summary

- Updated 2026-09-09: `FC-C01`, `FC-C02`, `FC-C03`, `FC-C04`, `FC-C06` closed via corrective-pass tickets 1-4; `FC-C05` partially closed (Appearance). 5 of the 8 confirmed (`FC-C01`-`FC-C08`) items are now fully closed.
- 2 items (`FC-A12`, `FC-A13`) were already genuinely closed — no ticket needed.
- 13 items still require corrective work before a second Feature Complete Candidate can be declared (see `FEATURE_COMPLETE_CORRECTIVE_TICKETS.md` for live status).
- No item required a `NEEDS_HUMAN_CONFLICT_DECISION` — every gap found is a coverage/implementation gap against an already-frozen, non-conflicting authority, not a contract conflict.
- No item is `LEGITIMATE_DEFERRED_NON_GOAL` — nothing found is marked deferred by the authorities themselves.

This confirms the corrective-pass prompt's own primary failure attribution: the first promotion inferred completeness from Milestone-complete/CI-green status rather than auditing actual user-reachable behavior. Root layer for nearly every gap is **Frontend integration** (backend/domain logic frequently exists; the user-reachable surface does not) — consistent with a pattern of Milestones closing on backend Exit Gate evidence while leaving the corresponding UI unbuilt or unwired.

See `FEATURE_COMPLETE_CORRECTIVE_TICKETS.md` for the ordered ticket list this audit produces.
