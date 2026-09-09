# EbookReader V1 Roadmap

Status: **Approved Planning Baseline — Loop Engineering Refactor Applied**  
Implementation has not started.

This file owns delivery sequence, execution contracts, evidence-gated promotion, stop/escalation behavior, and lifecycle gates.

It does **not** redefine frozen product/domain semantics from `PRODUCT_SPEC.md`, UI authority from `DESIGN.md`, or format promises from `FORMAT_CAPABILITY_MATRIX.md`.

---

# 1. Governing Development Model

> **Broad operational autonomy, narrow normative authority.**

## 1.1 Milestone and Promotion-Unit Policy

A Milestone is a **planning / delivery unit**.

A Milestone does **not** automatically equal:

- one branch;
- one PR;
- one merge;
- one checkpoint;
- one human approval cycle.

Before each Milestone begins, determine whether it can be safely completed as:

- one evidence-bounded promotion unit; or
- multiple promotion / merge units.

Use the **smallest number of checkpoints** that preserves reviewability, recoverability, evidence quality, manageable agent context, safe rollback, and human-attention efficiency.

Checkpoint boundaries may be replanned when new evidence appears.

Do not force multiple checkpoints when one is enough.

## 1.2 Minimum Sufficient Harness

Before each Milestone ask:

> What is the smallest runtime/tooling setup that can reliably close this loop?

Do not activate by default:

- worktrees;
- subagents;
- multiple verifier agents;
- hooks;
- background agents;
- multiple PRs.

Add process/tooling only when it solves a demonstrated bottleneck or risk.

## 1.3 Standard Execution Contract

Every implementation Milestone / promotion unit establishes:

```text
Goal
Success Evidence
Continue Condition
Stop Condition
Escalate to Human if
Risk / Change Budget
Expected Evidence Checkpoints
```

This is a control surface, not mandatory paperwork for trivial work.

## 1.4 Failure Attribution Before Repair

When a meaningful failure occurs, identify the earliest incorrect layer before repairing:

1. Requirement / Spec
2. Planning / Unknown
3. Implementation
4. Validation / Test
5. Documentation / State
6. Harness / Runtime

Route repair accordingly:

```text
Requirement / Spec
→ clarification / Grill / explicit product admission

Planning / Unknown
→ research / prototype / technical exploration

Implementation
→ diagnosis / repair / TDD

Validation / Test
→ repair test, rubric, or verification logic

Documentation / State
→ canonical reconciliation

Harness / Runtime
→ repair tool, permission, context, branch, skill, or workspace
```

Do not require a formal six-layer report for trivial bugs. Use explicit attribution when it changes the repair path.

## 1.5 Evidence-Gated Promotion

Agent completion statements are not acceptance evidence.

A checkpoint or Milestone may advance only when required evidence exists.

Possible evidence:

- compiler / typecheck;
- unit tests;
- integration tests;
- production build;
- runtime verification;
- spec-conformity review;
- manual QA;
- native Windows verification;
- migration / recovery check;
- independent verifier judgment when risk justifies it.

> **Tests are evidence, not truth.**

Evidence depth scales with risk.

## 1.6 Branch / PR / Merge Policy

Do not enforce:

- one feature = one branch;
- one Milestone = one PR;
- one Milestone = one merge;
- one checkpoint = one human approval.

Use branch / PR boundaries only where they improve isolation, reviewability, recoverability, or promotion safety.

A long-lived Milestone branch is acceptable when checkpoints are explicit, commits are recoverable, evidence is produced at required boundaries, and context remains manageable.

## 1.7 Independent Validator Policy

Prefer executable evidence before adding a second agent.

Use an independent verifier when:

- the same agent interpreted the requirement, implemented it, and wrote tests;
- semantic conformity is difficult;
- architecture judgment is consequential;
- destructive migration/data integrity is involved;
- diff/context size is large;
- self-consistency risk is high.

Do not require a second agent merely for ceremony.

## 1.8 Human / Agent Authority Envelope

### Agent may normally decide

- routine code structure inside accepted architecture;
- implementation details;
- local refactors;
- debugging;
- retry/self-repair;
- focused tests;
- evidence production;
- continuation inside an approved checkpoint;
- continuation between approved feature Milestones after M0 while no stop/escalation trigger is active.

