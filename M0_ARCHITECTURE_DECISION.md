# M0 Architecture Decision Record

Status: **Architecture Hypothesis, M0-evidenced — Awaiting Human Architecture Lock**
Date: 2026-09-08
Evidence source: `M0_TECHNICAL_SPIKE_REPORT.md`

Per `ARCHITECTURE.md`'s Architecture Promotion Rule, this document is the M0 output. It does **not** itself promote architecture to "Accepted Architecture Baseline" — only explicit human approval at the Human Architecture Gate does that (`ROADMAP.md` HARD STOP). Until then this remains an **evidenced hypothesis**.

This ADR covers the 13 items required by `ARCHITECTURE.md` §20.

---

## 1. Desktop Shell

**Decision:** Tauri 2, Windows target, WebView2-backed.

**Evidence:** Real Tauri 2 + React/TS scaffold compiled cleanly (`cargo check`, 1m43s, zero errors) once a C toolchain was present. WebView2 Runtime (v152.0.4191.66) already present on this machine.

**Rejected alternative:** Not comparatively spiked against Electron or PySide6/Qt in this pass — `ARCHITECTURE.md` §2 required M0 to compare "where necessary." Given the Tauri hypothesis produced no blocking evidence and no frozen-requirement conflict, a comparative spike was judged unnecessary spend under the "smallest sufficient harness" principle (`ROADMAP.md` §1.2). This is a **documented scope decision, not an omission**: if a future milestone surfaces a Tauri-specific blocker, Electron/Qt comparison should be revisited then, not preemptively now.

