# EbookReader — Feature Complete Candidate Report

Status: **Feature Complete Candidate** (2026-09-09, commit `2b81d54`)

Produced per `ROADMAP.md`'s own "Feature Complete Candidate Gate" checklist, after M8's Exit Gate was satisfied. This report is the artifact that checklist names: cross-milestone evidence reconciliation, canonical documentation reconciliation, a residual-risk list, and confirmation that no required V1 feature exists only in prototype form.

**This report does not self-promote the project into Feature Freeze.** Per `ROADMAP.md`, only the Human Feature Freeze Gate may make that transition. This session stops here and returns control.

---

## 1. Cross-Milestone Evidence Reconciliation

Every Milestone in the authorized M1→M8 envelope is Complete, with real (not mocked/assumed) evidence and CI green on the commit that closed it:

| Milestone | Status | Commit | Exit Gate evidence |
|---|---|---|---|
| M0 — Feasibility & Architecture Lock | Complete (Human-approved, corrective pass) | — | `M0_TECHNICAL_SPIKE_REPORT.md`, `M0_ARCHITECTURE_DECISION.md`, `tooling/m0-evidence/` |
| M1 — Foundation | Complete | `94aff83` | `ROADMAP.md` §M1 |
| M2 — Core Reading Surfaces | Complete | `0a04fb4` | `ROADMAP.md` §M2 |
| M3 — Progress, Book Hours, Actual Reading Time | Complete | `096b90d` + durability test | `ROADMAP.md` §M3 |
| M4 — Reading Assets & Search | Complete | `7f12173` | `ROADMAP.md` §M4 |
| M5 — Scanned PDF OCR | Complete | `67d32c5` (self-corrected from `51e506e` after a UI-composition-fidelity gap was self-caught) | `ROADMAP.md` §M5 |
| M6 — Calendar, Goals & Library Planning | Complete | `9e99099` | `ROADMAP.md` §M6 |
| M7 — Bilingual Alignment Reading | Complete | `4d86045` | `ROADMAP.md` §M7, `tooling/m7-evidence/` |
| M8 — Data Safety, Restore & Update Awareness | Complete | `2b81d54` | `ROADMAP.md` §M8 |

Test suite growth across the envelope (all real, executed, not estimated): domain tests 82 (M4 close) → 124 (M5) → 134 (M6) → 143 (M7) → **151** (M8); frontend tests 63 (M5) → 68 (M6) → 74 (M7) → **89** (M8). Every commit above shows green on both the Rust (native Windows build + tests) and Frontend (typecheck, test, build) GitHub Actions jobs.