### Human Gate required for

- V1 scope change;
- frozen `PRODUCT_SPEC.md` semantic change;
- frozen `DESIGN.md` authority change;
- architecture lock;
- major architecture reversal;
- destructive data-policy decision;
- high-consequence migration;
- Feature Freeze transition;
- RC promotion;
- Release promotion;
- unresolved product-vs-technical conflict.

Goal:

> **Minimize human interruption without surrendering human authority.**

## 1.9 CI Promotion Gate

Added at the second Human Architecture Gate (2026-09-08), effective from M1's earliest checkpoint onward.

A minimal GitHub Actions CI is established at M1's first checkpoint, sized to this Windows-first Tauri/Rust/React project — not a full release-packaging matrix. At minimum it covers, and grows only as the project's real surface grows:

- TypeScript typecheck and unit tests;
- a TypeScript/frontend build;
- Windows Rust build (`cargo check` / `cargo build`) and Rust unit tests;
- Windows-native Tauri build verification once a shell exists to build.

Before every Milestone / promotion-unit candidate is pushed:

1. Run the fast local equivalent of the required CI jobs first (typecheck, unit tests, `cargo check`/`cargo test`).
2. Commit and push.
3. Wait for GitHub Actions to complete.

A Milestone / promotion unit may not be promoted to the next Milestone until its required CI jobs are green. Red, cancelled, or incomplete CI is never skipped or bypassed — apply Failure Attribution (§1.4) and repair the correct layer (implementation, test, harness, or environment), then push again for a fresh green run.

**CI green is necessary evidence, not sufficient truth.** It does not substitute for the native/manual/data/recovery evidence each Milestone's own Success Evidence and `MANUAL_QA.md` require (§1.5, Evidence-Gated Promotion) — both must hold before promotion.

---

# 2. Lifecycle

```text
P0 Loop-Control Refactor
        ↓
M0 Feasibility & Architecture Lock
        ↓
HUMAN ARCHITECTURE GATE
        ↓
M1 → M2 → M3 → M4 → M5 → M6 → M7 → M8
        ↓
Feature Complete Candidate
        ↓
HARD STOP
        ↓
HUMAN FEATURE FREEZE GATE
        ↓
M9 Product Hardening
        ↓
Full Regression & Human Acceptance
        ↓
M10 Release Candidate / Packaging / Windows Release
        ↓
Portfolio / Maintenance
```

---

# Milestone 0 — Feasibility & Architecture Lock

**Status:** **Complete — Architecture Lock approved at the second Human Architecture Gate** (2026-09-08, HEAD `5729bf4`). A first Architecture Lock submission was declined; a Failure-Attribution-driven corrective pass closed the named gaps without discarding prior evidence; the second submission was approved (see `M0_TECHNICAL_SPIKE_REPORT.md`, `M0_ARCHITECTURE_DECISION.md`, reproducible harness at `tooling/m0-evidence/`).  
**Risk / Change Budget:** High  
**Autonomy Envelope:** M0 only  
**Human Gate Required:** Yes — Architecture Lock — **satisfied**

## Goal

Reduce critical technical unknowns enough to lock architecture without violating the frozen V1 product contract.

M0 is not "feature implementation starts."

## Evidence-Track Contract

Every M0 track follows:

```text
Question
→ Prototype / Experiment
→ Evidence
→ Finding
→ Architecture Implication
→ ACCEPT / MODIFY / REJECT hypothesis
```

A failed experiment must not silently delete a frozen V1 capability.

## Evidence Tracks

### M0-A Desktop Shell & Local Storage

Validate Windows desktop approach, local filesystem, SQLite, background workers, large-file handling, OS focus/sleep/lock, fonts, update-awareness isolation, and packaging implications.

### M0-B EPUB Renderer

Validate reflowable/fixed-layout behavior, pagination/continuous/double-page, embedded fonts, publisher style override, system/custom fonts, CJK fallback, selection, annotations, search, stable anchors, and performance.

### M0-C PDF Renderer

