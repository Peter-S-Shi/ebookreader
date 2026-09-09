# Feature Complete Corrective Pass — Ordered Ticket List

Written: 2026-09-09. Source: `FEATURE_COMPLETE_REQUIREMENT_COVERAGE_AUDIT.md`. This file tracks status only; requirement detail lives in the audit and in `EbookReader_Feature_Complete_Corrective_Pass_CC_Prompt_2026-09-09.md` (local prompt-drafts, not committed).

Ordering rationale: foundational shells first (Settings surface + navigation, since ~6 later tickets need a place to put a toggle), then shared plumbing (DocumentLocation threading serves both search and notes jump), then the rest in roughly dependency order. Two items (FC-A12, FC-A13) are already closed and carry no ticket.

| # | Ticket | Status | Depends on |
|---|---|---|---|
| 1 | FC-C05/C06 — Settings surface + top-level nav shell (Library/Notes/Calendar/Data/Settings; Reader stays contextual; Search demoted to topbar/context) | IN_PROGRESS — see note | — |
| 2 | FC-C01/C02 — DocumentLocation-carrying search hits + notes assets; exact-jump from Search and Global Notes into Reader | OPEN | — |
| 3 | FC-C04 — Split "Remove" into Remove from Library / Delete Reading Data / delete Managed-Copy, each labeled + confirmed | OPEN | — |
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