One self-correction is recorded, not glossed over: M5 was first marked Complete on Exit Gate/Success Evidence grounds alone, then found (by this project's own self-review, before any user or CI involvement) to have a real gap against `DESIGN.md`'s separate frozen UI-authority section. It was corrected in the open, with the original claim's overstatement stated plainly in `ROADMAP.md` and `PROJECT_STATUS.md`, not silently amended.

## 2. Canonical Documentation Reconciliation

`ROADMAP.md`, `PROJECT_STATUS.md`, and `README.md` all reflect the post-M8 state as of this report (see their own "Last Updated" / commit-hash lines). `FORMAT_CAPABILITY_MATRIX.md` was deliberately left unedited throughout M5-M8 per its own Authority Boundary ("must not become a second project-status dashboard") -- implementation-evidence closure of its `🧪` markers lives in `ROADMAP.md` and the per-Milestone `tooling/*-evidence/` docs instead (e.g. `tooling/m7-evidence/m7a_bilingual_alignment_scope_decision.md` for the Bilingual Alignment Package markers). `PRODUCT_SPEC.md` and `DESIGN.md` remain frozen and unweakened throughout M1-M8 -- every Milestone's Exit Gate evidence in `ROADMAP.md` cites the specific frozen section it satisfies, and the one moment a real gap against frozen `DESIGN.md` authority was found (M5), it was closed by building the missing surface, not by reinterpreting the frozen doc.

## 3. Residual-Risk List

### M0 carry-forward risks (`M0_ARCHITECTURE_DECISION.md` "Residual Risks for Later Milestones") — disposition

- **M1** (live window launch/native visual acceptance): **open, non-blocking.** This sandbox's `SetForegroundWindow` limitation (`[[feedback-native-gui-visual-verification]]`) has made scripted native-window click-through/screenshot verification unreliable across every Milestone from M4 onward; confidence has instead come from source-level correctness review plus clean typecheck/build/CI on every commit. A future session with reliable interactive GUI verification, or the user's own manual click-through, should close this. It has never blocked an Exit Gate, because no Exit Gate in `ROADMAP.md` requires a native-window screenshot as its evidence form.
- **M2** (PDF/EPUB visual rendering, zoom/fit, selection UX, CJK fallback fonts, large-document performance): **closed at M2's own Exit Gate depth.** M2 was marked Complete earlier in this project's history with its own Exit Gate evidence in `ROADMAP.md` §M2; large-document performance at extreme scale (thousands of pages) was never re-benchmarked in later Milestones and remains an open quality-tuning item, not a functional gap.
- **M3** (end-to-end anchor stability under OCR-rerun): **substantially closed.** M5's OCR correction-durability Exit Gate proves a correction survives cache rebuild and restart; DocumentLocation's own reopen/resize/typography/jump-back stability was directly evidenced in the M0 corrective pass (§6) for EPUB/PDF/TXT. Anchor stability specifically *across a full OCR re-run* (as opposed to a correction edit) was not separately re-tested at M5/M8 depth and remains a residual quality-tuning item.
- **M4** (CJK segmentation adapter performance/quality at library scale): **open, non-blocking.** The adapter's *correctness* was closed at M0/M4 depth (real bigram-adapter port, tested); its behavior on a library of thousands of CJK books was never benchmarked, since no Exit Gate in M4-M8 required it. A future session should benchmark this before considering CJK search production-hardened at scale.
- **M5** (OCR quality/tuning on a broader real-scan corpus; column-crossing/reading-order mitigation): **partially closed.** Multi-column English splicing is closed (a column-aware reading-order fix, validated against a real fixture -- `ROADMAP.md` §M5). Vertical classical-Chinese reading order was root-caused (a detection-orientation problem, not an ordering-rule problem) but the actual fix -- rotation-and-reprocessing or a dedicated text-direction model -- was never built; this is the one M0 residual explicitly still requiring its own future architecture decision, carried forward honestly in `ROADMAP.md` §M5 and `tooling/m5-evidence/m5e_multi_column_cjk_evidence.md` rather than silently dropped.
- **M8** (full Restore UI/versioning polish above the core workflow): **closed this Milestone.** `DataRecovery.tsx` now provides a real Preview → confirm → Restore UI wired to the exact commands the core workflow (already evidenced at M0) exercises; "versioning polish" beyond the single-manifest-version model built here is not required by any frozen `PRODUCT_SPEC.md`/`DESIGN.md` section and is not tracked as a residual.
- **M10** (packaging: C-toolchain, elevation-free provisioning, `ort-sys` GNU-target note): **out of the M1→M8 envelope by design.** `ROADMAP.md` names this against a Milestone number outside the currently-authorized M1→M8 scope; it is real future work, not a silently-dropped item, and belongs to a packaging/installer Milestone this envelope was never asked to open.

### Residuals recorded per-Milestone (M4-M8), not restated here in full

Each of `ROADMAP.md`'s M4 through M8 sections carries its own "Residuals explicitly carried forward, not silently dropped" paragraph. None of them were found, on review, to threaten that Milestone's own Exit Gate condition -- that determination is made explicitly in each section, not asserted here. The two residuals that recur across every recent Milestone are: (1) the native-window GUI click-through/screenshot verification gap (above), and (2) items each Milestone itself judged out of its own Success Evidence scope (e.g. M7's per-paragraph click-to-align highlighting, M8's `override_completed_reads_command` warning-copy UI).

## 4. No Required V1 Feature Exists Only in Prototype Form

Every `PRODUCT_SPEC.md` section with a required V1 feature maps to a completed Milestone with real, tested, production Rust/TypeScript code -- not the `docs/design/EbookReader_UI_Prototype_v0_5.html` mockup alone, which remains only the accepted *visual composition reference* per `DESIGN.md` §3, never the implementation itself:

- SS3-4 Product Invariants / Core Domain Model — M1-M2.
- SS5 Import & File Ownership — M1.
- SS6-7 Supported Formats / Reading Experience — M2.
- SS8-10 Progress, Completion, Book Hours, Actual Reading Time — M3.
- SS11-12 Notes/Excerpts/Annotations, Search — M4.
- SS13 OCR — M5.
- SS14 Bilingual Reading — M7.
- SS15 Calendar & Goals — M6.
- SS16 Backup, Restore, and Recovery — M8.
- SS17 Update Awareness — M8.
- SS18 UI Contract — cross-cutting, enforced by `DESIGN.md`'s Canonical Surface Registry and checked directly at M5 (the one point a real composition gap was found and closed).
- SS19 V1 Deferred/Non-Goals — explicitly out of scope; nothing here was required.

No section above is satisfied only by the HTML prototype, a design doc description, or an unimplemented stub.

## 5. Open Escalations

None. No Stop/Escalate condition in any Milestone's `ROADMAP.md` section was triggered during M1-M8. The one moment requiring correction (M5's UI-composition gap) was a self-caught fidelity issue resolved within the same Milestone's own scope, not a Product-Contract Conflict or Architecture Amendment requiring a Human Gate.

---

**Per `ROADMAP.md`'s Feature Complete Candidate Gate: HARD STOP.** This session does not self-promote into Feature Freeze or Product Hardening. The next step is the Human Feature Freeze Gate -- a human review of this report, cumulative evidence, residual risk, canonical docs, authority consistency, and unresolved escalations, with explicit human approval required before any transition.
