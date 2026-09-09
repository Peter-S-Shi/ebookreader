# Feature Complete Corrective Pass — Ordered Ticket List

Written: 2026-09-09. Source: `FEATURE_COMPLETE_REQUIREMENT_COVERAGE_AUDIT.md`. This file tracks status only; requirement detail lives in the audit and in `EbookReader_Feature_Complete_Corrective_Pass_CC_Prompt_2026-09-09.md` (local prompt-drafts, not committed).

Ordering rationale: foundational shells first (Settings surface + navigation, since ~6 later tickets need a place to put a toggle), then shared plumbing (DocumentLocation threading serves both search and notes jump), then the rest in roughly dependency order. Two items (FC-A12, FC-A13) are already closed and carry no ticket.

| # | Ticket | Status | Depends on |
|---|---|---|---|
| 1 | FC-C05/C06 — Settings surface + top-level nav shell (Library/Notes/Calendar/Data/Settings; Reader stays contextual; Search demoted to topbar/context) | CLOSED (nav shell + Appearance) — remaining FC-C05 setting groups tracked under tickets 9-16 | — |
| 2 | FC-C01/C02 — DocumentLocation-carrying search hits + notes assets; exact-jump from Search and Global Notes into Reader | CLOSED | — |
| 3 | FC-C04 — Split "Remove" into Remove from Library / Delete Reading Data / delete Managed-Copy, each labeled + confirmed | CLOSED (`22afafc`, CI run 34402533583 success) | — |
| 4 | FC-C03 — Book Data completed-read override UI wired to existing `override_completed_reads_command` | OPEN | 1 (lives under Data) |
| 5 | FC-A03 — Duplicate-fingerprint 3-choice dialog ([Open Existing]/[Relink Existing Book]/[Cancel]) | OPEN | — |
| 6 | FC-A01 — Collections and Tags: schema, commands, Library UI, backup inclusion | OPEN | — |
| 7 | FC-A02 — Metadata editing UI + user-correction precedence | OPEN | — |
| 8 | FC-A04 — Notebook Markdown export | OPEN | — |
| 9 | FC-C07 — Reference-file picker for Full Library Backup + inclusion/exclusion tests | OPEN | 1 (lives under Data) |
| 10 | FC-C08 — Non-blocking startup update check + user preference to disable it | OPEN | 1 (preference lives in Settings) |
| 11 | FC-A05 — Book Hours configuration UI + revision history | OPEN | 1 |
| 12 | FC-A06 — Actual Reading Time: background-pause, 5-min inactivity, note-taking-counts + Settings toggles | OPEN | 1 |
| 13 | FC-A07 — Recovery snapshot before schema migration and before destructive mutations (remove_book, etc.) | OPEN | — |
| 14 | FC-A08 — Typography: BUILT_IN fonts, CUSTOM import, CJK override, margins, persisted global default + per-book override | OPEN | 1 |
| 15 | FC-A09 — Persist sound toggle + reduced-motion in-app override; confirm reachable UI control | OPEN | 1 |
| 16 | FC-A10 — Reading Checkpoint: default-Off preference + session-end reflection prompt | OPEN | 1 |
| 17 | FC-A11 — Book Details view + Continue Reading section + Book Hours/Actual Reading Time presentation | OPEN | — |
| 18 | FC-A14 — Close Backup/Restore completeness: ReadingSessions + Alignment Package round-trip tests; Collections/Tags round trip once ticket 6 lands; verify Reference-file round trip once ticket 9 lands | OPEN | 6, 9 |

Closed already (no ticket): FC-A12 (OCR workflow), FC-A13 (Bilingual Alignment workflow).

## Execution protocol per ticket (per corrective-pass prompt SS7)

1. State frozen requirement + current observed behavior (from the audit).
2. Failure attribution (which layer is earliest-wrong).
3. Smallest complete correction — implementation + user entry point + persistence, together.
4. Automated evidence (tests).
5. Native/manual evidence where the corrective prompt requires it.
6. Update this file's Status column and, where warranted, `PROJECT_STATUS.md`.
7. Commit, push, wait for required GitHub Actions jobs green before treating the ticket as closed.

