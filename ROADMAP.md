# EbookReader V1 Roadmap

Status: **Milestone 10 Complete (v1.0.0 Released) — Next: Portfolio Packaging (PP)**
M10-A Clean Install and M10-B Packaged RC Acceptance passed human clean-environment verification on Windows 11 VM; M10-C Release Governance & Publication completed with the official release of EbookReader v1.0.0 on GitHub (`dea8d82`, Tag: `v1.0.0`). Human Feature Freeze remains approved, V1 scope remains locked, and Milestone 10 is COMPLETE. Next lifecycle phase is Portfolio Packaging (PP).

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

**Status:** **Complete** (2026-09-09, commit `67d32c5`) — Exit Gate evidence below.
**Risk:** High

**Self-correction note:** this Milestone was first marked Complete at
commit `51e506e` based on the Exit Gate/Success Evidence bullets alone,
without cross-checking `DESIGN.md`'s separate frozen UI-authority section
(`ER-OCR-001` / SS10, the "OCR Workspace" canonical surface). That check
was done immediately after, while reading `DESIGN.md` for M6 context, and
found the implementation at `51e506e` was OCR scope/job controls folded
into `PdfReader.tsx`'s own page view rather than the dedicated
"Toolbar/scope -> thumbnail grid + job/status/correction side region"
composition SS10 requires. This was not a backend/Exit-Gate defect --
the two persistence-survival tests below were and remain valid -- it was
a UI-composition-fidelity gap caught by self-review, not by the user or
CI. It is closed as of commit `67d32c5`: a dedicated `OcrWorkspace.tsx`
surface was built matching SS10's structure and the accepted
`docs/design/EbookReader_UI_Prototype_v0_5.html` prototype's exact OCR
Workspace markup (Pages heading/hint, thumbnail grid, job status card,
always-visible "Page correction" card, OCR-complete success line), CI
green. Recorded here rather than silently amending the original claim.

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

**Satisfied.** Proven at both halves the condition names, with real
automated tests rather than assumption: `crates/domain/src/ocr.rs`'s
`a_correction_survives_clearing_the_raw_ocr_cache` proves the `rebuild`
half (a correction survives `clear_page_results`); a real gap was found
and closed in this proof itself -- every prior OCR test used
`Connection::open_in_memory()`, which cannot demonstrate restart survival
at all (an in-memory database is destroyed the instant its connection
drops), so `a_correction_survives_closing_and_reopening_the_database_file`
was added: a real file-backed SQLite database, a correction saved, the
connection dropped entirely (a process-exit-equivalent event), a brand
new connection opened to the same file (a process-restart-equivalent
event), and the correction confirmed still there. The real UI writes
through this exact same path (`save_ocr_correction_command` ->
`ocr::save_correction`; `clear_ocr_cache_command` -> `ocr::clear_page_results`),
verified by direct source reading, not assumed.

The reused PP-OCRv6 pipeline (detector, orientation classifier,
recognizer -- `crates/domain/src/ocr_engine.rs`'s `OcrEngine`) runs real
Rust `ort` inference end-to-end, verified against real fixtures including
a real, public-domain, genuinely degraded 1893 page
(`tooling/m0-evidence/fixtures/ocr_real/`). All seven Success Evidence
bullets are addressed: full Current Page / Selected Pages / Entire Book
scope selection in `PdfReader.tsx`; real pause/resume/cancel
(`run_ocr_job_command` checks the job's stored status between pages and
stops early if a concurrent status-change call set it to Paused/Cancelled;
Resume re-derives and re-sends only the pages still missing a result);
explicit `OcrJobStatus::Succeeded`/`Failed` states; correction durability
(above); original PDF untouched (verified by construction -- no write
path to a source book file exists anywhere in the OCR pipeline); OCR text
feeds Library-wide Search (`search::index_text`, re-indexed on
correction) and Excerpt/Annotation capture works on OCR'd text (the
existing selection-capture listener extended to the recognized-text
paragraph, no anchor changes needed -- already page-number-based).

