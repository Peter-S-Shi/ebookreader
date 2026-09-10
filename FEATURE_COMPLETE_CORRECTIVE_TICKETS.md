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
| 9 | FC-C07 — Reference-file picker for Full Library Backup + inclusion/exclusion tests | CLOSED (`c3b02eb`, CI run 34414736330 success) | 1 (lives under Data) |
| 10 | FC-C08 — Non-blocking startup update check + user preference to disable it | CLOSED (`6a65420`, CI run 34415666414 success) | 1 (preference lives in Settings) |
| 11 | FC-A05 — Book Hours configuration UI + revision history | CLOSED (`135a7ff`, CI run 34416801485 success) | 1 |
| 12 | FC-A06 — Actual Reading Time: background-pause, 5-min inactivity, note-taking-counts + Settings toggles | CLOSED (`bed54ba`, CI run 34417941868 success) | 1 |
| 13 | FC-A07 — Recovery snapshot before schema migration and before destructive mutations (remove_book, etc.) | CLOSED (`6281332`, CI run 34419014285 success) | — |
| 14 | FC-A08 — Typography: BUILT_IN fonts, CUSTOM import, CJK override, margins, persisted global default + per-book override | CLOSED (`0809325`, CI run 34432012895 success) | 1 |
| 15 | FC-A09 — Persist sound toggle + reduced-motion in-app override; confirm reachable UI control | CLOSED (`a4c0c62`, CI run 34432709301 success) | 1 |
| 16 | FC-A10 — Reading Checkpoint: default-Off preference + session-end reflection prompt | CLOSED (`ffd761d`, CI run 34433233529 success) | 1 |
| 17 | FC-A11 — Book Details view + Continue Reading section + Book Hours/Actual Reading Time presentation | CLOSED (`6bf6f56`, CI run 34476328787 success) | — |
| 18 | FC-A14 — Close Backup/Restore completeness: ReadingSessions + Alignment Package round-trip tests; Collections/Tags round trip once ticket 6 lands; verify Reference-file round trip once ticket 9 lands | CLOSED (`ffc3072`, CI run 34477080424 success) | 6, 9 |

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

## Ticket 9 (FC-C07) — closed 2026-09-09 (`c3b02eb`, CI run 34414736330 success)

Failure Attribution: earliest-wrong layer was **Frontend integration**, cleanly -- the domain layer was already complete and correct. `crates/domain/src/backup.rs`'s `create_full_library_backup(..., extra_reference_files: &[PathBuf], ...)` already namespaces explicitly-passed Reference files under `reference/` in the archive, and `restore()` already correctly never extracts a `reference/` entry back over the user's file (SS16.4 "never silently overwrite reference source files"). The entire gap was `src/DataRecovery.tsx:60-64` (per the original audit) hardcoding `extraReferenceFiles: []` -- the capability existed but had zero UI entry point.

Landed:
- `src/DataRecovery.tsx`: "Choose Reference Files to Include…" loads the Library's Reference-mode Books (Managed-Copy books excluded from this list -- their files are already unconditionally included) and lets the user check which to include; Create Full Library Backup passes the checked paths.
- `crates/domain/src/backup.rs`: added 3 tests the correct-but-unproven domain function was missing -- exclusion by default, inclusion of only explicitly-selected files (with a real byte round-trip through the archive), and confirmation that restore never overwrites the original Reference file at its own path.

