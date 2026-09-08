# EbookReader Project Status

Last Updated: 2026-09-08

Current Phase: Pre-Implementation Specification / Workflow Hardening
Current Milestone: M0 — Feasibility & Architecture Lock — **Corrective Evidence Pass Complete, awaiting Second Human Architecture Gate**
Current Checkpoint / Promotion Unit: M0 evidence package, corrective pass (single promotion unit)
Current Branch / PR: `main` (direct commits pre-implementation; no PR yet)
Last Accepted Commit: canonical baseline commit + M0 evidence commit + M0 corrective evidence pass commit on `main`
Last Accepted Evidence: V1 product/domain scope freeze + V1 UI baseline freeze + P0 loop-control refactor + M0 technical spikes across all 9 evidence tracks, strengthened by a corrective pass with a reproducible evidence harness (`tooling/m0-evidence/`) — see `M0_TECHNICAL_SPIKE_REPORT.md`
Current Blockers: None technical. One Architecture Amendment required (CJK search needs a segmentation adapter in front of SQLite FTS5 — now backed by a working reference implementation, not only a diagnosis). Awaiting the second human review/approval of the Architecture Lock itself.
Open Escalations: None
Architecture State: Hypothesis, M0-evidenced (corrective pass complete) — see `M0_ARCHITECTURE_DECISION.md`. Not yet promoted to Accepted Baseline (requires explicit human approval).
Feature Complete: No
Feature Freeze: No
RC / Release State: Not started
Next Action: Human review of the corrected `M0_ARCHITECTURE_DECISION.md` and explicit Architecture Lock approval. M1 must not begin until that approval is given.

## History of this Milestone

1. **First M0 evidence pass** (commit `0291c51`): produced spike evidence and an ADR declaring M0 PASS across all 9 tracks.
2. **First Human Architecture Gate review**: declined to approve the Architecture Lock. Did not invalidate the evidence already gathered; identified that (a) several claims in the exit-gate self-check were backed by narrower evidence than the claims themselves required, and (b) the ReadingSession track (M0-G) had self-approved a downgrade of a frozen `PRODUCT_SPEC.md` semantic ("OS lock/sleep always pauses") under cover of a "Local Implementation Adjustment," which required a Human Gate rather than an M0-level decision.
3. **M0 Corrective Evidence Pass** (this state): kept all prior evidence, added new real evidence for six specifically-named gaps (DocumentLocation reopen/resize/typography/jump-back for EPUB/PDF/TXT; a working CJK search adapter implementation; OCR on a real degraded/multi-column/CJK page plus a real Rust `ort` inference run; a real Win32 sleep/session-lock hook with exact pause boundaries, retracting the earlier downgrade; a minimal real backup/restore workflow with Reference-relink and corrupt-archive rejection; fixed-layout EPUB and larger-PDF renderer-lock sanity checks). Committed a reproducible, public-safe evidence harness (`tooling/m0-evidence/`) so these results are not narrative-only. Both `M0_TECHNICAL_SPIKE_REPORT.md` and `M0_ARCHITECTURE_DECISION.md` were revised in place, with corrective sections clearly marked and nothing from the original pass hidden or deleted.
4. **Second Human Architecture Gate**: pending — this is the current state.

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
- Architecture is **not** locked before M0.
- M0 evidence, including a corrective pass, is now produced (see `M0_TECHNICAL_SPIKE_REPORT.md`, `M0_ARCHITECTURE_DECISION.md`, `tooling/m0-evidence/`); architecture remains a hypothesis until a human explicitly approves the lock.
- M0 did not reject the leading stack hypothesis; it accepted it with one Architecture Amendment (CJK search indexing, now with a working reference implementation) and several Local Implementation Adjustments. No frozen product requirement was de-scoped in the final (corrected) decision set. One earlier attempt to de-scope a frozen ReadingSession requirement was caught at the Human Architecture Gate and retracted before this promotion attempt.
- After the Human Architecture Gate approves the lock, the intended autonomous envelope is M1 → M8 → Feature Complete Candidate.
- The agent must hard-stop before Feature Freeze / Product Hardening unless explicitly authorized.
- The agent must hard-stop before M1 until the Architecture Lock is explicitly approved by the human (current state).
- Update awareness is V1; silent auto-install is not.
- OCR product behavior is frozen; OCR backend has M0 evidence (RapidOCR/PP-OCR-class ONNX pipeline, now tested against a real degraded/multi-column/CJK page in addition to synthetic images) — production integration path is via Rust ONNX Runtime (`ort`), now confirmed with a real inference run against the `x86_64-pc-windows-gnu` toolchain via `load-dynamic` (no prebuilt binary exists for that target — a packaging note for M10).
- ReadingSession sleep/lock uses a real Win32 hook (`WTSRegisterSessionNotification` + power-broadcast), confirmed with exact (non-heuristic) pause/resume boundaries — not the inactivity-timeout fallback alone.