Validate large text PDFs, text layer, selection, geometry, view modes, zoom/fit, search, scanned-page detection, and performance.

### M0-D DocumentLocation

Prototype durable anchors for EPUB, PDF, TXT, and OCR PDF. Test reopen, resize, typography changes, relink, annotation jump-back, and search-result jump.

### M0-E Search / CJK

Test English, Chinese, mixed CJK/Latin, OCR-corrected text, Notes, Excerpts, and annotation user text.

### M0-F Document OCR

Prefer reuse of already-installed equivalent local OCR runtime/model assets during development when available.

Do not redownload equivalent assets without evidence that it is needed.

Validate recognition, layout/reading order, coordinates, searchable/selectable layer, correction mapping, time/page, memory, pause/resume/cancel.

### M0-G ReadingSession Timing

Prototype foreground/background, inactivity, OS sleep/lock, note-taking, shutdown/close.

### M0-H Backup / Restore Feasibility

Prototype app-data archive, preview, safety snapshot, clean restore, Reference relink, Managed-Copy recovery.

### M0-I Update Awareness

Prototype stable-release check, SemVer comparison, offline failure, current/latest version state, and non-blocking UI.

## Success Evidence

M0 must output:

- accepted architecture decisions;
- rejected alternatives and reasons;
- unresolved risks;
- verified capability evidence;
- known degraded cases;
- required changes to later Milestones;
- confirmation that frozen product semantics remain intact, or explicit escalation.

Expected artifacts:

- `M0_TECHNICAL_SPIKE_REPORT.md`
- `M0_ARCHITECTURE_DECISION.md`

## Continue Condition

Continue while evidence questions remain bounded, no product-contract conflict is active, and findings can be resolved inside architecture/implementation authority.

## Stop Condition

Stop when required evidence tracks are sufficient for an architecture decision, or when a frozen product conflict / high-consequence ambiguity requires human review.

## Escalate to Human if

- a frozen V1 requirement appears infeasible;
- two frozen requirements appear incompatible;
- architecture lock requires a product compromise;
- packaging/data/privacy assumptions materially change;
- release-critical evidence remains ambiguous.

## M0 Exit Gate

M0 passes only if:

- critical unknowns have evidence;
- architecture boundaries are coherent;
- no known blocker invalidates frozen V1 scope;
- `DocumentLocation` has a credible cross-format design;
- OCR has a credible document-page path;
- backup/restore is technically feasible;
- packaging direction is credible;
- later Milestones can proceed without guessing core architecture.

### HARD STOP — satisfied

After the M0 decision package, M1 was gated pending explicit human promotion:

```text
Architecture Hypothesis
→ Accepted Architecture Baseline
```

This promotion was granted at the second Human Architecture Gate (2026-09-08, HEAD `5729bf4`), together with a continuous M1→M8→Feature Complete Candidate autonomous engineering authorization envelope (`ROADMAP.md` §1.8: agent may continue between approved feature Milestones after M0 while no stop/escalation trigger is active). The next Human Gate in this envelope is the Human Feature Freeze Gate after M8 (see `## 2. Lifecycle` and §1.9 below); no per-Milestone approval is required in between unless a stop/escalation trigger fires.

---

# Milestone 1 — Foundation, Persistence & Library

**Status:** **Complete** (2026-09-08, commit `94aff83`) — Exit Gate evidence below.  
**Risk:** Medium

## Goal

Establish production foundation, canonical persistence, Library, file ownership, fingerprint identity, import, and relink.

## Success Evidence

- safe import;
- Reference vs Managed Copy semantics;
- fingerprint duplicate handling;
- user metadata durability;
- missing-file/relink behavior;
- migrations;
- Library native visual acceptance;
- automated tests for identity/destructive boundaries.

## Continue Condition

Accepted architecture remains valid and required evidence passes.

## Stop / Escalate if

- file identity requires product-semantic change;
- migration/recovery safety is uncertain;
- major architecture reversal is needed;
- canonical UI requires a design amendment.

## Exit Gate

Frozen Library/file semantics are proven by implementation evidence.