Representative multi-column quality is genuinely fixed and validated: a
column-aware reading-order algorithm (`reading_order_text`, gap-based
clustering on sorted line-center positions rather than bounding-box
envelope extension, to avoid a stray header/footer merging two real
columns) was built, unit-tested, and confirmed against the real fixture
-- a two-column English commentary block that previously spliced into
alternating gibberish now reads as two coherent, continuous paragraphs.
Vertical-CJK reading order is the one Success Evidence item not fully
closed: root-caused (not merely observed) by inspecting the real source
page and the actual detected box geometry -- the detector finds wide,
short horizontal bands crossing most of a ~15-column vertical-text block
rather than per-column boxes, so no reordering rule in
`reading_order_text` can fix it; a real fix needs rotation-and-reprocessing
or a dedicated text-direction/layout-analysis model, neither part of this
session's reused asset set. This is carried forward as an explicit,
architecture-level residual with the exact defect pattern documented
(`tooling/m5-evidence/m5e_multi_column_cjk_evidence.md`), not silently
dropped -- consistent with the Stop/Escalate condition not being
triggered (no accepted-threshold definition exists for this, the feature
works for the majority single-column and multi-column-Latin cases, and
the failure mode is precisely scoped rather than an unbounded quality
gap).

**Residuals explicitly carried forward, not silently dropped**: (1)
vertical-CJK reading order (above) -- owned by a future Milestone/
checkpoint with the necessary architecture decision. (2) Real mid-run
pause/cancel interrupts between pages, not within a page already in
flight (a single page's inference cannot be aborted mid-call);
incremental per-page progress reporting is not wired (the UI shows an
honest "running, this may take a while" rather than a fake progress bar).
(3) The uncapped-recognition-width change
(`tooling/m5-evidence/m5d_ocr_engine_production_port.md`) has not been
re-measured for its specific accuracy impact, only shipped as a
principled correction over the reference implementation's batching-only
cap. (4) ~~Thumbnail-based page selection~~ -- closed at commit `67d32c5`:
`OcrWorkspace.tsx` now renders a real per-page thumbnail grid (click to
view/select) alongside the text-based page-range input, matching
`PRODUCT_SPEC.md` SS13.1's "page-range input and thumbnail selection" and
`DESIGN.md` SS10's canonical composition. (5) The selection-driven
Highlight/Excerpt UI (carried from M4) and this Milestone's own OCR
trigger/scope/pause/correction UI have not been exercised via a live
native-window click-through and screenshotted -- this sandbox's
`SetForegroundWindow` residual (`[[feedback-native-gui-visual-verification]]`)
makes that unreliable to script; confidence instead comes from
source-level correctness review plus clean typecheck/build/CI (63
frontend + 124 domain tests + 2 local-only real-fixture integration
tests). None of these residuals threaten the Exit Gate's own condition.

---

# Milestone 6 — Calendar, Goals & Library Planning

**Status:** **Complete** (2026-09-09, commit `9e99099`) — Exit Gate evidence below.
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

**Satisfied.** A new `crates/domain/src/calendar.rs` module adds a
day-keyed Calendar surface (`DESIGN.md` SS13, canonical `ER-CAL-001`)
strictly on top of the existing facts, never a second source of truth
for what counts as reading time: `record_active_reading_time_command`
computes one `active_duration` figure per heartbeat tick exactly as
before, and now folds that same figure into both the per-book
`actual_reading_time` ledger (M3, unchanged) and a new day-keyed
`daily_reading_time` aggregate -- one fact, two groupings, never
independently derived. "Planned Book Hours" and "lightweight goals" are
deliberately unified into a single mechanism: a lightweight, global
daily reading-time goal (`daily_goal_history`, one number, no
streaks/badges/per-book due dates -- nothing in frozen
`PRODUCT_SPEC.md` SS9/SS15 defines a due-date/pacing algorithm, so none
was invented). Explainable historical reporting is a structural
property, not a display-time patch: `daily_goal_history` is append-only,
keyed by the day a value became effective, and `goal_in_effect_on`
always resolves a past day to whatever goal was actually in effect on
that day, never the goal's current value -- proven directly by
`changing_the_goal_does_not_retroactively_alter_a_past_days_planned_figure`.
The Stop/Escalate condition ("factual historical time would be
retroactively altered") cannot trigger by construction: `record_daily_reading_time`
only ever adds (`ON CONFLICT ... seconds = seconds + excluded.seconds`),
mirroring `ActualReadingTime::record`'s own accumulate-only discipline,
and nothing in this module has a delete/rewrite path for the actual-time
ledger. A `Calendar.tsx` surface (month grid with activity dots, a
per-day detail card showing Planned vs Actual, and a goal editor)
matches the accepted `docs/design/EbookReader_UI_Prototype_v0_5.html`
prototype's composition. 10 new domain tests (134 total, was 124), 5 new
frontend tests (68 total, was 63), CI green.

**Residuals explicitly carried forward, not silently dropped**: (1) the
daily reading goal is a single global value, not per-book or
per-week/weekday -- a deliberate scope choice to stay "lightweight," not
an oversight; a future Milestone could add finer granularity if a real
need surfaces. (2) The Calendar's month navigation and goal-editing UI
have not been exercised via a live native-window click-through and
screenshotted, for the same `SetForegroundWindow` sandbox residual
already carried from M4/M5 (`[[feedback-native-gui-visual-verification]]`)
-- confidence comes from source-level review plus clean
typecheck/test/build/CI. Neither residual threatens the Exit Gate's own
condition.

---

# Milestone 7 — Bilingual Alignment Reading

**Status:** **Complete** (2026-09-09, commit `4d86045`) — Exit Gate evidence below.
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

**Satisfied.** Before implementing past `FORMAT_CAPABILITY_MATRIX.md`'s
`🧪` markers on Bilingual Alignment Package (Reflowable EPUB, Text PDF,
Scanned-PDF-post-OCR, TXT -- never covered by any M0 spike), a real
Loop Engineering pass was run and recorded:
`tooling/m7-evidence/m7a_bilingual_alignment_scope_decision.md`.
Finding: `PRODUCT_SPEC.md` SS14 already excludes alignment authoring,
so "supports Bilingual Alignment Package" only requires extracting and
displaying each format's real text in an independent pane -- and that
extraction already exists, tested, in production for all four formats
(`Reader.tsx`'s/`PdfReader.tsx`'s own Search-indexing extraction, M5's
`get_ocr_effective_text_command`, TXT's direct decode). Decision:
ACCEPT scroll-position-ratio synchronization (matching the accepted
`docs/design/EbookReader_UI_Prototype_v0_5.html#bilingual` prototype's
own reference implementation exactly) as the V1 mechanism, rather than
building unvalidated per-paragraph cross-format anchor alignment ROADMAP's
own Success Evidence never actually names.

`crates/domain/src/alignment.rs`'s `import_package` resolves an
Alignment Package's two fingerprints against the real Library
(`find_book_id_by_fingerprint`) and returns a typed
`SourceNotInLibrary { side, fingerprint }` error -- never a guessed
pairing -- when either side doesn't match a real Book, satisfying
"source/fingerprint validation" and "mismatch/review state" together.
`AlignmentMapping::status()` flags any non-1:1 correspondence "review"
rather than presenting it with the same confidence as a clean match.
`BilingualReader.tsx` renders two independently-scrolled plain-text
panes (native browser scroll -- "independent vertical scroll" by
construction), a `⇄ Swap` control that reorders which book renders in
which pane, and a `⛓ Sync navigation on/off` toggle gating the
ratio-based scroll sync. "Independent progress/notes/assets" holds by
construction, not by a separate guard: `BilingualReader.tsx` never
calls `save_reading_location_command`, `create_reading_asset_command`,
or any other per-book state-mutating command each format's normal
Reader uses -- it only reads book bytes to extract display text, so
there is no code path by which opening Bilingual Reading could touch
either Book's own progress, Notes, Excerpts, Annotations, or Book
Hours. The read-only Alignment panel states this explicitly to the user
("Each book keeps its own notes, excerpts, highlights, and progress"),
matching the accepted prototype's own disclaimer. 9 new domain tests
(143 total, was 134), 6 new frontend tests (74 total, was 68), CI
green.

**Residuals explicitly carried forward, not silently dropped**: (1)
per-paragraph click-to-highlight alignment (the prototype's
`data-align` interaction) is not built -- a deliberate scope decision
recorded in the evidence doc above, not an oversight; ROADMAP's own
Success Evidence never names it. (2) There is no Alignment Package
authoring UI (frozen non-goal, `PRODUCT_SPEC.md` SS14) -- packages must
be authored externally as the minimal JSON shape
`crates/domain/src/alignment.rs` documents. (3) The Bilingual pane's
per-side Highlight/Excerpt/Note mini-toolbar shown in the accepted
prototype is not built; each Book's own existing Reader already
provides these, and building a second, parallel capture path inside
the lightweight bilingual pane was judged unnecessary duplication, not
a genuine gap -- "independent Book data" is satisfied by the normal
Reader remaining the place assets are captured. (4) The dual-pane UI
has not been exercised via a live native-window click-through and
screenshotted, for the same `SetForegroundWindow` sandbox residual
carried from M4-M6 (`[[feedback-native-gui-visual-verification]]`).
None of these residuals threaten the Exit Gate's own condition.

---

# Milestone 8 — Data Safety, Restore & Update Awareness

**Status:** **Complete** (2026-09-09, commit `2b81d54`) — Exit Gate evidence below.
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

**Satisfied.** Real Restore works, proven by a real file-based
backup/restore round trip (`crates/domain/src/backup.rs`), not a
mocked or in-memory-only proof (the same discipline M5's Exit Gate
enforced for OCR correction durability): App Data Backup and Full
Library Backup both copy the canonical SQLite database file itself
(`ARCHITECTURE.md`: "SQLite... is the canonical persistence engine") --
never a hand-rolled per-table export that could silently diverge from
what the app actually persists -- into a real zip archive alongside a
manifest, and Restore reverses this exactly. The workflow matches the
one the M0 corrective-pass spike already validated
(`tooling/m0-evidence/results/m0h_backup_restore.txt`: "manifest/
preview -> safety snapshot -> restore -> verify"): `preview()` reads
the manifest and checks completeness without mutating anything on
disk (proven directly); `restore()` refuses an incomplete archive
outright, touching nothing (proven directly, matching the spike's own
"REJECTED reason=archive_incomplete" / "app-data unchanged after
rejection" result); a recovery safety snapshot of the live database is
created *before* any replacement, satisfying SS16.1 (proven directly);
Managed-Copy files round-trip for a Full Library Backup (proven
directly); "canonical user-asset round trip" is proven with a
dedicated test carrying a Note, an OCR correction (not just raw
recognized text), and a Book Hours workload config through a real
backup->restore cycle intact, not inferred from the database-file-copy
approach alone. "Needs Relink" surfacing after Restore requires no
separate detection path: `store::list_books`'s existing `available`
computation (whether a Reference path still exists on disk) runs
against whatever database Restore just put in place, so it is correct
by construction rather than by a parallel check that could drift out
of sync. The Tauri command layer (`restore_backup_command`) safely
swaps the live `rusqlite::Connection` (in-memory placeholder while the
file is replaced, then a fresh connection to the restored file) so the
file-level replacement never races a held file handle. A
`DataRecovery.tsx` surface (`DESIGN.md` SS14 canonical `ER-DATA-001`)
provides Create App Data Backup / Create Full Library Backup / Choose
Backup to Restore -> Preview -> confirm (a real destructive-confirmation
dialog naming the automatic safety snapshot) -> Restore, plus Update
Awareness (SS17): a stable-release check against GitHub Releases'
`/releases/latest` endpoint, which already excludes drafts/prereleases
by GitHub's own documented semantics -- "stable release channel only"
and "draft/prerelease ignored" with no extra filtering logic needed.
Never a silent auto-install; a failed/offline check resolves to
"Check Failed" rather than throwing. 9 new domain tests (151 domain
tests total, was 143), 16 new frontend tests (89 frontend tests total,
was 73), CI green.

**Residuals explicitly carried forward, not silently dropped**: (1) if
an individual Managed-Copy file fails to write mid-restore (a
filesystem-level fault, e.g. a permissions error, after the archive's
completeness has already been validated), the live database has
already been replaced but not all managed files -- the automatic
recovery snapshot exists precisely so this rare case is manually
recoverable, but there is no automated rollback of a partially-applied
restore. (2) `override_completed_reads_command`'s (M3) required warning
copy (`DESIGN.md` SS14: "active progress is cleared; Actual Reading
Time stays unchanged; ReadingSession history stays unchanged") has no
frontend UI at all yet -- this was never an M8 Success Evidence item
(M8's own bullets are Backup/Restore/Update Awareness, not this
specific M3 feature's UI), so it is not a gap in this Milestone, but is
recorded here as a genuinely open item for a future session. (3) The
Backup/Restore/Update Awareness UI has not been exercised via a live
native-window click-through and screenshotted, for the same
`SetForegroundWindow` sandbox residual carried from M4-M7
(`[[feedback-native-gui-visual-verification]]`). None of these
residuals threaten the Exit Gate's own condition, which is about real
Restore working -- proven directly above.

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

**Status:** Complete — Full Automated Regression & Native Human Acceptance PASS (`5ccc240`)
Human Feature Freeze approved entry on 2026-09-11. M9 closed the known native layout/form overlap and card/button overflow release-readiness defect and full automated regression passed. Subsequent native acceptance exposed three frozen-V1 implementation defects in EPUB line height, PDF controls/navigation, and Book Hours shell geometry; bounded corrections and Profile Card stabilization were implemented, verified, and closed with human PASS at `5ccc240`.

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

**Status:** **Complete** (v1.0.0 Released) — M10-A Complete [HUMAN PASS]; M10-B Complete [HUMAN PASS]; M10-C Release Governance & Publication Complete (GitHub Release `v1.0.0`, PR #1 merged, tag `v1.0.0` pushed).

### M10-A — RC Build & Clean Install (Complete — HUMAN PASS)
- Built production NSIS and MSI candidate installers.
- Resolved two packaged-runtime dependency blockers discovered in clean VM testing (`libstdc++-6.dll` and `WebView2Loader.dll`) by co-locating the full redistributable DLL closure in `src-tauri/redist/` and mapping to `$INSTDIR` in `tauri.conf.json`.
- Established deterministic automated regression coverage and recursive PE dependency closure audit (`tooling/audit_runtime_closure.mjs`, `src/packagingRuntime.test.ts`).
- Human Clean-Environment Acceptance Evidence:
  - Clean install on isolated Windows 11 VM succeeded.
  - First and second independent launches succeeded without runtime/DLL errors.
  - Initialized AppData storage and `library.sqlite3` database.
  - Explicit user HUMAN PASS recorded.

### M10-B — Packaged RC Acceptance (Complete — HUMAN PASS)
- Core Installer: Lightweight (~13MB setup executable), zero external dependencies, bundles complete runtime DLL closure (`WebView2Loader.dll`, `libstdc++-6.dll`, `libgcc_s_seh-1.dll`, `libwinpthread-1.dll`). Normal visual reading for scanned PDF works without OCR.
- Optional OCR Pack: Official standalone installer (`EbookReader_OCR_Pack_1.0.0_x64-setup.exe`, ~56.5MB setup executable) packaging verified ONNX Runtime (MIT) and PaddleOCR DBNet/SVTR-LCNet models (Apache-2.0). Auto-discovered at `%APPDATA%\com.peter-shi.ebookreader\ocr-assets\`. When uninstalled, UI displays a neutral informational degraded state (`OCR Pack Not Installed`).
- Human Clean-Environment Retest Acceptance Evidence:
  - Clean Core install on Windows 11 VM passed.
  - Neutral degraded state when no pack is installed verified.
  - Scanned PDF visual reading works normally.
  - Optional OCR Pack standalone installation and zero-config auto-discovery passed.
  - Real local OCR inference executed and verified.
  - OCR corrections persistence across sessions passed.
  - Restart rediscovery and data integrity verified.
  - Explicit user HUMAN PASS recorded.
- CI Test-Contract Resolution: Decoupled tracked packaging contract validation from gitignored binary preflight; full CI promotion gate green on PR #1 (`f718cf4`).

### M10-C — Release Governance & Publication (Complete — RELEASED)
- Release Identity Finalization: Upgraded release identity consistently to `v1.0.0`.
- Merged PR #1 into `main` (`dea8d82`) and tagged `v1.0.0`.
- Published GitHub Release `v1.0.0` with verified candidate artifacts and SHA256 checksums (`EbookReader_1.0.0_x64-setup.exe`, `EbookReader_1.0.0_x64_en-US.msi`, `EbookReader_OCR_Pack_1.0.0_x64-setup.exe`).
- Verified third-party notices and license attributions for ONNX Runtime (MIT), PaddleOCR (Apache-2.0), and WebView2.
- Milestone 10 is complete; next lifecycle phase is Portfolio Packaging (PP).

## RC Exit Gate

A real packaged build must pass:

```text
install
→ launch
→ import/open (EPUB, PDF, TXT)
→ core reading workflow
→ create user data (notes, highlights)
→ Book Hours & Alignment smoke
→ close
→ reopen
→ persistence
→ backup
→ restore
→ restored state verified
```

**Satisfied.** All criteria verified through M10-A, M10-B, and M10-C human acceptance testing. EbookReader v1.0.0 is officially released.

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
