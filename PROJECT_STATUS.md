# EbookReader Project Status

Last Updated: 2026-09-08

Current Phase: M1 — Foundation, Persistence & Library (autonomous feature loop, M1→M8 envelope)
Current Milestone: M1 — Foundation, Persistence & Library — **In Progress**
Current Checkpoint / Promotion Unit: M1 checkpoint 1 — minimal CI Promotion Gate + project scaffold (in progress)
Current Branch / PR: `main` (direct commits pre-implementation; no PR yet)
Last Accepted Commit: canonical baseline + M0 evidence + M0 corrective evidence pass + governance reconciliation (Architecture Lock approval) on `main`
Last Accepted Evidence: V1 product/domain scope freeze + V1 UI baseline freeze + P0 loop-control refactor + M0 technical spikes across all 9 evidence tracks, strengthened by a corrective pass with a reproducible evidence harness (`tooling/m0-evidence/`); Architecture Lock approved at the second Human Architecture Gate — see `M0_TECHNICAL_SPIKE_REPORT.md`, `M0_ARCHITECTURE_DECISION.md`
Current Blockers: None. One Architecture Amendment carried forward as accepted baseline (CJK search needs a segmentation adapter in front of SQLite FTS5 — working reference implementation exists, production integration is M4 scope).
Open Escalations: None
Architecture State: **Accepted Architecture Baseline** — see `M0_ARCHITECTURE_DECISION.md`. Amendments still require reconciliation under the Architecture Promotion Rule; Product-Contract Conflicts still require a Human Gate.
Feature Complete: No
Feature Freeze: No
RC / Release State: Not started
Next Action: Establish the minimal CI Promotion Gate (`ROADMAP.md` §1.9) at M1's first checkpoint, then proceed with M1 implementation (persistence, Library, import, Reference/Managed-Copy, fingerprint identity, relink) per its Success Evidence. No further per-Milestone human approval is required inside the M1→M8 envelope unless a stop/escalation trigger fires (`ROADMAP.md` §1.8); the next Human Gate is the Human Feature Freeze Gate after M8.

## History of this Milestone

1. **First M0 evidence pass** (commit `0291c51`): produced spike evidence and an ADR declaring M0 PASS across all 9 tracks.
2. **First Human Architecture Gate review**: declined to approve the Architecture Lock. Did not invalidate the evidence already gathered; identified that (a) several claims in the exit-gate self-check were backed by narrower evidence than the claims themselves required, and (b) the ReadingSession track (M0-G) had self-approved a downgrade of a frozen `PRODUCT_SPEC.md` semantic ("OS lock/sleep always pauses") under cover of a "Local Implementation Adjustment," which required a Human Gate rather than an M0-level decision.
3. **M0 Corrective Evidence Pass** (this state): kept all prior evidence, added new real evidence for six specifically-named gaps (DocumentLocation reopen/resize/typography/jump-back for EPUB/PDF/TXT; a working CJK search adapter implementation; OCR on a real degraded/multi-column/CJK page plus a real Rust `ort` inference run; a real Win32 sleep/session-lock hook with exact pause boundaries, retracting the earlier downgrade; a minimal real backup/restore workflow with Reference-relink and corrupt-archive rejection; fixed-layout EPUB and larger-PDF renderer-lock sanity checks). Committed a reproducible, public-safe evidence harness (`tooling/m0-evidence/`) so these results are not narrative-only. Both `M0_TECHNICAL_SPIKE_REPORT.md` and `M0_ARCHITECTURE_DECISION.md` were revised in place, with corrective sections clearly marked and nothing from the original pass hidden or deleted.
4. **Second Human Architecture Gate**: **approved** (2026-09-08, HEAD `5729bf4`). Architecture promoted from Hypothesis to Accepted Baseline; a continuous M1→M8→Feature Complete Candidate autonomous engineering authorization envelope was granted in the same approval, together with a new CI Promotion Gate (`ROADMAP.md` §1.9) effective from M1 onward. This history is preserved intact per the Macro Documentation Reconciliation Rule — the decline and corrective pass are not erased by the approval.
5. **Governance reconciliation** (this state): macro documents (`README.md`, `PROJECT_STATUS.md`, `ROADMAP.md`, `ARCHITECTURE.md`, `M0_TECHNICAL_SPIKE_REPORT.md`, `M0_ARCHITECTURE_DECISION.md`, `BASELINE_MANIFEST.json`) updated to post-approval truth. M1 begins next.

## Canonical Authorities

Product: `PRODUCT_SPEC.md`
UI: `DESIGN.md`
Architecture: `ARCHITECTURE.md`
Formats: `FORMAT_CAPABILITY_MATRIX.md`
Roadmap / Loop Control: `ROADMAP.md`
Manual QA: `MANUAL_QA.md`
Entry Point: `README.md`

## Execution Notes

- V1 product/domain semantics are frozen.
- V1 UI authority is frozen.
- Architecture is **locked** as of the second Human Architecture Gate (2026-09-08): **Accepted Architecture Baseline**, not a hypothesis (see `M0_TECHNICAL_SPIKE_REPORT.md`, `M0_ARCHITECTURE_DECISION.md`, `tooling/m0-evidence/`).
- M0 did not reject the leading stack hypothesis; it accepted it with one Architecture Amendment (CJK search indexing, now with a working reference implementation) and several Local Implementation Adjustments. No frozen product requirement was de-scoped in the final (corrected) decision set. One earlier attempt to de-scope a frozen ReadingSession requirement was caught at the Human Architecture Gate and retracted before this promotion attempt.
- The agent is now operating inside the M1 → M8 → Feature Complete Candidate autonomous engineering envelope granted at Architecture Lock approval. No further per-Milestone human approval is required unless a stop/escalation trigger fires (`ROADMAP.md` §1.8).
- M0's named residual risks (`M0_ARCHITECTURE_DECISION.md`, "Residual Risks for Later Milestones") must be genuinely inherited by their owning Milestone (M3 real Windows lock/sleep acceptance, M4 CJK adapter scale/precision, M5 OCR real-book performance/multi-column/vertical layout/pause-resume-cancel/Rust ONNX production path, M8 real Restore, M10 packaging/toolchain/ORT implications) — Architecture Lock approval does not mark them resolved.
- A CI Promotion Gate (`ROADMAP.md` §1.9) applies from M1's first checkpoint onward: required CI jobs must be green before promotion to the next Milestone; CI green is necessary but not sufficient evidence.
- The agent must hard-stop after M8 (cross-milestone evidence reconciliation, canonical docs reconciliation, residual-risk inventory, Feature Complete Candidate) and must not enter M9 Product Hardening or declare Feature Freeze without the Human Feature Freeze Gate.
- Update awareness is V1; silent auto-install is not.
- OCR product behavior is frozen; OCR backend has M0 evidence (RapidOCR/PP-OCR-class ONNX pipeline, now tested against a real degraded/multi-column/CJK page in addition to synthetic images) — production integration path is via Rust ONNX Runtime (`ort`), now confirmed with a real inference run against the `x86_64-pc-windows-gnu` toolchain via `load-dynamic` (no prebuilt binary exists for that target — a packaging note for M10).
- ReadingSession sleep/lock uses a real Win32 hook (`WTSRegisterSessionNotification` + power-broadcast), confirmed with exact (non-heuristic) pause/resume boundaries — not the inactivity-timeout fallback alone.
