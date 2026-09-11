# EbookReader V1 Architecture

Status: **Accepted Architecture Baseline** — approved at the second Human Architecture Gate (2026-09-08, HEAD `5729bf4`)

See `M0_TECHNICAL_SPIKE_REPORT.md` and `M0_ARCHITECTURE_DECISION.md` for the M0 evidence and per-item decisions (including the corrective pass: a first Architecture Lock submission was declined and specific gaps were closed with new evidence — see both files' "Corrective" sections; the second submission was approved). This file's content below reflects the Accepted Architecture Baseline for M1–M8. Amendments still require reconciliation under the Architecture Promotion Rule below; Product-Contract Conflicts still require a Human Gate.


This document defines architectural boundaries and M0 decision gates. It intentionally does not claim that the final stack is already locked.

## Architecture Promotion Rule

Architecture state advances only through:

```text
Architecture Hypothesis
→ M0 Evidence
→ Architecture Decision
→ Accepted Architecture Baseline
```

M0 may invalidate the leading implementation hypothesis without changing frozen product semantics.

Later findings must first be classified as:

1. **Local Implementation Adjustment**
2. **Architecture Amendment**
3. **Product-Contract Conflict**

Local implementation adjustments do not require an authority change. Architecture Amendments must update this file and reconcile downstream execution documents. Product-Contract Conflicts must stop and escalate before implementation continues.

Architecture is not promoted from hypothesis to accepted state until M0 evidence passes the decision gate and a human explicitly accepts the lock.

---

## 1. Architecture Principle

> **Reuse document engines; own document semantics.**

EbookReader should not reimplement mature PDF/EPUB rendering engines.

The product should own the durable semantics that make the workspace trustworthy:

- Book identity;
- file ownership;
- DocumentLocation;
- reading progress/completion;
- ReadingSession;
- Notes/Excerpts/Annotations;
- Book Hours;
- OCR correction ownership;
- Alignment Packages;
- backup/restore;
- migration;
- update-awareness state.

---

## 2. Current Leading Hypothesis

The current leading implementation hypothesis is:

```text
Windows Desktop Shell
        ↓
React / TypeScript UI
        ↓
Application / Domain Services
        ↓
SQLite + local file storage
        ↓
Format adapters / workers
```

Likely candidate technologies:

- Tauri 2 desktop shell;
- React + TypeScript UI;
- Rust and/or TypeScript domain/application services;
- SQLite;
- SQLite FTS5 or another local index compatible with the final architecture;
- PDF.js or equivalent mature PDF renderer;
- Readium Web or foliate-js class EPUB renderer;
- isolated local OCR worker;
- Windows-safe file and update-awareness adapters.

This is a **hypothesis**, not a frozen stack.

M0 must compare evidence against at least credible alternatives such as Electron-class desktop shell and PySide6/Qt where necessary.

---

## 3. Architectural Layers

### 3.1 UI Layer

Responsibilities:

- visual composition;
- navigation;
- user input;
- format-aware controls;
- human-facing state;
- accepted motion/sound/theme behavior.

The UI must not become the source of truth for domain semantics.

### 3.2 Application Layer

Responsibilities:

- workflows;
- orchestration;
- command validation;
- transaction boundaries;
- background-job coordination;
- update-awareness coordination.

Examples:

- Import Book;
- Relink BookFile;
- Complete Read;
- Start Next Read;
- Adjust Completed Reads;
- Create Note/Excerpt/Annotation;
- Run OCR Job;
- Apply OCR Correction;
- Import Alignment Package;
- Create Backup;
- Preview Restore;
- Restore;
- Check for Update.

### 3.3 Domain Layer

Owns rules independent of renderer/framework.

Core concepts:

- Book;
- BookFile;
- Collection;
- Tag;
- WorkloadCategory;
- DocumentLocation;
- Annotation;
- Excerpt;
- Note;
- ReadingSession;
- completion/read state;
- BookHoursEstimateRevision;
- AlignmentPackage;
- backup metadata;
- user preferences.

### 3.4 Persistence Layer

Likely responsibilities:

- SQLite canonical state;
- transactions;
- schema migrations;
- user-asset persistence;
- derived-index persistence;
- backup snapshot coordination.

### 3.5 Document Adapter Layer

Format-specific adapters normalize renderer behavior into domain semantics.

```text
PDF Adapter
EPUB Adapter
TXT Adapter
OCR Adapter
```

Each adapter must translate between native positions and `DocumentLocation`.

### 3.6 Platform Layer

Windows-specific or desktop-shell-specific adapters:

- file picker;
- path watching/relink;
- managed library directories;
- font enumeration;
- app data paths;
- lock/sleep/focus signals;
- update awareness;
- packaging/install location;
- OS integration.

---

## 4. Domain Boundary: Book vs File

```text
Book
 └─ active BookFile binding
```

V1 does not require `BookEdition`.

A Book is the user-visible reading unit.

A BookFile is the concrete local file.

### Same fingerprint

Path changed, fingerprint unchanged:

- relink;
- preserve Book identity;
- preserve progress and reading assets.

### Changed fingerprint

Do not silently inherit.

Use explicit replacement/migration with possible states:

- Exact;
- Probable;
- Unresolved.

Low-confidence locations enter review/recovery workflow.

---

## 5. DocumentLocation

This is the highest-risk cross-format architecture seam.

Use a unified envelope plus format-specific anchors and fallbacks.

Conceptually:

```text
DocumentLocation {
    book_file_id
    format
    progression_hint
    primary_anchor
    fallback_anchors[]
    context_selector?
}
```

### EPUB

Candidates to validate:

- EPUB CFI;
- DOM/element path;
- text quote/context;
- progression.

### PDF

Candidates to validate:

- page index;
- page geometry/bounding box;
- text quote/context;
- normalized page position.

### TXT

Candidates to validate:

- normalized character offset;
- paragraph identity;
- text quote/context.

### OCR PDF

Candidates to validate:

- page index;
- OCR block/line/word geometry;
- corrected-text selector;
- original OCR selector/context.

`DocumentLocation` must not be based only on visual page number for reflowable content.

---

## 6. Reading State Architecture

Product semantics are frozen; storage shape may be selected during implementation.

Required canonical facts:

- completed-read count;
- whether an active new read exists;
- active progress;
- factual ReadingSessions;
- completion/manual-override history if needed for auditability.

Frozen algorithm:

```text
Cumulative Reading %
=
completed_read_count × 100
+
active_pass_progress
```

No inferred new pass from arbitrary jumping.

Manual completed-read override:

- confirmed destructive semantic adjustment;
- clears active progress;
- does not fabricate session/time history.

A separate `ReadingPass` record may be introduced if it improves data integrity, migration, or timeline capabilities. It is not required solely for conceptual neatness.

---

## 7. ReadingSession Architecture

Prefer preserving factual activity components rather than only a single opaque duration.

Potential factual components:

- foreground reader time;
- note/excerpt time;
- background time;
- idle time;
- OS lock/sleep boundary.

Derived displayed Actual Reading Time follows user policy.

V1 policy surface:

- master tracking;
- background pause;
- five-minute inactivity pause;
- note-taking inclusion.

OS lock/sleep always pauses.

Historical facts should remain explainable when Settings change.

**M0 finding (corrected in the M0 Corrective Evidence Pass):** Tauri exposes a native `WindowEvent::Focused(bool)` for foreground/background tracking, requiring no custom platform code. There is no dedicated OS sleep/lock window event, but a Win32 session-lock/power-broadcast hook (`WTSRegisterSessionNotification` + `WM_WTSSESSION_CHANGE` + `WM_POWERBROADCAST`, via the `windows` crate) was built and confirmed to produce exact pause/resume boundaries — this hook is **required V1 behavior**, not an optional enhancement, per the "OS lock/sleep always pauses" rule above. An earlier version of this finding proposed tolerating up to ~5 minutes of misattributed session time via the inactivity-timeout policy alone; that proposal was a self-approved frozen-semantic downgrade and has been retracted. The inactivity-timeout policy remains V1 only for genuine inactivity, which has no OS signal of its own. See `M0_TECHNICAL_SPIKE_REPORT.md` (M0-G) and `M0_ARCHITECTURE_DECISION.md` §10.

---

## 8. Book Hours Architecture

### 8.1 Model & Formula Architecture

Book Hours is EbookReader's reading workload planning system.

- **System-Calculated Formula**:
  ```text
  Planned Book Hours = (Quantity / Baseline Speed) × Difficulty Coefficient
  ```
  ```text
  Current Book Hours = Planned Book Hours × Cumulative Reading % / 100
  ```
- **Format-Appropriate Trustworthy Quantity Discovery**:
  - **PDF (fixed-layout)**: physical document page count (`pages`) is used when discoverable.
  - **Reflowable EPUB / TXT**: reliable word count (`words`) or character count (`characters`) when reliably extracted from document content/metadata. If quantity is unknown, the Book remains in `Needs Setup` (`Not Calculated`). The system never fabricates or invents a fictional page count for reflowable formats.
- **Automatic Import Calculation**: Newly imported Books with discoverable trustworthy quantity automatically receive Planned Book Hours using the default neutral profile or global fallback defaults.
- **Needs Setup State**: If required inputs are missing (Quantity is missing/zero, or Speed ≤ 0), the Book is marked `Needs Setup` (`Not Calculated`). It is excluded from aggregate Book Hours sums and tracked in explicit calculation coverage metrics (`11 of 13 Books calculated`).
- **Strictly Derived / Planning State**: Users never directly enter Planned Book Hours.

### 8.2 Database Schema & Migration Path

```sql
-- Reading Profiles table
CREATE TABLE reading_profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    difficulty_multiplier REAL NOT NULL DEFAULT 1.0,
    baseline_speed REAL NOT NULL DEFAULT 60.0,
    speed_unit TEXT NOT NULL DEFAULT 'pages', -- 'pages' | 'words' | 'characters'
    description TEXT NOT NULL DEFAULT '',
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Minimum neutral system fallback:
-- Only a single neutral default profile is seeded:
-- id: 'profile-default', name: 'Default', difficulty_multiplier: 1.0, baseline_speed: 60.0, speed_unit: 'pages', is_default: 1.
-- (Note: Demo profile names in Prototype v0.6 such as Textbook/Novel/Paper/Poem are illustrative UI examples and are not hardcoded into production architecture. User-authored Profiles are the intended model.)
```

- **Book Profile Binding**:
  - `books` table schema is updated with `profile_id TEXT REFERENCES reading_profiles(id)`, `workload_quantity REAL`, `workload_unit TEXT`, `workload_speed_override REAL`.
  - Every Book has at most one Reading Profile (1:1 or 1:0).
- **Lossless Legacy `workload_config` Migration**:
  - In the legacy schema, `workload_config` held a per-book `(quantity, baseline_speed, difficulty_coefficient)`.
  - In the V1 schema, difficulty is 100% owned by `reading_profiles`.
  - **Migration logic**:
    1. For books with default difficulty (1.0), migrate quantity to `books.workload_quantity` and set `books.profile_id = 'profile-default'`.
    2. For books with custom legacy `difficulty_coefficient != 1.0` (e.g. 1.1), migration creates an explicit user-visible `reading_profile` row (e.g. `Custom (1.1x)` with `difficulty_multiplier = 1.1`) and assigns `books.profile_id` to it.
    3. This guarantees that difficulty remains 100% Profile-owned in the domain model with zero hidden secondary multipliers, while preserving all existing user-configured coefficients and quantities losslessly.
    4. The legacy `workload_config_revision` table is preserved as an immutable audit snapshot history.
- **Legacy Tag Reconciliation**:
  - Collections are the multi-membership organization system; Reading Profiles are the singular workload classification system.
  - Legacy `tags` and `book_tags` database tables remain in SQLite as unindexed legacy rows to avoid destructive drops, but are removed from V1 product APIs, commands, and UI surfaces.

### 8.3 Aggregation & Deduplication

- **Global Library Totals**: Deduplicate Books. Each Book is counted exactly once toward Total Planned Book Hours, Current Book Hours, and Calculation Coverage (`calculated_count / total_count`).
- **Collection Breakdown**: Sums Books within each Collection. Since a Book may belong to multiple Collections, collection totals may overlap. Each Collection displays its local coverage (e.g. `5 of 6 Books`).
- **Profile Breakdown**: Sums Books assigned to each Profile. Since each Book has at most one Profile, profile totals partition calculated books cleanly.

### 8.4 Tauri IPC Command Layer

- `get_book_hours_overview()` -> `BookHoursOverviewDto` (global totals, profile summaries, collection summaries, coverage)
- `list_reading_profiles()` -> `Vec<ReadingProfileDto>`
- `save_reading_profile(profile)` -> `ReadingProfileDto`
- `delete_reading_profile(profile_id)` -> `Result<(), String>`
- `update_book_workload_setup(book_id, profile_id, quantity, unit, speed_override)` -> `BookWorkloadSetupDto`
- `get_global_book_hours_defaults()` -> `GlobalBookHoursDefaultsDto`
- `save_global_book_hours_defaults(defaults)` -> `GlobalBookHoursDefaultsDto`
- `preview_recalculation_impact(change_type, params)` -> `RecalculationImpactPreviewDto`

### 8.5 Non-Interference Safety Contract

- Book Hours domain logic is strictly isolated from `actual_reading_time`, `reading_sessions`, `reading_progress`, and `DocumentLocation`.
- Changing global defaults, editing Reading Profiles, or executing bulk recalculation recalculates only planning fields (`Planned Book Hours`, `Current Book Hours`); it **never modifies** reading progress %, reading position, completed reads, actual reading time, or `ReadingSession` history.

---

## 9. Notes / Excerpts / Annotations

Keep three domain entities.

All source-bound assets use `DocumentLocation`.

When re-anchoring fails:

- preserve asset;
- mark location as unresolved/orphaned;
- allow review/relink;
- never delete user-authored thought because a source moved.

Global Notes is a query/view across canonical per-book assets, not a duplicate storage system.

---

## 10. Search Architecture

Search index is derived state.

Requirements:

- in-book search;
- library-wide search;
- rebuild;
- corrected OCR text indexing;
- Note/Excerpt/annotation-user-text indexing.

M0 must test CJK quality and performance with the chosen local index.

If SQLite FTS5 is insufficient for the required CJK behavior, architecture may add a tokenizer/index adapter without changing the domain contract.

**M0 finding (Architecture Amendment):** SQLite FTS5's stock tokenizers are insufficient as-is. `unicode61` fails to match CJK substrings entirely; `trigram` matches correctly at 3+ characters but returns zero hits for 2-character CJK queries, which are the most common length for Chinese search terms. FTS5 remains the index engine, but a CJK segmentation/n-gram pre-processing adapter (word segmentation or bigram expansion at index time) is required in front of it. See `M0_TECHNICAL_SPIKE_REPORT.md` (M0-E) for evidence.

---

## 11. OCR Architecture

### 11.1 Separation

```text
Page Image
   ↓
Document OCR Worker
   ├─ text detection
   ├─ recognition
   ├─ bounding boxes
   ├─ reading order/layout
   └─ confidence/provenance
        ↓
OCR Artifact
        ↓
Search / selection / excerpt / annotation mapping
        ↓
User Correction Overlay
```

### 11.2 Data classes

**Derived / rebuildable**

- raw OCR text;
- detector/recognizer outputs;
- confidence;
- raw layout artifacts;
- search index.

**Canonical user data**

- manual corrections;
- correction-to-page/location mapping;
- user-created reading assets.

### 11.3 M0 backend rule

Do not choose the backend by generic OCR benchmark alone.

Validate document-page workload:

- English single column;
- Chinese single column;
- mixed CJK/Latin;
- multi-column;
- header/footer;
- image/caption;
- degraded scan.

Measure:

- recognition;
- reading order;
- box accuracy;
- searchable-layer usability;
- excerpt extraction;
- anchor/jump-back;
- time/page;
- memory;
- cancellation/resume.

Development may reuse existing local model/runtime assets to avoid duplicate downloads. Release packaging must be independent.

---

## 12. EPUB Architecture

M0 must compare at least the leading EPUB renderer candidates on:

- reflow;
- fixed layout;
- CFI/location support;
- pagination;
- continuous mode;
- dual-page mode;
- embedded fonts;
- publisher style override;
- system/custom fonts;
- CJK fallback;
- selection;
- annotations;
- search;
- large-book stability;
- Windows desktop embedding.

Do not lock a renderer from popularity alone.

---

## 13. PDF Architecture

Use a mature renderer.

M0 must verify:

- large files;
- text layer;
- selection;
- geometry;
- continuous/page modes;
- zoom/fit;
- scanned-page detection;
- rotation;
- search;
- page-render performance;
- OCR handoff;
- anchor persistence.

EbookReader does not become a full PDF editor.

---

## 14. Typography & Font Licensing Architecture

Font provider types:

```text
PUBLISHER
BUILT_IN
SYSTEM
CUSTOM
```

### PUBLISHER

Fonts embedded by a publication remain scoped to that publication.

Do not extract them into the global font library.

### BUILT_IN

Only verified redistributable fonts may ship in the installer.

Keep required license/notice files.

### SYSTEM

Enumerate/invoke fonts already installed on Windows.

Do not copy system font files into the product merely because they can be selected.

### CUSTOM

User-provided local font.

Do not silently:

- redistribute;
- embed in shared exports;
- treat as product-owned.

Backup behavior for custom font bytes requires an explicit licensing/product decision. V1 defaults to storing configuration/reference rather than treating unknown font bytes as portable product assets.

---

## 15. Backup / Restore Architecture

Separate:

- export;
- backup;
- restore;
- sync.

They are not synonyms.

### Automatic Recovery Snapshot

Safety checkpoint before high-risk app-data changes.

### App Data Backup

Canonical app/user data.

### Full Library Backup

App data + Managed-Copy book bytes + explicitly selected Reference bytes.

### Restore

Must:

- inspect/preview archive;
- validate version/schema;
- create safety snapshot before replacement;
- restore transactionally where possible;
- surface relink requirements;
- not silently overwrite external Reference files.

Restore is a release-critical workflow.

---

## 16. Update Awareness Architecture

V1 update awareness is allowed as a narrow network exception.

Required behavior:

```text
startup/manual trigger
→ background stable-release check
→ semantic version comparison
→ Up To Date / Update Available / Check Failed / No Stable Release Yet
→ optional release-page navigation
```

**M0 finding:** a repository with no releases yet returns a structured "not found" response, not a network error. The state model must distinguish this from `Check Failed` so a legitimately-empty release feed at V1 launch is never displayed as a failed check. See `M0_TECHNICAL_SPIKE_REPORT.md` (M0-I).

Rules:

- stable releases only;
- draft/prerelease ignored;
- short timeout;
- graceful failure;
- main UI never blocked;
- no forced update;
- no silent installer replacement.

The implementation should isolate network access in a small platform/application service so local reading remains independent.

---

## 17. UI Architecture

The accepted prototype is the design authority, not implementation code.

UI implementation must trace:

```text
DESIGN authority
→ concrete component/layout behavior
→ automated structural checks
→ native-window human visual acceptance
```

Automated tests cannot prove visual completion.

See `DESIGN.md`.

---

## 18. Error / Degraded-State Principle

Never represent missing capability as empty success.

Examples:

- scanned PDF without OCR → `Text unavailable · Run OCR`;
- missing reference file → `Needs Relink`;
- unresolved annotation → `Location unresolved`;
- failed update check → `Check Failed`, reading unaffected;
- missing search index → `Index unavailable / rebuild`;
- alignment mismatch → visible review/status state.

Truthful degraded states are preferable to silent fallback.

---

## 19. Migration Principle

Schema and domain migrations must protect canonical user data.

Before destructive/high-risk migrations:

- automatic recovery snapshot;
- migration validation;
- rollback/recovery plan;
- regression coverage.

Macro documentation must become truthful for the post-merge state **before** a merge-ready claim.

---

## 20. M0 Architecture Decision Gate

M0 must produce evidence and an ADR-style decision covering:

1. desktop shell;
2. domain/application language split;
3. SQLite/schema approach;
4. EPUB renderer;
5. PDF renderer;
6. DocumentLocation model;
7. CJK search/indexing;
8. OCR document workload;
9. local font enumeration/custom-font handling;
10. ReadingSession timing signals;
11. backup/restore feasibility;
12. update-awareness implementation path;
13. packaging implications.

No feature milestone should begin until M0 exits with an architecture lock and unresolved risks are explicitly classified.