Status values: `OPEN`, `IN_PROGRESS`, `BLOCKED` (state reason), `CLOSED` (commit hash + CI run).

## Ticket 1 progress note (2026-09-09)

Failure Attribution for FC-C05 found the earliest-wrong layer was **Persistence**, not Frontend integration: no settings storage of any kind existed (`crates/domain/src/store.rs`'s schema had a dedicated table per feature but nothing generic, and `TypographyPanel.tsx`/the sound-toggle hook were explicitly session-only). Landed so far, domain-first:

- `crates/domain/src/settings.rs` — generic `app_setting` key-value table (schema migration to `user_version = 9`) + `get_setting`/`set_setting`, with round-trip/overwrite/no-collision tests.
- `get_setting_command`/`set_setting_command` Tauri commands wired in `src-tauri/src/commands.rs` + `lib.rs`.
- `src/appSettings.ts` (frontend helper; named to avoid a case-insensitive-filesystem collision with `Settings.tsx`) + `src/Settings.tsx`: the first real Settings section, Appearance (theme mode: system/light/dark applied via `data-theme` + `prefers-color-scheme`; accent color applied via a `--accent-color` CSS variable), persisted and reloaded on mount.
- Reachable today via a `Settings` toggle button in `App.tsx`, following the same pattern as the existing Calendar/Data & Recovery sections -- this satisfies FC-C05's "user-reachable and persisted" for Appearance specifically, but is **not yet** FC-C06's top-level nav shell (Library/Notes/Calendar/Data/Settings as real hierarchical destinations, Search demoted to topbar/context). That IA restructuring touches ~20 existing `App.test.tsx` cases that assume the current flat section-toggle layout and is being done as its own follow-up commit within this same ticket rather than bundled here, per the corrective-pass prompt's "coherent, reviewable correction units" guidance.
- Still open within FC-C05 itself: the rest of the required settings list (reading-time policy toggles, Reading Checkpoint, typography defaults, sound/motion, default import mode, update-awareness preference, About & Updates) -- each is owned by its own later ticket (9-16) per the dependency table above, and will land inside this same `Settings.tsx` surface rather than inventing a second settings location.
- All Rust tests (155), all frontend tests (100), `tsc --noEmit`, and `vite build` are green as of this commit.

## Ticket 1 closure (2026-09-09, follow-up commit)

FC-C06 landed: `App.tsx` now has a real `<nav aria-label="Main">` with five destinations (Library/Notes/Calendar/Data/Settings), `aria-current="page"` on the active one, Library as the default so existing book-list behavior is unchanged, Search kept as an always-visible topbar section independent of destination (never a sixth nav item), and Reader/Bilingual unchanged as contextual overlays with no nav entry at all. All ~20 pre-existing `App.test.tsx` cases pass unmodified against the new structure (none of them depended on more than one section being visible simultaneously), plus 4 new tests asserting the real nav semantics (default destination, switching hides the previous panel, Search stays visible, Reader has no nav). 104 frontend tests, `tsc --noEmit`, `vite build` green. Ticket 1 is CLOSED for FC-C06 and for FC-C05's Appearance slice; the rest of FC-C05's required settings list remains explicitly open under tickets 9-16.

## Ticket 2 (FC-C01/FC-C02) — closed 2026-09-09

Failure Attribution found two different earliest-wrong layers, not one:

- **FC-C02 (Global Notes jump): Frontend integration only.** `ReadingAsset.anchor: Option<DocumentLocation>` was already fully persisted and tested in the domain layer, and already serialized straight through `list_all_reading_assets_command`/`list_reading_assets_command`. The gap was purely that `App.tsx`'s `ReadingAssetDTO` didn't expose `anchor` and the click handler didn't use it.
- **FC-C01 (Search jump): Persistence, then Frontend integration.** `search::SearchHit` and the FTS5 `search_index` table had no anchor column at all -- a real domain-layer gap, fixed first.

Landed:
- `crates/domain/src/search.rs`: `search_index` gains an `anchor_json` column (with a same-commit schema-upgrade path for a pre-existing table, since this is derived/rebuildable state, not a `user_version` migration); `index_text_with_anchor` (new) and `index_text` (unchanged signature, delegates with `None`); `SearchHit.anchor: Option<DocumentLocation>`; `rebuild_index` threads each reading asset's own anchor through.
- `create_reading_asset_command` now indexes with the asset's own anchor (closes the search-side half of Notes/Excerpts/Annotations being exact-jumpable, not just Global-Notes-side).
- `index_search_text_command` gained an `anchor: Option<DocumentLocation>` parameter.
- `Reader.tsx` (EPUB): indexes each section with foliate-js's own precomputed `sections[i].cfi` as a real anchor. `PdfReader.tsx`: indexes each page with the page number (the same scheme reading-position durability already used). `TxtReader.tsx`: switched from one whole-file index entry (no sub-position possible) to per-paragraph entries anchored at each paragraph's real character offset -- the smallest change that gives TXT a genuine, format-aware anchor rather than none.
- `Reader`/`PdfReader`/`TxtReader` each accept an `initialAnchor` prop that takes priority over the resume location on open; an anchor that fails to resolve (bad CFI, out-of-range page/offset) shows a truthful "Could not jump to the exact location" banner rather than silently landing on page one.
- `App.tsx`: `SearchHit`/`ReadingAssetDTO` gain `anchor`; `openBookAtLocation` (replacing `openSearchResultBook`) threads it through `pendingAnchor` state into whichever Reader opens. A `null` anchor (free-standing Note, or a hit with no finer location) opens the Book plainly -- correct, not a failure, since there was never a location to jump to.

160 Rust tests (5 new), 108 frontend tests (4 new), `tsc --noEmit`, `vite build`, `cargo build` (src-tauri) all green.

## Ticket 3 (FC-C04) — closed 2026-09-09 (`22afafc`, CI run 34402533583 success)

Failure Attribution: earliest-wrong layer was **Domain/data semantics**, then command/frontend reachability. The pre-existing `remove_book` operation fused three different product consequences: visible Library removal, canonical reading-data deletion, and Managed-Copy file deletion. Frontend ambiguity ("Remove") was a symptom, not the root.

Landed:
- `crates/domain/src/store.rs`: schema migration to `user_version = 10` adds `book.library_status`; `remove_from_library` hides a Book from the visible Library without deleting `book_file`, Reference source bytes, Managed-Copy bytes, or reading data; `delete_reading_data` removes book-scoped reading/user data while keeping the Book and file binding; `delete_managed_copy_file` deletes only app-managed file bytes and rejects Reference-mode Books.
- `remove_book` remains as a backward-compatible domain wrapper for Remove-from-Library semantics, so old callers no longer delete Managed-Copy bytes implicitly.
- `src-tauri/src/commands.rs` + `lib.rs`: added `delete_reading_data_command` and `delete_managed_copy_file_command`; `remove_book_command` now maps to Remove from Library only.
- `src/App.tsx`: Library rows expose three truthful actions: `Remove from Library`, `Delete Reading Data`, and `Delete Managed-Copy File` only for Managed-Copy Books. Each action requires an explicit `window.confirm` whose text names the consequence and file/data boundary; Reference source files have no default deletion affordance.

Evidence:
- TDD red signal: `cargo test -p ebookreader-domain destructive_library_operations_are_separated_by_domain_consequence` initially failed because `remove_from_library`, `delete_reading_data`, and `delete_managed_copy_file` did not exist.
- Domain verification: `cargo test -p ebookreader-domain` passed (160 passed, 2 ignored).
- Frontend verification: `npm test` passed (19 files, 111 tests); App tests cover labels, confirmations, cancellation, and Managed-Copy-only file deletion affordance.
- Static/build verification: `npm run typecheck`, `npm run build`, and `cargo build --manifest-path src-tauri\Cargo.toml` passed.
- GitHub Actions: CI run 34402533583 passed on `22afafc` (Frontend and Rust jobs green).