Evidence:
- Domain verification: `cargo test -p ebookreader-domain --lib` passed (179 passed, 2 ignored; was 176 after Ticket 8).
- `cargo build` and `cargo test` in `src-tauri` passed (no backend changes this ticket -- the command surface already threaded `extra_reference_files` through correctly).
- Frontend verification: `npx tsc --noEmit` passed; `npx vitest run` passed (19 files, 127 tests -- 2 new tests in `DataRecovery.test.tsx`'s new "Full Library Backup Reference-file opt-in" describe block: default-exclusion, opt-in-only-what-was-checked). `npx vite build` passed.
- GitHub Actions: CI run 34414736330 passed on `c3b02eb` (Frontend and Rust jobs green).

## Ticket 10 (FC-C08) — closed 2026-09-09 (`6a65420`, CI run 34415666414 success)

Failure Attribution: earliest-wrong layer was **Frontend integration**, with the domain-adjacent check logic already correct. `updateAwareness.ts`'s `checkForUpdate`/`compareVersions` were already right (per the original audit); the gap was purely that nothing ever called it at startup, and there was no preference to disable it because nothing existed to gate in the first place.

Landed:
- `crates/domain/src/settings.rs`: new key `keys::UPDATE_CHECK_ON_STARTUP`, reusing the existing generic `app_setting` store from FC-C05 -- no new migration needed.
- `src/appSettings.ts`: `DEFAULT_UPDATE_CHECK_ON_STARTUP = true` (unset means "not yet chosen", not "off" -- SS17 describes the startup check as included V1 behavior) plus `loadUpdateCheckOnStartupPreference`/`saveUpdateCheckOnStartupPreference`.
- `src/Settings.tsx`: an "Update Awareness" section with the "Check for updates on startup" checkbox.
- `src/App.tsx`: on mount, reads the preference and only if enabled calls `checkForUpdate` without blocking render (SS17 "check must not block the main UI"); a dismissible banner appears only when an update is actually available, not for up-to-date/check-failed.
- `src/updateAwareness.ts`: hoisted `REPO_OWNER`/`REPO_NAME`/`CURRENT_VERSION` here from `DataRecovery.tsx` so the manual "Check Now" and the new startup check share one source.

Evidence:
- Domain verification: `cargo test -p ebookreader-domain --lib` passed (179 passed, 2 ignored -- unchanged from Ticket 9; the new key reuses already-tested generic get/set, so no redundant test was added for it).
- `cargo build` and `cargo test` in `src-tauri` passed (no backend command surface changes -- `get_setting_command`/`set_setting_command` already existed).
- Frontend verification: `npx tsc --noEmit` passed; `npx vitest run` passed (19 files, 131 tests -- 4 new tests in `App.test.tsx`'s new "Startup Update Awareness check" describe block: preference off skips the check with zero `fetch` calls; an available update shows the banner with a working release-notes link; up-to-date shows no banner and does not block the Library from rendering; Dismiss hides the banner). Getting this right required routing the new mount-time `get_setting_command` call (keyed specifically on `update_awareness.check_on_startup`, not the whole command, since the Settings-destination test already exercises `get_setting_command` for other keys) through its own mock defaulted to disabled, so none of the 40 pre-existing tests needed editing and none triggered a real `fetch`. `npx vite build` passed.
- GitHub Actions: CI run 34415666414 passed on `6a65420` (Frontend and Rust jobs green).

## Ticket 11 (FC-A05) — closed 2026-09-09 (`135a7ff`, CI run 34416801485 success)

Failure Attribution: earliest-wrong layer was **Persistence**, not just Frontend integration -- matching the user's original correction that not every remaining gap is frontend-only. `book_hours.rs`'s own module comment admitted the deferral explicitly: workload config only ever overwrote in place, with no revision table, and its doc comment said a full per-revision history was out of scope for the milestone that built it. `PRODUCT_SPEC.md` SS9.3 ("versioned/explainable" + "preserve the relevant estimate snapshot/revision") is a real, unmet persistence requirement, compounded by zero UI ever calling the existing `get_book_hours_command`/`save_workload_config_command`.

Landed:
- `crates/domain/src/store.rs`: migration v13 adds append-only `workload_config_revision`; `delete_reading_data` now clears it alongside `workload_config`.
- `crates/domain/src/book_hours.rs`: `save_workload_config` takes a `recorded_at` timestamp and appends a revision on every save (the current-config row is still overwritten in place; only the history is append-only); new `list_workload_config_revisions`.
- `src-tauri/src/commands.rs` + `lib.rs`: `save_workload_config_command` threads the timestamp; new `list_workload_config_revisions_command`.
- `src/App.tsx`: a "Book Hours" section inside the existing per-Book Organize panel -- current Base/Cumulative estimate (or "Not configured yet"), editable Quantity/Baseline Speed/Difficulty Coefficient, and the full revision history underneath.

Evidence:
- Domain verification: `cargo test -p ebookreader-domain --lib` passed (181 passed, 2 ignored; was 179 after Ticket 10). 4 new tests: revision append-not-overwrite, empty-history-before-first-save, plus the existing canonical-asset backup/restore round-trip test extended to prove the revision history itself survives backup/restore (not just the current config).
- `cargo build` (both crates) and `cargo test` in `src-tauri` passed.
- Frontend verification: `npx tsc --noEmit` passed; `npx vitest run` passed (19 files, 134 tests -- 3 new tests in `App.test.tsx`'s new "Book Hours configuration + revision history" describe block: unconfigured state, displaying estimate + history, saving records a revision and refreshes the estimate). `npx vite build` passed.
- GitHub Actions: CI run 34416801485 passed on `135a7ff` (Frontend and Rust jobs green).

## Ticket 12 (FC-A06) — closed 2026-09-09 (`bed54ba`, CI run 34417941868 success)

Failure Attribution: earliest-wrong layer was **Domain/application**, explicitly documented as such by the code itself -- `actual_reading_time.rs`'s own module doc named the exact residual before this ticket: "the other three Settings policies SS10 names ... need window-focus and user-input-idle detection this checkpoint does not yet build ... V1 currently *undercounts pauses*." This was never a hidden gap, but it was a real undercount, not only a missing Settings UI -- so the fix had to add real ReadingSession facts (background/inactivity pause reasons, note-taking duration) before a Settings toggle could mean anything.

Landed:
- `crates/domain/src/reading_session.rs`: `PauseKind`/`SessionState` gain `Background`/`Inactivity`, handled by the same exact event-driven pause/resume machinery as the existing Locked/Suspended kinds. Note-taking is modeled as an independent fact (`start_note_taking`/`stop_note_taking`/`total_note_taking`) rather than a pause reason, since it can span a concurrent, unrelated pause.
- `crates/domain/src/settings.rs`: 4 new keys under `actual_reading_time.*`, all default On per SS10.
- `src-tauri/src/commands.rs` + `lib.rs`: `pause_reading_session_command`/`resume_reading_session_command` (app-driven, as opposed to the native Win32 hook's direct calls) and `start_note_taking_command`/`stop_note_taking_command`; `reading_session_status_command` now also reports `total_note_taking_ms`.
- `src/appSettings.ts`: generic `loadBooleanSetting`/`saveBooleanSetting` (anything other than exactly "true"/"false" resolves to the caller's default rather than being coerced to off) plus the 4 keys/defaults.
- `src/Settings.tsx`: an "Actual Reading Time" section with SS10's own four labels.
- `src/useActualReadingTimeHeartbeat.ts`: reads all four policies on mount, starting from their On defaults so an immediate mount/unmount still flushes a tick instead of racing the settings load; wires `window` blur/focus to background pause/resume; a real last-activity timestamp to the frozen 5-minute inactivity auto-pause (not a heuristic window); nets out note-taking duration from recorded active time when that policy is off.
- `src/NotebookPanel.tsx`: starts/stops note-taking tracking on mount/unmount.

Evidence:
- Domain verification: `cargo test -p ebookreader-domain --lib` passed (188 passed, 2 ignored; was 181 after Ticket 11). 8 new tests in `reading_session.rs`: both new pause kinds round-trip through resume, note-taking starts-empty/accumulates-across-cycles/redundant-start-is-a-no-op/stop-when-not-tracking-is-a-no-op/is-independent-of-concurrent-pause-state.
- `cargo build` (both crates) and `cargo test` in `src-tauri` passed.
- Frontend verification: `npx tsc --noEmit` passed; `npx vitest run` passed (19 files, 146 tests -- 9 new: 6 in `useActualReadingTimeHeartbeat.test.ts` (blur/focus pause-resume and its off-policy skip, 5-minute auto-pause plus activity-triggered resume and its off-policy skip, note-taking exclusion under both settings values), 5 in `Settings.test.tsx` (all-default-On, one persisted-off value doesn't affect the others, three persist-on-toggle cases), 1 in `NotebookPanel.test.tsx` (start/stop calls on mount/unmount). Getting the heartbeat tests right required routing the new mount-time `get_setting_command` calls and `pause_reading_session_command`/`resume_reading_session_command`/`start_note_taking_command`/`stop_note_taking_command` calls without disturbing the 3 pre-existing heartbeat tests' call-order assumptions -- solved by starting the heartbeat's policy variables from their SS10 defaults synchronously and only correcting them once the settings-load promise resolves, so no existing test needed editing. `npx vite build` passed.
- GitHub Actions: CI run 34417941868 passed on `bed54ba` (Frontend and Rust jobs green).

## Ticket 13 (FC-A07) — closed 2026-09-09 (`6281332`, CI run 34419014285 success)

Failure Attribution: earliest-wrong layer was **application/domain data protection**, not frontend. `PRODUCT_SPEC.md` SS16.1 requires Automatic Recovery Snapshots before high-risk app-data operations: schema migration, restore, and major destructive library mutation. Restore already created a snapshot correctly in `backup.rs`; startup migration and the genuinely irreversible post-FC-C04 destructive mutations did not. The inherited ticket wording named `remove_book`, but after FC-C04 that command is only Remove-from-Library semantics and no longer deletes reading data or file bytes. The actual destructive operations are `delete_reading_data_command` and `delete_managed_copy_file_command`.

Landed:
- `crates/domain/src/backup.rs`: `create_recovery_snapshot(db_path, snapshot_dir, label, unique, keep_last)` copies the live SQLite file into bounded retained recovery snapshots, and is a no-op on a fresh install with no database file yet.
- `src-tauri/src/db.rs`: app-level snapshot path resolution and `open_app_db()` pre-migration snapshot (`pre-migration`) before opening/migrating the database.
- `src-tauri/src/commands.rs`: `delete_reading_data_command` and `delete_managed_copy_file_command` now snapshot first (`pre-destructive-mutation`) before mutating data/file bindings.

Evidence:
- Domain verification: 4 new recovery-snapshot tests cover byte-copy semantics, immutability after later live-file mutation, retention pruning, and fresh-install no-op behavior.
- GitHub Actions: CI run 34419014285 passed on `6281332` (Frontend and Rust jobs green).

## Ticket 14 (FC-A08) — closed 2026-09-09 (`0809325`, CI run 34432012895 success)

Failure Attribution: earliest-wrong layer was **frontend application-state/persistence modeling**, not domain storage -- the generic `app_setting` key-value store (already built for FC-C05 Appearance) and `SYSTEM` font enumeration (`list_system_fonts_command`) both already existed and needed no changes. The gap was that `TypographySettings` modeled a font as a bare nullable string with no provenance, no path for a CUSTOM import, no CJK override slot, no Margins field, and was session-only (no persistence at all, global or per-book) -- an application-layer data-modeling gap, confirmed by the fact that closing it required zero new Rust/schema work.

Landed:
- `src/typography.ts`: `TypographyFont` is now a tagged union (`PUBLISHER`/`BUILT_IN`/`SYSTEM`/`CUSTOM`) carrying its own provenance (`PRODUCT_SPEC.md` SS3.7/SS7.4); PUBLISHER never emits a font-family rule; CUSTOM/BUILT_IN emit an `@font-face` referencing the local path directly rather than copying bytes into app storage (`ARCHITECTURE.md` SS14: "V1 defaults to storing configuration/reference rather than treating unknown font bytes as portable product assets" -- a prior, already-settled licensing decision). `marginPercent` and an independent CJK font layer onto the primary family rather than replacing it. `serializeTypographySettings`/`deserializeTypographySettings` give the model a stable persisted JSON form, defaulting safely on stale/corrupt data. `toTextStyle` gives TXT the same model TXT previously hand-rolled a subset of.
- `src/appSettings.ts`: `loadGlobalTypography`/`saveGlobalTypography` (Settings) and `loadPerBookTypography`/`savePerBookTypography` (Reader, falling back to the global default when no per-book override is recorded), all built on the existing generic `app_setting` store.
- `src/TypographyPanel.tsx`: Font Source select (Built-in/System/Custom grouped under Publisher/Original), "Import Custom Font" via the native file picker, a CJK Font Override select, a Margins slider; a new `showHeader` prop lets Settings embed the same panel inline instead of as a floating dialog (`DESIGN.md` SS8: "Global defaults live in Settings -> Typography. Per-Book overrides live in Reader `Aa`" -- one shared component, two hosting contexts).
- `src/Settings.tsx`: a "Typography" section hosting the panel against the global default.
- `src/Reader.tsx` / `src/TxtReader.tsx`: load the per-book override (or global fallback) on open; persist on every change.

Evidence:
- No Rust changes this ticket; `cargo test -p ebookreader-domain --lib` (191 passed, 2 ignored) and `cargo build`/`cargo test` in `src-tauri` re-verified as an unaffected-surface sanity check, all green.
- Frontend verification: `npx tsc --noEmit` passed; `npx vitest run` passed (20 files, 160 tests -- new/updated coverage across `typography.test.ts` (provenance-aware CSS including CUSTOM `@font-face` and CJK layering, serialize/deserialize round-trip and corrupt-data fallback, `toTextStyle`), `appSettings.test.ts` (global load/save, per-book-override-present vs falls-back-to-global in both directions), `TypographyPanel.test.tsx` (provenance labeling, CJK override, Margins, Custom Font import), and `Settings.test.tsx` (persisted global typography display and persisting a change)). `npx vite build` passed.
- GitHub Actions: CI run 34432012895 passed on `0809325` (Frontend and Rust jobs green).

## Ticket 15 (FC-A09) — closed 2026-09-09 (`a4c0c62`, CI run 34432709301 success)

Failure Attribution: earliest-wrong layer was **frontend persistence/reachability**, not domain storage -- sound playback and the OS `prefers-reduced-motion` query were already real; the toggle was session-only (`useSoundToggle` always started from a hardcoded `true`) and there was no in-app way to additionally request reduced motion, only the OS signal.

Landed:
- `src/appSettings.ts`: `SOUND_PAGE_TURN_ENABLED_KEY`/`REDUCED_MOTION_KEY` on the existing generic store; `applyMotionPreference`/`loadAndApplyMotionPreference` set/clear a `data-motion="reduced"` document attribute.
- `src/App.css`: the panel-reveal animation and toolbar transition now require both the OS `prefers-reduced-motion: no-preference` and the absence of `[data-motion="reduced"]` -- the app setting can only ever request additional reduced motion, never force motion back on over the OS's own preference (`MANUAL_QA.md` QA-UI-04).
- `src/useSoundToggle.ts`: loads the persisted preference on mount, saves on toggle.
- `src/Settings.tsx`: a "Sound & Motion" section (Page Turn Sound checkbox, Standard/Reduced radio group).
- `src/App.tsx`: applies Reduced Motion on mount, not only when Settings happens to be visited, so a persisted choice is actually reachable/effective from the moment the app opens.

Evidence:
- No Rust changes; `cargo test -p ebookreader-domain --lib` (191 passed, 2 ignored) re-verified as an unaffected-surface sanity check.
- Frontend verification: `npx tsc --noEmit` passed; `npx vitest run` passed (20 files, 166 tests -- 2 new tests in `useSoundToggle.test.ts`, 4 new in `Settings.test.tsx`, 1 new in `App.test.tsx` proving mount-time reachability without visiting Settings). `npx vite build` passed.
- GitHub Actions: CI run 34432709301 passed on `a4c0c62` (Frontend and Rust jobs green).

## Ticket 16 (FC-A10) — closed 2026-09-10 (`ffd761d`, CI run 34433233529 success)

Failure Attribution: earliest-wrong layer was **product surface** -- genuinely `MISSING`, not a wiring gap. `DESIGN.md` SS20 and `PRODUCT_SPEC.md` SS15 describe a default-Off, minimal session-end reflection prompt on Reader exit; no hook, no dialog, and no preference existed anywhere. `PRODUCT_SPEC.md` SS15 explicitly scopes this as "V1 does not become a complex habit/gamification system," so the correction deliberately reused existing Notebook persistence (`create_reading_asset_command`) rather than inventing new schema.

Landed:
- `src/appSettings.ts`: `READING_CHECKPOINT_ENABLED_KEY`, default Off, on the existing generic store.
- `src/useReadingCheckpoint.ts` (new): `requestBack(onBack)`/`dismiss()`/`showPrompt` -- pass-through (instant `onBack`) when the setting is off; withholds `onBack` until the prompt is dismissed when on.
- `src/ReadingCheckpointPrompt.tsx` (new): reuses `CompletionPrompt`'s dialog pattern; a reflection textarea with Skip/Save & Continue; an empty reflection just dismisses without saving.
- `src/Reader.tsx` / `src/PdfReader.tsx` / `src/TxtReader.tsx`: each Reader's "Back to Library" now routes through `checkpoint.requestBack(onBack)`; a saved reflection is written as a Note via the already-existing `create_reading_asset_command`.
- `src/Settings.tsx`: a "Reading Checkpoint" section with the toggle.

Evidence:
- No Rust changes; `cargo test -p ebookreader-domain --lib` re-verified as an unaffected-surface sanity check, green.
- Frontend verification: `npx tsc --noEmit` passed; `npx vitest run` passed (new tests in `useReadingCheckpoint.test.ts`, `ReadingCheckpointPrompt.test.tsx`, and `Settings.test.tsx`'s new "Reading Checkpoint" describe block: default-Off, loads a persisted On value, persists turning it on). `npx vite build` passed.
- GitHub Actions: CI run 34433233529 passed on `ffd761d` (Frontend and Rust jobs green).

## Ticket 17 (FC-A11) — closed 2026-09-10 (`6bf6f56`, CI run 34476328787 success; implementation `2edc641`)

Failure Attribution: earliest-wrong layer was split. **Persistence**: `book.last_opened_at` did not exist, so "Continue Reading" (`DESIGN.md` SS4/ER-BOOK-001) had no recency signal to rank by -- a genuine domain gap. **Frontend integration**: `get_reading_progress_command`/`get_actual_reading_time_command`/`get_book_hours_command` already existed and were already correct; no Book Details view ever called them, and the accepted v0.5 UI prototype (`docs/design/EbookReader_UI_Prototype_v0_5.html`) composition was never implemented.

Landed:
- `crates/domain/src/store.rs`: migration v14 adds `book.last_opened_at`; `record_book_opened(conn, book_id, opened_at)`; `BookSummary`/`list_books`/`get_book` expose it.
- `src-tauri/src/commands.rs` + `lib.rs`: `record_book_opened_command`.
- `src/useRecordBookOpened.ts` (new): records once per Reader mount.
- `src/BookDetails.tsx` (new): Reading / Book Hours / Library & File cards plus a Quick actions aside (Read/Resume, Open Notebook), reusing the accepted v0.5 prototype composition.
- `src/App.tsx`: `BookSummary` gains `last_opened_at`; a "Details" action per Book row; a client-side "Continue Reading" list -- top-10 `last_opened_at`-recency candidates filtered to `active_read_in_progress === true` via `get_reading_progress_command`, capped at 3 per `DESIGN.md`'s "1-3 items."

Evidence:
- Domain verification: `cargo test -p ebookreader-domain --lib` passed (2 new tests: never-opened has no `last_opened_at`, record-and-re-record updates in place). `cargo build`/`cargo test` in `src-tauri` passed.
- Frontend verification: `npx tsc --noEmit` passed; `npx vitest run` passed (`BookDetails.test.tsx` new; `App.test.tsx`'s new "Book Details + Continue Reading" describe block: Details<->Back navigation, ranks an active in-progress Book and omits a never-opened one, no section when nothing is in progress). `npx vite build` passed.
- The implementation commit (`2edc641`) initially failed CI on the Frontend job: a pre-existing (Ticket 14-inherited) flaky test in `Settings.test.tsx` raced `TypographyPanel`'s own async `list_system_fonts_command` fetch. Fixed in a follow-up commit (`6bf6f56`) by waiting for the option to exist, scoped to the Font Source select (the same option text also appears in the CJK Font Override select).
- GitHub Actions: CI run 34433923348 failed (Frontend) on `2edc641`; CI run 34476328787 passed on `6bf6f56` (Frontend and Rust jobs green).

## Ticket 18 (FC-A14) — closed 2026-09-10 (`ffc3072`, CI run 34477080424 success)

Failure Attribution: earliest-wrong layer was **test evidence**, not persistence or wiring -- both `ActualReadingTime` (`crates/domain/src/actual_reading_time.rs`) and `AlignmentPackage` (`crates/domain/src/alignment.rs`) already had real, working domain persistence (proven by their own unit tests) and were already included in every App Data Backup by construction, since `backup.rs` copies the canonical SQLite file itself rather than hand-rolling a per-table export. What was missing was a test proving each specific category actually survives a real backup -> restore cycle, as `MANUAL_QA.md` QA-BACK-04 requires ("ReadingSessions" and "Alignment" among what a Clean Restore must verify). Collections/Tags and Reference-file round trips were already proven under Tickets 6 and 9 respectively, per this ticket's own dependency notes -- no further work was needed for those two.

Landed:
- `crates/domain/src/backup.rs`: extended the existing `canonical_user_assets_survive_a_real_backup_and_restore_round_trip` test to also seed a second Book (`book-2`, for the Alignment Package's second side), a real `ActualReadingTime` via `save_actual_reading_time`, and a real `AlignmentPackage` via `alignment::import_package`; after restore, asserts the reading-time total and the alignment package's book pairing/mappings all survive intact.

Evidence:
- Domain verification: `cargo test -p ebookreader-domain --lib` passed (193 passed, 2 ignored -- no new test count increase since this extends one existing test rather than adding new ones, per the ticket's own framing).
- `cargo build` and `cargo test` in `src-tauri` passed (no backend/command changes this ticket -- purely a domain-test-coverage correction).
- No frontend changes this ticket.
- GitHub Actions: CI run 34477080424 passed on `ffc3072` (Frontend and Rust jobs green).

## Post-Ticket-18 reconciliation finding (2026-09-10): FC-C05 is not actually fully closed

All 18 originally-listed tickets are CLOSED, but before writing the second Feature Complete Candidate package, this reconciliation pass re-read `FEATURE_COMPLETE_REQUIREMENT_COVERAGE_AUDIT.md`'s FC-C05 row against current production source rather than trusting the ticket table's own "owned by tickets 9-16" claim. Ticket 1's original closure note (2026-09-09) listed FC-C05's full required settings list as: reading-time policy toggles, Reading Checkpoint, typography defaults, sound/motion, **default import mode**, update-awareness preference, **About & Updates**. Tickets 9-16 as actually executed covered the first five and update-awareness, but never built a default-import-mode setting or an About & Updates Settings section -- confirmed by grep: `src/App.tsx:346` hardcodes `ownershipMode: "reference"` on every import with no user-facing override; `src/Settings.tsx` has no About/version section (version + manual update check exist only under Data -> Update Awareness, an M8-era surface, not Settings). This is a genuine tracking gap in the original ticket list, not a new requirement -- so it is added as two new tickets rather than silently folded into Ticket 18's closure.

| # | Ticket | Status | Depends on |
|---|---|---|---|
| 19 | FC-A15 — Default import mode setting (Reference vs Managed-Copy), applied to future imports | OPEN | 1 |
| 20 | FC-A16 — About & Updates Settings section (version, manual update check, release notes link) | OPEN | 1, 10 |

Per the corrective-pass protocol, these follow the same per-ticket loop as tickets 1-18. Only once FC-A15 and FC-A16 are also CLOSED and the coverage audit shows zero `MISSING`/`PARTIAL`/`BACKEND_ONLY`/`PROTOTYPE_ONLY` rows does the second Feature Complete Candidate package get produced, followed by a HARD STOP for Human Feature Freeze review -- no self-promotion into Feature Freeze or M9 Product Hardening.
