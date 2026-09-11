# EbookReader

> A Windows-first, local-first personal reading workspace for PDF, EPUB, and TXT.

## Current Status

- **Phase:** **Milestone 10 Active (M10-B — Packaged RC Acceptance)** — Human Feature Freeze approved, V1 scope locked, M1-M9 complete, Full Automated Regression & Native Human Acceptance PASS, M10-A Clean Install PASS (human clean-environment verified)
- **Milestone:** M0 Architecture Lock approved at the second Human Architecture Gate (2026-09-08); **M1-M9 complete; full automated regression & native human acceptance passed (`5ccc240`); M10-A Clean Install PASS; M10-B Packaged RC Acceptance active** — see `M0_TECHNICAL_SPIKE_REPORT.md`, `M0_ARCHITECTURE_DECISION.md`, `ROADMAP.md` (each completed Milestone's Exit Gate has its full evidence account), `PROJECT_STATUS.md`, `FEATURE_COMPLETE_CANDIDATE_REPORT.md` (cross-milestone reconciliation, residual-risk list, and confirmation no required V1 feature exists only in prototype form), reproducible M0 evidence harness at `tooling/m0-evidence/`
- **V1 product/domain scope:** Frozen
- **V1 UI baseline:** Frozen
- **Architecture:** **Accepted Architecture Baseline** (M0-evidenced, corrective pass, human-approved)
- **Feature Freeze:** Human-approved
- **Release:** Packaged RC acceptance active (M10-A Clean Install PASS on Windows 11 VM; M10-B end-to-end acceptance in progress)

The Feature-Frozen V1 application is complete through M9 Product Hardening. M10-A Clean Install passed on an isolated clean Windows 11 environment; M10-B Packaged RC Acceptance is currently active across core reader workflows on the installed build.

## Product Identity

EbookReader combines reliable local reading, personal library and reading-asset management, transparent Book Hours, factual Actual Reading Time, optional local OCR for scanned PDFs, bilingual aligned reading, backup/restore, and update awareness.

> **Quiet Surface, Living Motion**

Core reading and user-data access are local-first. Optional update awareness is the narrow V1 network exception.

## Canonical Authorities

> **One fact, one owner.**

| Authority | Canonical file |
|---|---|
| Product / domain semantics | `PRODUCT_SPEC.md` |
| UI / interaction semantics | `DESIGN.md` |
| Architecture decisions | `ARCHITECTURE.md` |
| Format capability contract | `FORMAT_CAPABILITY_MATRIX.md` |
| Delivery sequence / loop control | `ROADMAP.md` |
| Manual acceptance | `MANUAL_QA.md` |
| Current execution state | `PROJECT_STATUS.md` |

Other files may summarize or link; they must not redefine another authority's truth.

## Development Entry Point

A new human or agent session should normally load:

1. `README.md`
2. `PROJECT_STATUS.md`
3. the current Milestone / checkpoint section in `ROADMAP.md`

Then load specialist authorities only as needed:

- product behavior → relevant `PRODUCT_SPEC.md`
- UI → relevant `DESIGN.md`
- architecture → relevant `ARCHITECTURE.md`
- format behavior → `FORMAT_CAPABILITY_MATRIX.md`
- human acceptance → relevant `MANUAL_QA.md`

Do not preload every large authority document into every session unless the task genuinely needs it.

## Development Model

> **Broad operational autonomy, narrow normative authority.**

Routine implementation, debugging, focused refactoring, testing, retry, and evidence generation may proceed autonomously inside an approved execution envelope.

Human gates remain mandatory for V1 scope/semantic change, frozen UI change, architecture lock/major reversal, high-consequence migration or destructive data-policy decisions, Feature Freeze, RC/Release promotion, and unresolved product-vs-technical conflict.

Milestones are planning/delivery units, not automatic branch/PR/merge boundaries. Promotion is evidence-gated.

## Lifecycle

```text
P0 Loop-Control Refactor
→ M0 Feasibility & Architecture Lock
→ Human Architecture Gate
→ M1..M8 Autonomous Feature Loop
→ Feature Complete Candidate
→ Human Feature Freeze Gate
→ Product Hardening
→ Full Regression & Human Acceptance
→ RC / Windows Release
→ Portfolio / Maintenance
```

## Canonical UI Prototype

`docs/design/EbookReader_UI_Prototype_v0_5.html`

## Privacy & Repository Hygiene

Do not commit local/private planning material unless explicitly approved. Prompt drafts, personal-source reading material, private handoffs, machine-specific paths, credentials/tokens, and non-redistributable test corpora remain local by default.

Use synthetic or redistributable public examples and fixtures.

## V1 Non-Goals

Detailed V1 non-goals are owned by `PRODUCT_SPEC.md`. Do not restate or redefine them here.
