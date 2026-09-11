# EbookReader V1 Product Specification

Status: **Frozen V1 Product / Domain Contract**


This document defines V1 product behavior. Implementation details may change during M0 and later engineering, but agents must not silently change these semantics.

## Canonical Authority

This file is the sole canonical owner of V1 product/domain semantics.

Other documents may summarize or reference these rules but must not redefine them.

If another document conflicts with `PRODUCT_SPEC.md` on product/domain behavior, `PRODUCT_SPEC.md` wins unless an explicit admitted product change updates this contract.

## Frozen Contract Change Control

Frozen V1 semantics may not be silently changed because an implementation is difficult.

If implementation evidence indicates that a frozen requirement is infeasible, harmful, or incompatible with another admitted requirement:

1. stop the affected implementation path;
2. attribute the failure to the earliest incorrect layer;
3. escalate the conflict;
4. update this contract only through explicit product admission.

Do not store current Milestone status, CI state, temporary technical progress, or execution-state facts in this file.

---

## 1. Product Identity

EbookReader is a Windows-first, local-first personal reading workspace for ordinary electronic-book readers.

The product combines:

- reading;
- personal library management;
- reading assets;
- normalized reading workload;
- factual reading-time history;
- recovery and portability.

It is not a cloud reader, social platform, generic PDF editor, or AI assistant.

---

## 2. Primary User

The primary V1 user is an ordinary personal e-book reader.

Foreign-language and bilingual readers are important secondary users, but the product is not designed exclusively as a language-learning tool.

No account is required for core use.

---

## 3. Product Invariants

The following are product-level invariants.

### 3.1 Local-first

Core reading, library access, notes, progress, OCR, search, Book Hours, and backup/restore must work without an account or cloud service.

The only planned V1 network exception is optional update awareness.

### 3.2 Original files are not silently modified

Reference-mode books remain user-owned files in their original location.

Managed-Copy books are application-managed copies.

Neither mode gives the application permission to silently rewrite the user's source file.

### 3.3 User-authored assets are canonical user data

At minimum:

- Notes;
- Excerpts;
- Annotations;
- manual OCR corrections;
- reading history;
- completed-read overrides;
- Book Hours configuration/history;
- Collections/Tags;
- Alignment Packages;
- settings.

Search indexes and raw OCR caches are derived/rebuildable state.

### 3.4 User-corrected metadata wins

Automatically detected metadata may be suggested, but user corrections must not be silently overwritten later.

### 3.5 File identity is not path identity

Cryptographic fingerprint is the durable file-identity signal.

- moved/renamed path + same fingerprint → same file binding;
- changed fingerprint → explicit replacement/migration workflow;
- path/name similarity alone must not silently inherit reading assets.

### 3.6 Book Hours and Actual Reading Time are independent

Expected workload is not factual historical duration.

Neither may silently rewrite the other.

### 3.7 Font availability is not redistribution permission

A font being usable on the user's machine does not imply that EbookReader may redistribute that font file.

Only fonts with verified redistribution permission may ship as built-in product assets.

---

## 4. Core Domain Model

### 4.1 Book

A `Book` is one independent library reading unit.

Examples:

- an English edition of *The Little Prince* = one Book;
- a Chinese edition = another Book.

V1 does not require an abstract literary Work/Edition hierarchy.

A future version may add related-book grouping if evidence justifies it.

### 4.2 BookFile

`BookFile` represents the concrete disk file associated with a Book.

Important properties include:

- path;
- cryptographic fingerprint;
- format;
- ownership mode;
- availability/relink state.

`Book != BookFile`.

### 4.3 Collection

A user-controlled grouping of Books.

A Book may belong to multiple Collections. Collection aggregates may overlap since Books can appear in several Collections simultaneously.

### 4.4 Tag

A generic descriptive label for search and organization. Tags do not drive Book Hours or workload calculations.

### 4.5 ReadingProfile

A Book belongs to at most one Reading Profile (1:1 or 1:0).

A Reading Profile replaces the legacy concept of Book-Hours tags/categories and owns:

- shared difficulty coefficient (e.g. Textbook 2.4, Novel 1.0, Research Paper 2.8, Poem 0.7);
- preferred baseline reading speed and quantity unit defaults;
- descriptive notes and planning metadata.

Profile-level updates only affect Books assigned to that Profile. If a Book has no assigned Profile, it uses the global fallback defaults.

