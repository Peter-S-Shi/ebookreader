# Feature Complete Corrective Pass — Ordered Ticket List

Written: 2026-09-09. Source: `FEATURE_COMPLETE_REQUIREMENT_COVERAGE_AUDIT.md`. This file tracks status only; requirement detail lives in the audit and in `EbookReader_Feature_Complete_Corrective_Pass_CC_Prompt_2026-09-09.md` (local prompt-drafts, not committed).

Ordering rationale: foundational shells first (Settings surface + navigation, since ~6 later tickets need a place to put a toggle), then shared plumbing (DocumentLocation threading serves both search and notes jump), then the rest in roughly dependency order. Two items (FC-A12, FC-A13) are already closed and carry no ticket.

| # | Ticket | Status | Depends on |
|---|---|---|---|
| 1 | FC-C05/C06 — Settings surface + top-level nav shell (Library/Notes/Calendar/Data/Settings; Reader stays contextual; Search demoted to topbar/context) | CLOSED (nav shell + Appearance) — remaining FC-C05 setting groups tracked under tickets 9-16 | — |
| 2 | FC-C01/C02 — DocumentLocation-carrying search hits + notes assets; exact-jump from Search and Global Notes into Reader | CLOSED | — |
| 3 | FC-C04 — Split "Remove" into Remove from Library / Delete Reading Data / delete Managed-Copy, each labeled + confirmed | CLOSED (`22afafc`, CI run 34402533583 success) | — |
| 4 | FC-C03 — Book Data completed-read override UI wired to existing `override_completed_reads_command` | CLOSED (`2de37bc`, CI run 34403600204 success) | 1 (lives under Data) |
| 5 | FC-A03 — Duplicate-fingerprint 3-choice dialog ([Open Existing]/[Relink Existing Book]/[Cancel]) | CLOSED (`bb3ac72`, CI run 34410909121 success) | — |
| 6 | FC-A01 — Collections and Tags: schema, commands, Library UI, backup inclusion | CLOSED (`c54ea86`, CI run 34412338912 success) | — |
| 7 | FC-A02 — Metadata editing UI + user-correction precedence | CLOSED (`df4e570`, CI run 34413175475 success) | — |
| 8 | FC-A04 — Notebook Markdown export | CLOSED (`dc4eb4d`, CI run 34414007149 success) | — |
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

## Ticket 4 (FC-C03) — closed 2026-09-09 (`2de37bc`, CI run 34403600204 success)

Failure Attribution: earliest-wrong layer was **Frontend integration / user reachability**. The domain model and Tauri command already existed: `ReadingProgress::manual_override` sets `completed_read_count`, clears active progress, and has no path to ReadingSession or Actual Reading Time; `override_completed_reads_command` loads/saves that progress only. The gap was that Data -> Book Data had no UI call site and no required warning copy.

Landed:
- `src/DataRecovery.tsx`: added a Book Data section under the canonical Data/Recovery surface. It loads Library books via `list_library_command`, exposes one non-negative completed-read input per Book, and calls `override_completed_reads_command` only after warning confirmation.
- Confirmation text names the required consequences: active progress is cleared; Actual Reading Time stays unchanged; ReadingSession history stays unchanged.
- The command result is surfaced as a status message, so the user can see the applied completed-read count.

Evidence:
- TDD red signal: `npm test -- DataRecovery.test.tsx` initially failed because `Load Book Data` / override UI did not exist.
- Frontend verification: `npm test -- DataRecovery.test.tsx` passed (8 tests), then `npm test` passed (19 files, 113 tests).
- Domain verification: `cargo test -p ebookreader-domain` passed (161 passed, 2 ignored), including existing manual-override domain tests.
- Static/build verification: `npm run typecheck`, `npm run build`, and `cargo build --manifest-path src-tauri\Cargo.toml` passed.
- GitHub Actions: CI run 34403600204 passed on `2de37bc` (Frontend and Rust jobs green).

## Ticket 5 (FC-A03) — closed 2026-09-09 (`bb3ac72`, CI run 34410909121 success)

Failure Attribution: earliest-wrong layer was the **domain contract**, not just the frontend. `store::import_book_internal` conflated duplicate *detection* with duplicate *resolution*: on a fingerprint match against an active Library entry it silently returned the existing `book_id` and, on the Managed-Copy/path-update branch, silently overwrote the existing Book's title and stored path -- a caller had no way to learn a duplicate had even occurred, so no frontend fix alone could have produced the frozen 3-choice dialog (`PRODUCT_SPEC.md` "Duplicate import"). `App.tsx`'s `importBook()` also had no dialog, but that gap was downstream of the missing domain signal. The existing `relink_book_file` / `relink_book_command` (built for "Needs Relink" repair) already implemented exactly what "Relink Existing Book" requires -- Failure Attribution found it was simply never called from this flow.