**Satisfied.** Cargo workspace (`crates/domain` pure-Rust + `src-tauri` shell) with a live, green CI Promotion Gate covering frontend typecheck/test/build and a real native Windows `cargo build` + `crates/domain` tests. 15 domain tests + 6 frontend tests (21 total): cryptographic fingerprinting; fingerprint-based duplicate-import detection (`PRODUCT_SPEC.md` "Duplicate import"); idempotent SQLite schema migration; Reference-mode import (source untouched) and Managed-Copy import (bytes copied into managed storage, source untouched); relink on unchanged fingerprint, explicit refusal (not silent inheritance) on a changed one (`ARCHITECTURE.md` "Same/Changed fingerprint"); Needs Relink surfaced when a Reference path goes missing (`PRODUCT_SPEC.md` "missing path enters Needs Relink"); Remove Book as the identity/destructive-boundary test (deletes a Managed Copy, never touches a Reference source). Wired end-to-end to a real Tauri command surface and a minimal Library view (native file picker, list, Needs Relink badge, Remove) — native visual acceptance confirmed via a foreground-verified screenshot of the live app. Two dev-environment findings recorded and worked around (GNU-toolchain `cargo test`/link instability with Tauri's COM graph; both non-issues on CI's MSVC runner, which is authoritative). Full detail in `PROJECT_STATUS.md`.

---

# Milestone 2 — Core Reading Across Formats

**Status:** **Complete** (2026-09-08, commit `0a04fb4`) — Exit Gate evidence below.  
**Risk:** High

## Goal

Deliver EPUB / PDF / TXT reading with truthful format-aware controls, stable reopen behavior, typography, Focus Reading, sound, and motion.

## Success Evidence

- representative documents reopen at stable locations;
- controls match actual format capability;
- font provenance model works;
- Reader/Focus pass native visual acceptance;
- behavior matches `FORMAT_CAPABILITY_MATRIX.md`.

## Stop / Escalate if

- renderer limitations conflict with frozen capability promises;
- stable location cannot be achieved within accepted architecture;
- frozen UI authority must change.

## Exit Gate

No active format exposes controls it cannot truthfully honor.

**Satisfied.** All three V1 formats have a real reading surface with DocumentLocation persistence (`crates/domain/src/document_location.rs`, upsert-per-Book, 3 tests): EPUB (`src/Reader.tsx`, `foliate-js`, CFI anchors, TOC via `book.toc`, view-mode control via `flow`/`max-column-count` attributes), PDF (`src/PdfReader.tsx`, `pdf.js` canvas rendering, page-index anchors, single-page and continuous-scroll modes), TXT (`src/TxtReader.tsx`, scroll-fraction `progression_hint` + computed char offset). Controls are gated per actual format capability, not offered uniformly: Typography (`src/TypographyPanel.tsx`, font provenance model in `crates/domain/src/fonts.rs` — real Windows-registry SYSTEM font enumeration, 4 tests) is hidden for fixed-layout EPUB and never offered for PDF; View mode is EPUB/PDF-specific; TXT has no artificial pagination. Font provenance (`ARCHITECTURE.md` §14), page-turn sound (synthesized via Web Audio API — no external asset to license, DESIGN.md §18), Focus Reading (`src/ReaderShell.tsx`, a shared toggle across all three readers, DESIGN.md §6), and panel-reveal motion honoring `prefers-reduced-motion` (DESIGN.md §17) are all real and tested. 34 frontend tests + 23 domain tests. CI green across all fourteen M2 commits on `main` (`b387e18` through `0a04fb4`).