### 4.6 DocumentLocation

A unified location envelope with format-specific anchors.

It must support:

- durable progress;
- annotation return;
- search-result jump;
- OCR location mapping;
- bilingual alignment navigation.

M0 must validate anchor stability before architecture lock.

### 4.7 Annotation

A visual/source-bound marking or highlight.

It is anchored through `DocumentLocation`.

### 4.8 Excerpt

A user-intentionally collected source passage.

It is anchored to the source and may include user metadata.

### 4.9 Note

User-authored text.

A Note may be source-anchored or free-standing within a Book.

### 4.10 ReadingSession

A factual reading-activity record.

The persistence layer should preserve enough raw activity categories to keep historical facts explainable even if user policy changes.

At minimum, the system should be able to distinguish relevant foreground/reading, note-taking, background, and idle intervals.

### 4.11 Reading completion state

V1 product semantics require:

- `completed_read_count >= 0`;
- an active-read progress state from 0–100 when a new read is in progress;
- no inferred new read from arbitrary backtracking.

A separate historical `ReadingPass` table is an implementation option, not a V1 product requirement. M0/architecture may adopt one if it materially simplifies integrity and migration.

### 4.12 AlignmentPackage

A mapping between two independent Books.

The package contains mappings, source/target fingerprints, anchors, and provenance needed to validate and navigate the relationship.

It must not require duplicating full book contents.

---

## 5. Import & File Ownership

V1 supports:

### Reference

- keep source file where the user owns it;
- store path + fingerprint + metadata;
- missing path enters Needs Relink;
- App Data Backup stores reference metadata, not source bytes by default.

### Managed Copy

- copy the book into EbookReader-managed storage;
- the managed copy may be included in Full Library Backup;
- deletion semantics must distinguish library removal, reading-data deletion, and managed-file deletion.

Default V1 import mode: **Reference**.

### Duplicate import

If an imported file fingerprint already exists:

```text
This book already exists.

[Open Existing]
[Relink Existing Book]
[Cancel]
```

Do not silently create a duplicate Book.

Same title/author with different fingerprint remains eligible to become a separate Book.

---

## 6. Supported Formats

V1 accepts:

- reflowable EPUB;
- fixed-layout EPUB where the chosen engine supports it;
- text PDF;
- scanned/image PDF;
- TXT.

Capabilities differ by format.

See `FORMAT_CAPABILITY_MATRIX.md`.

---

## 7. Reading Experience

### 7.1 Reader modes

Where supported by the format/renderer:

- continuous scroll;
- single-page/paged;
- double-page.

### 7.2 Reader structure

Normal Reader:

- optional left Contents panel;
- central reading surface;
- optional right Notebook;
- compact reader chrome.

Focus Reading:

- side panels glide away;
- reading content dominates;
- minimal chrome.

### 7.3 Page sound and motion

Optional page-turn sound and restrained motion are V1 features.

Sound and motion can be disabled/reduced.

No animation may alter semantics or block reading.

### 7.4 Typography

Reflowable EPUB and TXT provide reader typography controls.

Sources:

- `PUBLISHER` — publication-embedded/original style;
- `BUILT-IN` — verified redistributable fonts shipped with EbookReader;
- `SYSTEM` — fonts installed on the user's OS, invoked but not redistributed;
- `CUSTOM` — user-supplied local fonts.

V1 UI provides:

- Publisher / Original;
- curated recommended fonts;
- system-font browsing/search;
- custom local font import;
- font size;
- line height;
- page width;
- margins;
- optional CJK font override.

Ordinary PDF, scanned PDF, and fixed-layout EPUB do not pretend to support reflowable font-family controls.

---

## 8. Progress, Completion, and Re-reading

### 8.1 Completion trigger

Reaching the final page completes the current read.

Completion immediately:

- increments completed-read count;
- closes the current active read;
- produces a completion stamp.

Then prompt:

> You finished this Book. Start another read?

If Yes:

- create/start the next read;
- active progress becomes 0%.

If No:

- no new active read exists;
- UI remains at 100%;
- completed-read count remains incremented.

### 8.2 No rereading inference

Backtracking, chapter-jumping, search-jumping, or rereading a passage does not create a new read and does not increase cumulative reading percentage.

Only an explicit new read after a completed read participates in the recursive model.