**Known requirement discovered:** the Windows Rust toolchain needs an explicit C-compiler provisioning step (MinGW-w64 or MSVC Build Tools) that `rustup` does not provide by default. Must be documented in dev setup / CI image definition (not yet written — flagged as follow-up, not part of this ADR's scope).

---

## 2. Domain / Application Language Split

**Decision:** Rust for application/domain/persistence layers; TypeScript/React for UI layer, per `ARCHITECTURE.md` §3.

**Evidence:** Not independently re-spiked; this follows directly from the Tauri shell decision (Tauri's command/event bridge is the natural Rust↔TS boundary) and was not itself a disputed hypothesis requiring separate evidence.

**Rejected alternative:** A TypeScript-only domain layer (Node/Deno sidecar) was considered in principle but not spiked — the Tauri model makes Rust the natural home for domain logic that needs direct SQLite/filesystem access, and no evidence surfaced a reason to route domain logic through a second runtime.

---

## 3. SQLite / Schema Approach

**Decision:** SQLite as canonical persistence, via `rusqlite` with the `bundled` feature (vendors SQLite source, avoids a system SQLite version dependency).

**Evidence:** `rusqlite` + `bundled` compiled successfully once the C-toolchain gap (see §1) was closed. SQLite 3.49.1 (bundled version resolved) confirmed to support both FTS5 tokenizers tested in M0-E.

**Rejected alternative:** None comparatively spiked — SQLite was the only persistence engine under consideration in `ARCHITECTURE.md` §3.4/§10, and no evidence surfaced a reason to introduce a second persistence engine for canonical state.

---

## 4. EPUB Renderer

**Decision:** `foliate-js`-class renderer (the library itself or a maintained fork/vendor of it).

**Evidence:** Real load of a public-domain EPUB produced correct TOC (16 entries), section splitting (14 sections), pagination, and native EPUB CFI locations with no custom parsing code.

**Rejected alternative:** Readium Web and `epub.js` were named as candidates in `ARCHITECTURE.md` §2/§12 but not comparatively spiked in this pass, since `foliate-js` cleared the bar with no blocking finding. The one real finding against it — API instability, no stable release, README recommends vendoring — is addressed by a Local Implementation Adjustment (pin/vendor the dependency, isolate behind the EPUB adapter) rather than by switching libraries. If the adapter isolation later proves insufficient to absorb upstream churn, Readium Web is the documented fallback candidate.

---

## 5. PDF Renderer

**Decision:** `pdf.js` (via `pdfjs-dist`).

**Evidence:** Headless text/geometry extraction confirmed: page count, viewport size, per-text-item transform matrix (x/y position), width, height all directly available via `getTextContent()`.

**Rejected alternative:** None comparatively spiked — `pdf.js` is the incumbent, most battle-tested browser-embeddable PDF engine and no evidence surfaced a reason to evaluate an alternative.

---

## 6. DocumentLocation Model

**Decision:** Unified envelope (`book_file_id`, `format`, `progression_hint`, `primary_anchor`, `fallback_anchors[]`, `context_selector?`) exactly as proposed in `ARCHITECTURE.md` §5, with one amendment: **text-quote/context fallback anchors are required in the same implementation pass as the primary anchor for every format**, not deferred as later hardening.

**Evidence:** EPUB CFI, PDF page+geometry, and OCR page+box anchors were all observed coming directly from their respective engines' own output (see M0-B/C/F). Because every primary anchor is tied to a specific engine/rendering pass, drift risk under content or OCR changes is real enough to justify making the fallback mandatory rather than optional.

**Rejected alternative:** Visual-page-number-only anchoring was already ruled out by the existing architecture (§5) for reflowable content; M0 evidence does not change that.

---

## 7. CJK Search / Indexing

**Decision:** SQLite FTS5 remains the index engine, **amended** to require a CJK segmentation/n-gram pre-processing adapter feeding it (bigram indexing or a lightweight word segmenter such as `jieba-rs`) before text is inserted into the index.

**Evidence:** `unicode61` tokenizer: 0/2 hits on real CJK substrings present in the source text (complete failure). `trigram` tokenizer: correct on 3+ character CJK queries, 0/2 hits on 2-character queries — and most Chinese search terms are 2 characters.

**Rejected alternative:** A dedicated Rust full-text engine (`tantivy`) with native CJK tokenizer support was considered but not spiked, to avoid introducing a second index technology before confirming the cheaper adapter-in-front-of-FTS5 approach is insufficient. This is deferred to M4, not rejected outright.

**This is the one Architecture Amendment produced by M0** (not a product-contract conflict — the frozen CJK search requirement remains achievable).

---

## 8. OCR Document Workload

**Decision:** A PP-OCR-class ONNX-based local OCR pipeline (evaluated via RapidOCR in Python; production path runs the same ONNX models via the Rust `ort` crate rather than shipping Python).

**Evidence:** 96–99% recognition confidence on synthetic English and mixed CJK/Latin test images, with correct reading order and per-line bounding boxes returned. One known degraded case identified: a CJK/Latin word-boundary space was silently dropped in output.

**Rejected alternative:** Tesseract was the first candidate attempted; its installer requires interactive elevation and failed non-interactively in this environment, which is itself evidence against it as an unattended-provisionable dependency (independent of its recognition quality, which was not evaluated).

---

## 9. Local Font Enumeration / Custom-Font Handling

**Decision:** No change from `ARCHITECTURE.md` §14 (PUBLISHER / BUILT_IN / SYSTEM / CUSTOM provider types, no redistribution of SYSTEM or CUSTOM font bytes).

**Evidence:** Not independently spiked in this M0 pass — no technical hypothesis here was in dispute; this is a policy/licensing architecture, not a feasibility question, and font enumeration itself is a standard OS-API capability with no credible feasibility risk identified.

---

## 10. ReadingSession Timing Signals

**Decision:** Use Tauri's native `WindowEvent::Focused(bool)` for foreground/background; rely on the existing frozen 5-minute inactivity-timeout policy as the practical (if slightly delayed) OS sleep/lock signal for V1, rather than building a dedicated Win32 power/session-lock hook.

**Evidence:** Confirmed `Focused(bool)` exists in the actual resolved `tauri-runtime` dependency source (v2.11.3). Confirmed no dedicated sleep/lock window event exists in the same enum.

**Rejected alternative (deferred, not rejected):** A raw Win32 `WM_POWERBROADCAST`/session-lock hook via the `windows` crate is technically reachable (already a transitive dependency) and is documented as a future enhancement candidate rather than a V1 requirement.

---

## 11. Backup / Restore Feasibility

**Decision:** Archive-based backup/restore (per `ARCHITECTURE.md` §15) is technically feasible at the filesystem-operation layer; production implementation should use a Rust archive crate (e.g. `zip`) rather than shelling out to OS tooling, so the app controls manifest/versioning metadata.

**Evidence:** Byte-identical archive/extract round trip confirmed on a synthetic app-data folder.

**Rejected alternative:** None — this track had one credible approach, and it cleared.

---

## 12. Update-Awareness Implementation Path

**Decision:** GitHub Releases API + SemVer comparison, exactly as `ARCHITECTURE.md` §16 proposes, **amended** to add an explicit "no stable release available" outcome distinct from `Check Failed`.

**Evidence:** Real API calls against both an empty repo (404, structured, not a network error) and a populated repo (draft/prerelease flags directly present) confirmed the mechanism works as designed. Offline/unreachable-host behavior confirmed clean and fast under a short timeout.

**Rejected alternative:** None — no alternative release-feed source was under consideration.

---

## 13. Packaging Implications

**Decision:** No packaging blocker identified. Two concrete packaging-relevant findings to carry forward into M10 (Release Candidate, Packaging & Windows Release) planning, not resolved now:

1. The build/CI image must provision a C toolchain explicitly (not assumed present from a bare `rustup` install).
2. Any V1 feature that would rely on an installer requiring interactive elevation is not viable as an unattended flow on a locked-down Windows profile (observed directly via the Tesseract installer failure) — this reinforces, with direct evidence, why OCR was evaluated via a no-admin-required package instead.

---

## Known Degraded Cases Carried Forward

- CJK/Latin word-boundary spacing loss in OCR output (M0-F) — correction-mapping design (M4/M5) should expect and handle this class of artifact.
- 2-character CJK search terms will silently return zero results against stock FTS5 trigram tokenization until the M0-E segmentation adapter is implemented — must not ship search before that adapter exists.
- `foliate-js` upstream API instability — mitigated by vendoring/pinning, not eliminated.

## Residual Risks for Later Milestones

- M1: live window launch/native visual acceptance for the Tauri shell (M0-A only proved compile-time feasibility).
- M2: PDF/EPUB visual rendering, zoom/fit, selection UX, fixed-layout EPUB, CJK fallback fonts, large-document performance — none of these were exercised, only their underlying API primitives.
- M3: end-to-end anchor stability under reflow/typography/OCR-rerun; ReadingSession sleep/lock precision.
- M4: CJK segmentation adapter implementation and its performance/quality at library scale; tantivy fallback evaluation if the adapter proves inadequate.
- M5: OCR quality on real degraded/multi-column/CJK scans (only clean synthetic single-column images were tested); pause/resume/cancel job control.
- M8: full Restore workflow (preview, validation, safety snapshot, transactional replace, relink) above the proven raw-archive layer.
- M10: C-toolchain and elevation-free provisioning requirements feed directly into the packaging/installer design.

## Conflict / Escalation Check

No frozen `PRODUCT_SPEC.md` semantic required weakening. No frozen `DESIGN.md` UI authority required weakening. One Architecture Amendment (§7, CJK search) was required; it was resolvable inside architecture authority per `ARCHITECTURE.md`'s own promotion rule and did not require a product compromise. **No escalation triggered.**

---

## M0 Exit Gate Self-Check (against `ROADMAP.md`)

- Critical unknowns have evidence — yes, all 9 tracks (A–I) produced a runnable artifact or direct source-level evidence, not literature review alone.
- Architecture boundaries are coherent — yes, no cross-layer contradiction surfaced.
- No known blocker invalidates frozen V1 scope — confirmed, see Conflict/Escalation Check above.
- `DocumentLocation` has a credible cross-format design — yes, §6 above, backed by per-format evidence.
- OCR has a credible document-page path — yes, §8 above.
- Backup/restore is technically feasible — yes, §11 above.
- Packaging direction is credible — yes, §13 above, with two concrete follow-up items for M10.
- Later Milestones can proceed without guessing core architecture — yes, subject to the Residual Risks list above being tracked, not silently dropped.

**M0 passes its exit gate on the evidence in this ADR and `M0_TECHNICAL_SPIKE_REPORT.md`.**

---

### HARD STOP

Per `ROADMAP.md`: this ADR does **not** self-promote architecture from Hypothesis to Accepted Baseline. Human review and explicit approval of the Architecture Lock is required before M1 may begin.