Landed:
- `crates/domain/src/store.rs`: new `ImportOutcome { Imported(String), DuplicateFound { book_id, title } }`. `import_book_internal` returns `DuplicateFound` without mutating anything when the match is against an *active* Library entry. Re-importing a fingerprint whose Book was previously removed from the Library (`remove_from_library`) is unaffected -- that is a legitimate restore, not the "already active" duplicate case FC-A03 governs, and still resolves straight to `Imported`.
- `src-tauri/src/commands.rs`: `import_book_command` now returns a serde-tagged `ImportBookResult` (`{kind:"imported",...}` / `{kind:"duplicate",...}`) instead of a bare `book_id` string, so the frontend can tell the two outcomes apart.
- `src/App.tsx`: `importBook()` shows a `role="dialog" aria-label="Duplicate Book"` panel with the frozen copy ("This book already exists.") and three buttons. Open Existing reuses the existing `openBookAtLocation` flow (anchor `null`, same as opening a Book plainly). Relink Existing Book calls the already-implemented `relink_book_command` with the existing `book_id` and the just-picked file's path (fingerprints already match by construction, so this always succeeds). Cancel discards the picked file and does nothing.

Evidence:
- Domain verification: `cargo test -p ebookreader-domain --lib` passed (162 passed, 2 ignored) -- includes 2 new/rewritten tests: `reimporting_the_same_fingerprint_does_not_create_a_second_book` (now asserts `DuplicateFound`, not a silently-resolved id) and new `reimporting_the_same_fingerprint_while_active_does_not_mutate_the_existing_book`; `reimporting_a_removed_book_restores_the_existing_library_entry` updated to assert `Imported` for the legitimate restore path.
- `cargo build` (both `ebookreader-domain` and `src-tauri`) passed; `cargo test` in `src-tauri` passed (0 unit tests there by design -- command logic is covered via the domain crate's tests and frontend integration tests).
- Frontend verification: `npx tsc --noEmit` passed; `npx vitest run` passed (19 files, 117 tests, including 4 new tests in `src/App.test.tsx`'s new "Duplicate Fingerprint" describe block: dialog appears with all three choices and does not itself refresh the Library; Open Existing opens the existing Book; Relink Existing Book calls `relink_book_command` with the picked path and refreshes; Cancel dismisses with no side effects). `npx vite build` passed.
- GitHub Actions: CI run 34410909121 passed on `bb3ac72` (Frontend and Rust jobs green).

## Ticket 6 (FC-A01) — closed 2026-09-09 (`c54ea86`, CI run 34412338912 success)

Failure Attribution: earliest-wrong layer was the **domain model** itself -- not a wiring gap. `PRODUCT_SPEC.md` SS3.3 lists Collections/Tags as canonical user data alongside Notes/Excerpts/Book Hours, and SS4.3/4.4 define them as first-class domain concepts, but zero schema, zero domain function, zero command, and zero UI existed anywhere in the codebase (confirmed by the original audit's `grep` finding zero matches). This is `MISSING`, not `IMPLEMENTED_BACKEND_ONLY`/`PARTIAL` -- there was no smaller fix available than building the full vertical slice.

Landed:
- `crates/domain/src/store.rs`: migration v11 adds `collection`, `book_collection` (Book<->Collection membership), `tag`, and `book_tag` (Book<->Tag application) tables.
- `crates/domain/src/collections.rs` (new module): `create_collection`/`rename_collection`/`delete_collection`/`list_collections`; `add_book_to_collection`/`remove_book_from_collection` (idempotent set membership, not a log)/`list_book_ids_in_collection`/`list_collections_for_book`; `add_tag_to_book` (get-or-create by name)/`remove_tag_from_book`/`list_tags_for_book`. 8 new domain tests.
- `src-tauri/src/commands.rs` + `lib.rs`: 11 new Tauri commands (`create_collection_command`, `rename_collection_command`, `delete_collection_command`, `list_collections_command`, `add_book_to_collection_command`, `remove_book_from_collection_command`, `list_book_ids_in_collection_command`, `list_collections_for_book_command`, `add_tag_to_book_command`, `remove_tag_from_book_command`, `list_tags_for_book_command`) as thin adapters, matching the rest of `commands.rs`'s pattern.
- `src/App.tsx`: a "Collections" toolbar on the Library screen (create a Collection; filter the Book list to one Collection or "All"; delete a Collection without touching its member Books); a per-Book "Organize" panel, expanded on demand rather than loaded eagerly for every Book, showing/editing that Book's Collection memberships and Tags.
- Backup inclusion required no new backup code: `backup.rs` copies the canonical SQLite file itself (`ROADMAP.md` M8), so the new tables are automatically included. Extended the existing `canonical_user_assets_survive_a_real_backup_and_restore_round_trip` test to seed a Collection membership and a Tag and assert both survive backup/restore, so this is proven rather than merely inferred from architecture.

Evidence:
- Domain verification: `cargo test -p ebookreader-domain --lib` passed (170 passed, 2 ignored; was 162 before Ticket 5, 170 after Tickets 5+6's combined +8).
- `cargo build` (both crates) and `cargo test` in `src-tauri` passed.
- Frontend verification: `npx tsc --noEmit` passed; `npx vitest run` passed (19 files, 121 tests -- 4 new tests in a new "Collections and Tags" describe block: create-and-filter-option, filter-shows-only-members, delete-collection-preserves-books, Organize panel add/remove Collection membership and Tags). The mount-time `list_collections_command` call was routed through a separate `collectionsMock` in the test file's mock setup (with sane defaults set in `beforeEach`) specifically so the 34 pre-existing tests, written before Collections existed and relying on `invokeMock`'s call-order-based `mockResolvedValueOnce` queue, needed zero edits.
- GitHub Actions: CI run 34412338912 passed on `c54ea86` (Frontend and Rust jobs green).

## Ticket 7 (FC-A02) — closed 2026-09-09 (`df4e570`, CI run 34413175475 success)

Failure Attribution: earliest-wrong layer was split across two layers, and fixing only the more visible one would have created a new violation. The audit found "no edit UI, no re-detection path, so the invariant is vacuously true" -- true at the time, but Failure Attribution surfaced an actual live violation waiting to happen: `import_book_internal`'s remove-then-reimport restore path (landed under Ticket 5/FC-A03 review, pre-existing before that) unconditionally ran `UPDATE book SET ... title = ?1` with the freshly re-detected filename-derived title. The moment a title-editing UI existed, that path would silently overwrite a user's correction on the very next remove/reimport cycle -- an actual, not hypothetical, breach of `PRODUCT_SPEC.md` SS3.4. Both halves (the edit UI, and protecting edits from that overwrite) had to land together.

Landed:
- `crates/domain/src/store.rs`: migration v12 adds `book.title_user_edited` (defaults 0). New `update_book_title(conn, book_id, title)` sets the title and the flag. `import_book_internal`'s restore branch now checks the flag: if set, `library_status` is reactivated without touching `title`; if unset, the freshly-detected title still applies (an uncorrected title should still benefit from better detection later).
- `src-tauri/src/commands.rs` + `lib.rs`: `update_book_title_command`.
- `src/App.tsx`: inline "Edit Title" / Save Title / Cancel per Book in the Library list, using the same disclosure pattern as Organize.

Evidence:
- Domain verification: `cargo test -p ebookreader-domain --lib` passed (173 passed, 2 ignored; was 170 after Ticket 6). 3 new tests: title-edit round-trip; a corrected title survives remove-then-reimport; an *uncorrected* title still updates on reimport (proving the fix is precisely scoped to user corrections, not a blanket "never update title again").
- `cargo build` (both crates) and `cargo test` in `src-tauri` passed.
- Frontend verification: `npx tsc --noEmit` passed; `npx vitest run` passed (19 files, 123 tests -- 2 new tests: edit-and-refresh, Cancel-discards-draft-without-invoking-the-command). `npx vite build` passed.
- GitHub Actions: CI run 34413175475 passed on `df4e570` (Frontend and Rust jobs green).

## Ticket 8 (FC-A04) — closed 2026-09-09 (`dc4eb4d`, CI run 34414007149 success)

Failure Attribution: earliest-wrong layer was the **product surface** itself -- genuinely `MISSING`, not a wiring gap. The original audit's `grep` for `markdown`/`export` across production source found zero real hits (JS keyword noise only), confirming no domain function, no command, and no UI existed anywhere for `PRODUCT_SPEC.md` SS11's "Notebook export should support reader-friendly Markdown at minimum ... source Book/location included as designed."

Landed:
- `crates/domain/src/assets.rs`: pure `export_notebook_markdown(book_title, assets) -> String` (no I/O, directly testable) renders each asset as a Markdown section (kind heading + text), includes `_Location: {primary_anchor}_` when the asset has a source anchor, and marks Orphaned assets; an empty Notebook renders a truthful "no assets yet" message rather than a blank file. Added `AssetKind::display_label()` for the human-readable heading text.
- `src-tauri/src/commands.rs` + `lib.rs`: `export_notebook_markdown_command(book_id, dest_path)` loads the Book's title and its Notebook assets, renders the Markdown, and writes it to `dest_path`.
- `src/NotebookPanel.tsx`: "Export as Markdown" action, reusing the exact native save-dialog pattern `DataRecovery.tsx` already established for backup export (`@tauri-apps/plugin-dialog`'s `save()`), with a status line reporting the written path. `NotebookPanel` gained a required `bookTitle` prop (for the default export filename), threaded from `Reader.tsx`/`PdfReader.tsx`/`TxtReader.tsx`'s existing `title` prop.

Evidence:
- Domain verification: `cargo test -p ebookreader-domain --lib` passed (176 passed, 2 ignored; was 173 after Ticket 7). 3 new tests in `assets.rs`.
- `cargo build` (both crates) and `cargo test` in `src-tauri` passed.
- Frontend verification: `npx tsc --noEmit` passed; `npx vitest run` passed (19 files, 125 tests -- 2 new tests in `NotebookPanel.test.tsx`'s new "Markdown export" describe block: export writes to the chosen destination and reports it; cancelling the destination picker performs no export). `npx vite build` passed.
- GitHub Actions: CI run 34414007149 passed on `dc4eb4d` (Frontend and Rust jobs green).