### 8.3 Cumulative reading percentage

Frozen V1 algorithm:

```text
Cumulative Reading %
=
completed_read_count × 100
+
active_pass_progress
```

If no active new read exists:

```text
active_pass_progress = 0
```

for cumulative calculations.

### 8.4 Manual completed-read override

Data → Book Data allows the user to set any Book's completed-read count.

Examples:

- 0 → 1;
- 1 → 3;
- 3 → 0.

This action requires an explicit warning and confirmation.

Confirmed override semantics:

- set completed-read count to N;
- clear current active-read progress;
- show the Book as completed N times, or Not Started when N = 0;
- never fabricate ReadingSessions;
- never fabricate Actual Reading Time.

The system may record an audit/history event such as:

```text
Reading record manually adjusted: completed reads 1 → 3
```

It must not fabricate historical completion events.

---

## 9. Book Hours

### 9.1 Core Concept & Canonical Formula

Book Hours is EbookReader's planning model for estimating reading workload.

- **System-Calculated Only**: Planned Book Hours is always system-calculated from measurable inputs; users never directly enter or overwrite the Planned Book Hours number.
- **Canonical Formula**:
  ```text
  Planned Book Hours = (Quantity / Baseline Speed) × Difficulty Coefficient
  ```
- **Automatic Import Calculation**: When a Book is imported and sufficient measurable inputs exist (e.g. valid page count > 0), the system automatically calculates Planned Book Hours using global defaults or assigned Reading Profile defaults.
- **Completed-Equivalent Current Book Hours**:
  ```text
  Current Book Hours = Planned Book Hours × Cumulative Reading % / 100
  ```

### 9.2 Calculation Coverage & "Needs Setup" State

- A Book with missing required inputs (e.g. quantity unknown, speed ≤ 0) legitimately receives no Book Hours result and enters the **`Needs Setup` (`Not Calculated`)** state.
- Books in `Needs Setup` remain fully valid, readable Library Books; they are excluded from aggregate Book Hours sums rather than silently coerced to `0h`.
- Aggregates always expose explicit calculation coverage (e.g. `11 of 13 Books calculated` / `1 Needs setup`).

### 9.3 Reading Profiles & Collections Aggregation

- **Singular Profile Binding**: Each Book has at most one Reading Profile (1:1 or 1:0). Profiles partition Books cleanly for workload modeling.
- **Multiple Collections**: A Book may belong to multiple Collections.
- **Global vs Collection Aggregates**:
  - Global library totals deduplicate Books (each Book contributes once to library Planned/Current Book Hours).
  - Collection totals reflect the local workload of each collection and may overlap across collections.

### 9.4 Independence of Reading Facts

- Book Hours is strictly a planning model.
- Changing global formula defaults, updating Reading Profiles, or recalculating Book Hours across the library can adjust Planned and Current Book Hours, but **MUST NEVER ALTER**:
  - Reading progress percentage;
  - Current reading position / document location;
  - Completed-read count;
  - Actual Reading Time;
  - Historical `ReadingSession` records.
- Historical revision snapshots (`WorkloadConfigRevision`) are preserved for auditing and versioned tracking.

---

## 10. Actual Reading Time

V1 Settings exposes only a small policy surface:

- Track Actual Reading Time — default On;
- Pause When App Is in Background — default On;
- Auto-pause After 5 Minutes Inactivity — default On;
- Count Note-taking as Reading Time — default On.

OS lock/sleep always pauses.

V1 does not expose:

- arbitrary idle-timeout choices;
- maximum page-dwell caps;
- short-session discard controls;
- a separate search-time toggle.

ReadingSession stores facts; Settings decides which eligible facts count toward displayed Actual Reading Time.

---

## 11. Notes, Excerpts, and Annotations

Per Book:

- Notebook aggregates Annotation / Note / Excerpt;
- text selection exposes lightweight Highlight / Excerpt / Note actions;
- source-bound items retain jump-back location.

Global Notes:

- cross-book search;
- filter by asset type;
- open source Book at the relevant location.

Notebook export should support reader-friendly Markdown at minimum. Additional human-readable formats may be added within the frozen export contract if they do not create scope expansion.

If an anchor becomes unrecoverable:

- user-authored content is preserved;
- it may become Orphaned/Detached;
- location failure must not delete the user's thought.

---

## 12. Search

V1 includes:

