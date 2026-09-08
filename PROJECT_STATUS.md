# EbookReader Project Status

Last Updated: 2026-09-08

Current Phase: Pre-Implementation Specification / Workflow Hardening  
Current Milestone: M0 — Feasibility & Architecture Lock — **Evidence Produced, awaiting Human Architecture Gate**  
Current Checkpoint / Promotion Unit: M0 evidence package complete (single promotion unit)  
Current Branch / PR: `main` (direct commits pre-implementation; no PR yet)  
Last Accepted Commit: canonical baseline commit + M0 evidence commit on `main`  
Last Accepted Evidence: V1 product/domain scope freeze + V1 UI baseline freeze + P0 loop-control refactor + M0 technical spikes across all 9 evidence tracks (see `M0_TECHNICAL_SPIKE_REPORT.md`)  
Current Blockers: None technical. One Architecture Amendment required (CJK search needs a segmentation adapter in front of SQLite FTS5) — resolvable inside architecture authority, not a product conflict. Awaiting human review/approval of the Architecture Lock itself.  
Open Escalations: None  
Architecture State: Hypothesis, M0-evidenced — see `M0_ARCHITECTURE_DECISION.md`. Not yet promoted to Accepted Baseline (requires explicit human approval).  
Feature Complete: No  
Feature Freeze: No  
RC / Release State: Not started  
Next Action: Human review of `M0_ARCHITECTURE_DECISION.md` and explicit Architecture Lock approval. M1 must not begin until that approval is given.

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
- M0 evidence is now produced (see `M0_TECHNICAL_SPIKE_REPORT.md`, `M0_ARCHITECTURE_DECISION.md`); architecture remains a hypothesis until a human explicitly approves the lock.
- M0 did not reject the leading stack hypothesis; it accepted it with one Architecture Amendment (CJK search indexing) and several Local Implementation Adjustments. No frozen product requirement was de-scoped.
- After the Human Architecture Gate approves the lock, the intended autonomous envelope is M1 → M8 → Feature Complete Candidate.
- The agent must hard-stop before Feature Freeze / Product Hardening unless explicitly authorized.
- The agent must hard-stop before M1 until the Architecture Lock is explicitly approved by the human (current state).
- Update awareness is V1; silent auto-install is not.
- OCR product behavior is frozen; OCR backend has M0 evidence (RapidOCR/PP-OCR-class ONNX pipeline) — production integration path is via Rust ONNX Runtime (`ort`), not a shipped Python runtime.