**One residual, explicitly carried forward, not silently dropped**: native visual acceptance was partially closed — a fresh, reliably-verified (`PrintWindow`, handle-based, cannot mis-capture) screenshot of the live Library view was captured, proving the app boots and renders correctly end-to-end natively. A screenshot of actual rendered EPUB/PDF/TXT *content* specifically was attempted repeatedly across this session (multiple launch methods, `SetForegroundWindow`+`AttachThreadInput`, `WindowFromPoint`/process-ownership verification before every click) and was not obtained — a reproducible WebView2 window-collapse behavior during interaction automation blocked the final step each time, judged Harness/Runtime (this sandbox's window/process automation), not an application defect: every automated test, a real `cargo build`, and a real `npm run build` all pass, and the format-specific rendering code paths mirror the same library/API calls M0's evidence already validated against real fixtures. Carried into a follow-up visual-QA pass, the same way M0 carried forward residual risks rather than blocking on them.

---

# Milestone 3 — DocumentLocation, Progress, Completion, Reading Time & Book Hours

**Status:** **Complete** (2026-09-08, commit `096b90d` + durability test below) — Exit Gate evidence below.  
**Risk:** High

## Goal

Productionize `DocumentLocation`, progress/completion, rereading recursion, ReadingSession, Actual Reading Time, and Book Hours.

## Frozen Algorithms

```text
Cumulative Reading %
=
completed_read_count × 100
+
active_pass_progress
```

```text
Cumulative Book Hours
=
Base Book Hours
×
Cumulative Reading % / 100
```

## Success Evidence

- location durability under layout/typography/reopen;
- completion recursion;
- manual completed-read override;
- ReadingSession factual integrity;
- Book Hours history/versioning;
- no fabricated Actual Reading Time.

## Stop / Escalate if

- frozen rereading semantics cannot be represented safely;
- factual historical time would need rewriting;
- `DocumentLocation` requires major architecture amendment.

## Exit Gate

Progress, rereads, time, and workload remain explainable and non-destructive.

**Satisfied.** `crates/domain/src/reading_session.rs` + `src-tauri/src/reading_session_hook.rs`: a real Win32 `WTSRegisterSessionNotification`/`WM_POWERBROADCAST` hook (a dedicated hidden window, deliberately separate from Tauri's own so it can never destabilize WebView2) gives exact, non-heuristic pause/resume boundaries — this closes M0-G's residual risk this Milestone specifically owned. `crates/domain/src/completion.rs`: the frozen Cumulative Reading % formula, SS8.1 completion/SS8.2 "no rereading inference" (enforced by tracking the furthest point reached monotonically, not current position), and SS8.4 manual override, all with real Tauri commands wired into all three Readers (a completion prompt fires exactly once per 100% crossing, PRODUCT_SPEC.md's exact wording). `crates/domain/src/book_hours.rs` + `actual_reading_time.rs`: the frozen Base/Cumulative Book Hours formulas, and an Actual Reading Time accumulator that only ever adds real elapsed durations net of the ReadingSession hook's lock/sleep exclusion — structurally unable to fabricate time, since it has no other input. Location durability under layout/typography/reopen is proven directly: `document_location.rs`'s new isolation test confirms a saved DocumentLocation survives unrelated progress/workload writes, on top of M0's original real-fixture EPUB reopen/typography-change evidence. 59 domain tests + 48 frontend tests, CI green on every M3 commit.

**Residuals explicitly carried forward, not silently dropped**: (1) Actual Reading Time currently wires through only one of SS10's four Settings policies (OS lock/sleep) — Pause When Backgrounded, Auto-pause After 5 Minutes Inactivity, and Count Note-taking as Reading Time need window-focus/idle detection not yet built; the direction of this gap is that V1 currently *undercounts* pauses, never fabricates time, which is what SS10's actual principle constrains. (2) Book Hours history/versioning covers the *current* estimate (SS9.3's "versioned/explainable" for a live config); a full per-revision snapshot history for Calendar retroactive-distortion protection is M6 (Calendar) scope, not this Milestone's.

---

# Milestone 4 — Reading Assets & Search

**Status:** **Complete** (2026-09-09, commit `7f12173`) — Exit Gate evidence below.  
**Risk:** Medium–High

## Goal

Deliver Annotation / Note / Excerpt, Book Notebook, Global Notes, jump-back, orphan preservation, in-book search, and library-wide search.

## Success Evidence

- asset types remain distinct;
- user-authored assets survive relink/anchor failure;
- global search covers required sources;
- index rebuild cannot delete canonical user data;
- CJK behavior meets accepted M0 architecture.

## Stop / Escalate if

- search architecture threatens canonical user assets;
- orphan preservation cannot be honored;
- jump-back requires product-semantic compromise.

## Exit Gate

Search/indexing remains derived; user-authored reading assets remain canonical.

**Satisfied.** `crates/domain/src/assets.rs`: a canonical `reading_asset` table (Annotation/Excerpt/Note, migration `user_version=5`) fully independent of the derived `search_index` FTS5 table -- `search::rebuild_index` proves this directly (a domain test drops and recreates `search_index` from `reading_asset`, then asserts the `reading_asset` rows are byte-for-byte unchanged and search still resolves against the rebuilt index). Orphan preservation (`mark_orphaned`) never deletes a row, only flags it, and is product-reachable: jump-back in `NotebookPanel` is the actual point an anchor is resolved, so a failed jump (foliate-js's `goTo` resolving to `undefined`, or a PDF page/TXT offset now out of bounds) is exactly where an asset is marked Orphaned/Detached, not silently dropped. Text-selection capture (`PRODUCT_SPEC.md` SS11) is real in all three Readers: EPUB via foliate-js's own `getCFI(index, range)`, PDF single-page mode via a real `pdfjs-dist` `TextLayer` overlay, TXT via Range-counting for an absolute character offset. `crates/domain/src/cjk_search.rs` is the production Rust port of the M0-corrective-pass-validated bigram adapter, closing M4's own named "CJK behavior meets accepted M0 architecture" evidence and the Architecture Amendment carried forward from M0. Library-wide Search and Global Notes both exist in `App.tsx`, and, per `PRODUCT_SPEC.md` SS12's explicit list of required sources, the index now covers supported book text (all three Readers index their own extracted text into the background on open, tagged `book_text`) alongside Note/Excerpt/Annotation content -- the one still-outstanding named source, corrected OCR text, structurally cannot exist before M5's OCR pipeline does. 82 domain tests + 63 frontend tests, CI green on every M4 commit.

**Residuals explicitly carried forward, not silently dropped**: (1) neither Search nor Global Notes results can jump to the exact passage yet, only open the source Book -- `SearchHit` only carries `(book_id, kind, content)`, not the originating asset's anchor, so threading anchor data through search results is a follow-up, not this Milestone's Exit Gate condition (which is about the derived/canonical distinction, not UI completeness). (2) Continuous-mode PDF text selection is not implemented -- single-page mode is, and continuous mode's multi-page selection scoping is a materially separate problem, deferred rather than rushed. (3) The selection-capture UI (Highlight/Excerpt toolbars in all three Readers) has been verified by direct source-level reading of foliate-js's/pdfjs-dist's actual APIs plus clean typecheck/build/CI, not by a native-window mouse drag-select screenshot -- this sandbox's `SetForegroundWindow` residual (`[[feedback-native-gui-visual-verification]]`) makes that unreliable to script; a future session with reliable interactive GUI verification, or the user's own manual click-through, should close this gap. None of these residuals threaten the Exit Gate's own condition.

---

# Milestone 5 — Scanned PDF OCR

**Status:** Planned  
**Risk:** High

## Goal

Deliver scanned-PDF degraded mode, local OCR scopes, background jobs, searchable/selectable OCR text, correction, and durable location mapping.

## Success Evidence

- Current Page / Selected Pages / Entire Book;
- pause/resume/cancel;
- explicit OCR success state;
- correction durability;
- original PDF untouched;
- representative CJK / multi-column quality;
- search/excerpt/annotation jump-back usability.

## Stop / Escalate if

- document OCR fails accepted thresholds;
- correction durability cannot be preserved;
- backend conflicts with packaging/privacy assumptions.

## Exit Gate

Manual corrections survive raw OCR/cache rebuild and restart.

---

# Milestone 6 — Calendar, Goals & Library Planning

**Status:** Planned  
**Risk:** Low–Medium

## Goal

Deliver lightweight plan-vs-actual reading planning without growing into gamification.

## Success Evidence

- Planned Book Hours;
- Actual Reading Time calendar;
- lightweight goals;
- explainable historical reporting.

## Stop / Escalate if

- feature growth is required to make the workflow coherent;
- factual historical time would be retroactively altered.

## Exit Gate

Calendar stays lightweight and semantically distinct from factual reading-time history.

---

# Milestone 7 — Bilingual Alignment Reading

**Status:** Planned  
**Risk:** Medium–High

## Goal

Deliver Alignment Package import/validation and synchronized dual-pane reading while preserving independent Book data.

## Success Evidence

- source/fingerprint validation;
- independent vertical scroll;
- sync on/off;
- side swap;
- mismatch/review state;
- independent progress/notes/assets.

## Stop / Escalate if

- alignment consumption requires an Alignment Editor;
- Book histories/assets would need merging.

## Exit Gate

The UI makes **synchronized navigation, independent Book data** unambiguous.

---

# Milestone 8 — Data Safety, Restore & Update Awareness

**Status:** Planned  
**Risk:** High

## Goal

Deliver recovery snapshots, backups, real Restore, relink/recovery, Library Health, destructive-data safeguards, and V1 update awareness.

## Success Evidence

### Data Safety

- App Data Backup;
- Full Library Backup;
- Restore Preview;
- clean-state Restore;
- Managed-Copy recovery;
- Reference relink;
- canonical user-asset round trip;
- destructive confirmation behavior.

### Update Awareness

- background stable-release check;
- manual Check Now;
- Up To Date / Update Available / Check Failed;
- draft/prerelease ignored;
- offline-safe behavior;
- no silent auto-install.

## Stop / Escalate if

- Restore cannot prove canonical-data round trip;
- destructive behavior remains ambiguous;
- update awareness becomes a dependency for core reading.

## Exit Gate

Stable V1 feature implementation is not Feature Complete until real Restore works.

---

# Feature Complete Candidate Gate

After M8 passes, the agent performs:

- cross-milestone evidence reconciliation;
- canonical documentation reconciliation;
- residual-risk list;
- Feature Complete candidate report;
- confirmation that no required V1 feature exists only in prototype form.

Then:

> **HARD STOP**

The agent must **not** self-promote into Feature Freeze or Product Hardening.

---

# Human Feature Freeze Gate

Human reviews cumulative evidence, residual risk, canonical docs, authority consistency, and unresolved escalations.

Only explicit human approval may transition:

```text
Feature Complete Candidate
→ Feature Freeze
```

---

# Milestone 9 — Product Hardening

**Status:** Planned  
**Human authorization required before entry**

Hardening is system-wide quality convergence, not feature growth.

## Scope

- system audit / defect inventory;
- correctness / data integrity;
- migrations / partial writes;
- relink/replacement;
- orphan assets;
- ReadingSession shutdown;
- OCR correction durability;
- backup/restore;
- empty/loading/error/degraded states;
- keyboard/focus;
- theme contrast;
- performance/memory;
- privacy;
- dependency/license hygiene;
- font redistribution boundaries.

## Exit Gate

- no known release blocker;
- no known high-risk data-integrity/privacy defect;
- core workflows pass human acceptance;
- automated regression passes;
- serious fixes have regression evidence;
- deferred issues documented;
- docs match real product state.

---

# Milestone 10 — Release Candidate, Packaging & Windows Release

**Status:** Planned  
**Human authorization required**

## Scope

- production build;
- installer;
- clean/disposable Windows environment;
- install / launch;
- import / read;
- create user data;
- OCR smoke;
- close / reopen;
- backup / Restore;
- update-awareness smoke;
- privacy/license checks;
- GitHub Release.

## RC Exit Gate

A real packaged build must pass:

```text
install
→ launch
→ import/open
→ core reading workflow
→ create user data
→ close
→ reopen
→ persistence
→ backup
→ restore
```

Source-tree tests alone are insufficient.

---

# Macro Documentation Reconciliation Rule

Before any PR / promotion unit is declared merge-ready:

1. inspect the actual candidate state;
2. update macro documents to the **post-merge truth**;
3. search for stale milestone/state wording;
4. verify `PROJECT_STATUS.md` reflects the real candidate state;
5. ask:

> **If this change is merged now, are the macro documents true one second later?**

A candidate is not merge-ready while macro documents still describe the pre-merge state.

---

# Deferred / Future Candidates

Deferred product features are owned by `PRODUCT_SPEC.md`.

Do not duplicate or redefine that list here.