### In-book Search

Search the current Book.

### Library-wide Search

Search across:

- supported book text;
- corrected OCR text;
- Note content;
- Excerpt content;
- user-authored annotation text/metadata.

No advanced query language is required.

Search index is derived state and must be rebuildable.

CJK search quality is an M0 feasibility question.

---

## 13. OCR

### 13.1 Product behavior

For scanned PDF:

- visual reading works without OCR;
- text-dependent features display a truthful degraded state;
- OCR is user-initiated;
- OCR is local-only;
- user chooses Current Page, Selected Pages, or Entire Book;
- page-range input and thumbnail selection are supported;
- jobs can pause/resume/cancel;
- successful completion has an explicit semantic success state;
- corrections are user data;
- raw OCR/cache is rebuildable.

### 13.2 Pre-OCR degraded state

Before OCR, do not pretend that:

- search text exists;
- word count exists;
- text selection/highlight works;
- text-bound excerpt/annotation is available.

### 13.3 Backend status

OCR backend: **Open until M0 evidence**.

M0 should prioritize a document-OCR workload:

- recognition accuracy;
- reading order;
- bounding boxes;
- searchable/selectable layer quality;
- excerpt extraction;
- annotation jump-back;
- processing time/page;
- memory;
- cancel/resume behavior.

Development may reuse existing local model/runtime assets to avoid unnecessary re-downloads. The released application must not depend on another product being installed.

---

## 14. Bilingual Reading

V1 accepts an external Alignment Package.

UI:

- two reading panes;
- optional synchronized navigation;
- swap sides;
- alignment status inspection;
- independent Book data on each side.

Alignment mismatch may be surfaced as a review/status condition.

V1 does not provide alignment authoring, mapping drag/drop, or sentence re-segmentation tools.

---

## 15. Calendar & Goals

V1 keeps this intentionally narrow.

Primary metrics:

- Planned Book Hours;
- Actual Reading Time.

Calendar shows plan vs actual reading activity.

V1 does not become a complex habit/gamification system.

---

## 16. Backup, Restore, and Recovery

### 16.1 Automatic Recovery Snapshot

Created before high-risk app-data operations such as:

- schema migration;
- restore;
- major destructive library mutation.

Exact retention policy may be selected during implementation/hardening.

### 16.2 App Data Backup

Contains canonical app/user data such as:

- library metadata;
- Collections/Tags;
- progress/completion state;
- ReadingSessions;
- Notes/Excerpts/Annotations;
- Book Hours configuration/history;
- OCR corrections;
- Alignment Packages;
- settings.

Reference-mode source bytes are excluded by default.

### 16.3 Full Library Backup

Contains:

- App Data Backup contents;
- Managed-Copy book files;
- optionally, explicitly selected Reference source files.

### 16.4 Restore

Stable V1 requires real Restore.

Restore must:

- preview archive timestamp/version/contents;
- create or use a recovery safety mechanism before replacement;
- never silently overwrite reference source files;
- surface Needs Relink where necessary;
- be verified through real tests/manual QA.

---

## 17. Update Awareness

V1 includes update awareness modeled on a stable-release checker.

Behavior:

- optional automatic startup check;
- manual Check Now;
- stable release channel only;
- draft/prerelease ignored;
- current and latest version display;
- release notes/download entry when update exists;
- graceful offline/check-failure state;
- check must not block the main UI.

V1 explicitly does not include:

- silent auto-install;
- forced update;
- self-replacing executable;
- mandatory connectivity.

---

## 18. UI Contract

See `DESIGN.md`.

Canonical prototype:

`docs/design/EbookReader_UI_Prototype_v0_5.html`

UI implementation must preserve:

- Quiet Surface, Living Motion;
- low-noise Library;
- central Reader;
- contextual Book/OCR/Bilingual workflows;
- data-safety semantics;
- constrained theme customization;
- format-aware controls;
- visible completion/success/error/degraded states.

---

## 19. V1 Deferred / Non-Goals

- built-in generative AI;
- cloud accounts;
- cloud sync;
- social reading;
- mind maps / knowledge graphs;
- Alignment Editor;
- full PDF editing;
- arbitrary rereading-coverage inference;
- advanced query language;
- silent auto-updater;
- cross-device library synchronization;
- complex habit/gamification features;
- abstract Work/Edition graph unless later evidence requires it.
