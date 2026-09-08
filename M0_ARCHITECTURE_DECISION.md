# M0 Architecture Decision Record

Status: **Accepted Architecture Baseline** — approved at the second Human Architecture Gate (2026-09-08, HEAD `5729bf4`)
Date: 2026-09-08 (original), corrected 2026-09-08
Evidence source: `M0_TECHNICAL_SPIKE_REPORT.md`, reproducible harness at `tooling/m0-evidence/`

Per `ARCHITECTURE.md`'s Architecture Promotion Rule, this document is the M0 output. It does **not** itself promote architecture to "Accepted Architecture Baseline" — only explicit human approval at the Human Architecture Gate does that (`ROADMAP.md` HARD STOP). Until then this remains an **evidenced hypothesis**.

This ADR covers the 13 items required by `ARCHITECTURE.md` §20.

## Corrective Pass Notice

The first Human Architecture Gate review **declined to approve** this ADR's Architecture Lock. Failure attribution (full detail in `M0_TECHNICAL_SPIKE_REPORT.md`, "Corrective Evidence Pass" section): a **Validation/Evidence-Promotion mismatch** — this ADR's Exit Gate self-check (bottom of this file) declared items satisfied ("`DocumentLocation` has a credible cross-format design", "OCR has a credible document-page path") on evidence that was actually synthetic/narrower than those specific claims required, while §10 additionally **self-approved a frozen-product-semantic downgrade** (ReadingSession sleep/lock) that required a Human Gate, not an M0 "Local Implementation Adjustment." Both are corrected below, marked **"(corrective pass)"** inline at each affected item. No other item changed. The original evidence and decisions not marked as corrected stand as originally recorded.

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

**(corrective pass)** Fixed-layout mode — previously entirely untested — was spiked against a real, self-authored, valid `rendition:layout=pre-paginated` EPUB3 fixture: `foliate-js` correctly parsed the layout/orientation/spread metadata and navigated the fixed pages with working CFI generation. Renderer-lock sanity confirmed; full fixed-layout typography/rendering remains M2 depth. See `M0_TECHNICAL_SPIKE_REPORT.md` M0-B corrective update.

---

## 5. PDF Renderer

**Decision:** `pdf.js` (via `pdfjs-dist`).

**Evidence:** Headless text/geometry extraction confirmed: page count, viewport size, per-text-item transform matrix (x/y position), width, height all directly available via `getTextContent()`.

**Rejected alternative:** None comparatively spiked — `pdf.js` is the incumbent, most battle-tested browser-embeddable PDF engine and no evidence surfaced a reason to evaluate an alternative.

**(corrective pass)** Re-tested against a real 15-page academic PDF (not the original 1-line dummy fixture): all pages parsed without error, 2,696 text items total, 337ms wall time, no pathological per-page timing blowup. See `M0_TECHNICAL_SPIKE_REPORT.md` M0-C corrective update.

---

## 6. DocumentLocation Model

**Decision:** Unified envelope (`book_file_id`, `format`, `progression_hint`, `primary_anchor`, `fallback_anchors[]`, `context_selector?`) exactly as proposed in `ARCHITECTURE.md` §5, with one amendment: **text-quote/context fallback anchors are required in the same implementation pass as the primary anchor for every format**, not deferred as later hardening.

**Evidence:** EPUB CFI, PDF page+geometry, and OCR page+box anchors were all observed coming directly from their respective engines' own output (see M0-B/C/F). Because every primary anchor is tied to a specific engine/rendering pass, drift risk under content or OCR changes is real enough to justify making the fallback mandatory rather than optional.

**Rejected alternative:** Visual-page-number-only anchoring was already ruled out by the existing architecture (§5) for reflowable content; M0 evidence does not change that.

**(corrective pass)** This is the item the Human Architecture Gate specifically flagged: the original evidence above was *synthesized* from adjacent tracks, not a dedicated reopen/resize/typography/jump-back spike. That spike now exists for EPUB, PDF, and TXT (real fixtures, real content edits, real fresh-instance reopen): EPUB reopen is byte-identical on CFI and rendered text; typography/resize changes keep navigation within the correct section but the *reported* relocate CFI is not always byte-identical to the requested anchor (implementation note, not a defect); PDF normalized coordinates round-trip exactly across zoom levels and reopen-by-text-quote is exact; on a real academic PDF, short text-quotes were confirmed genuinely ambiguous (`'Google Brain'` × 3 on one page), concretely justifying the mandatory `context_selector`; TXT's context-fallback chain correctly recovers a shifted anchor. OCR anchor stability remains M5 depth (unchanged). See `M0_TECHNICAL_SPIKE_REPORT.md` M0-D corrective update for full detail.

---

## 7. CJK Search / Indexing

**Decision:** SQLite FTS5 remains the index engine, **amended** to require a CJK segmentation/n-gram pre-processing adapter feeding it (bigram indexing or a lightweight word segmenter such as `jieba-rs`) before text is inserted into the index.

**Evidence:** `unicode61` tokenizer: 0/2 hits on real CJK substrings present in the source text (complete failure). `trigram` tokenizer: correct on 3+ character CJK queries, 0/2 hits on 2-character queries — and most Chinese search terms are 2 characters.

**Rejected alternative:** A dedicated Rust full-text engine (`tantivy`) with native CJK tokenizer support was considered but not spiked, to avoid introducing a second index technology before confirming the cheaper adapter-in-front-of-FTS5 approach is insufficient. This is deferred to M4, not rejected outright.

**This is the one Architecture Amendment produced by M0** (not a product-contract conflict — the frozen CJK search requirement remains achievable).

**(corrective pass)** The adapter named above was actually built and tested, not only proposed: a bigram-expansion index-time transform plus an FTS5 phrase-query at query time correctly resolved 2-character Chinese queries, English queries, and a mixed CJK/Latin phrase query, with no false positives on an absent term. The Amendment is now backed by a working implementation. See `M0_TECHNICAL_SPIKE_REPORT.md` M0-E corrective update.

---

## 8. OCR Document Workload

**Decision:** A PP-OCR-class ONNX-based local OCR pipeline (evaluated via RapidOCR in Python; production path runs the same ONNX models via the Rust `ort` crate rather than shipping Python).

**Evidence:** 96–99% recognition confidence on synthetic English and mixed CJK/Latin test images, with correct reading order and per-line bounding boxes returned. One known degraded case identified: a CJK/Latin word-boundary space was silently dropped in output.

**Rejected alternative:** Tesseract was the first candidate attempted; its installer requires interactive elevation and failed non-interactively in this environment, which is itself evidence against it as an unattended-provisionable dependency (independent of its recognition quality, which was not evaluated).

**(corrective pass)** This is the other item the Human Architecture Gate specifically flagged: the original evidence was two clean, synthetic, single-column images. This pass ran the same pipeline against two real scanned pages of a public-domain 1893 book, one of them genuinely multi-column with vertical classical-Chinese text. New confirmed degraded case (not hypothetical): detected lines sometimes **splice text across column boundaries**, and vertical/classical-layout **reading order is not correctly recovered** by this horizontally-trained model family. Separately, the claimed production path (Rust `ort`, not Python) was actually run for the first time: real inference against the same real degraded page succeeded (correct output tensor shape, sensible textness statistics, 490ms). Also newly discovered: `ort-sys` has no prebuilt binary for the `x86_64-pc-windows-gnu` target this environment's toolchain resolves to — worked around via `ort`'s `load-dynamic` feature against the `onnxruntime.dll` already shipped by the `onnxruntime` pip package; this is now a packaging note (see §13). See `M0_TECHNICAL_SPIKE_REPORT.md` M0-F corrective update.

---

## 9. Local Font Enumeration / Custom-Font Handling

**Decision:** No change from `ARCHITECTURE.md` §14 (PUBLISHER / BUILT_IN / SYSTEM / CUSTOM provider types, no redistribution of SYSTEM or CUSTOM font bytes).

**Evidence:** Not independently spiked in this M0 pass — no technical hypothesis here was in dispute; this is a policy/licensing architecture, not a feasibility question, and font enumeration itself is a standard OS-API capability with no credible feasibility risk identified.

---

## 10. ReadingSession Timing Signals

**Decision (original, RETRACTED — see corrective pass below):** ~~Use Tauri's native `WindowEvent::Focused(bool)` for foreground/background; rely on the existing frozen 5-minute inactivity-timeout policy as the practical (if slightly delayed) OS sleep/lock signal for V1, rather than building a dedicated Win32 power/session-lock hook.~~

**Evidence:** Confirmed `Focused(bool)` exists in the actual resolved `tauri-runtime` dependency source (v2.11.3). Confirmed no dedicated sleep/lock window event exists in the same enum.

**Rejected alternative (original framing — corrected below):** ~~A raw Win32 `WM_POWERBROADCAST`/session-lock hook via the `windows` crate is technically reachable (already a transitive dependency) and is documented as a future enhancement candidate rather than a V1 requirement.~~

**(corrective pass) Retraction:** The original decision above quietly downgraded `PRODUCT_SPEC.md`'s frozen, unconditional "OS lock/sleep always pauses" rule to a ~5-minute-heuristic-tolerant V1 behavior, self-approved as a "Local Implementation Adjustment." That is a frozen-product-semantic change, which `ROADMAP.md` §1.8 reserves for a Human Gate — M0 architecture authority does not extend to relaxing frozen product semantics. This decision is retracted.

**Decision (corrected):** Use Tauri's native `WindowEvent::Focused(bool)` for foreground/background, **and** a real Win32 session-lock/power-broadcast hook (`WTSRegisterSessionNotification` + `WM_WTSSESSION_CHANGE` + `WM_POWERBROADCAST`, via the `windows` crate) as the **required V1 mechanism** for sleep/lock, with exact pause/resume boundaries. The inactivity-timeout policy remains V1 only for genuine inactivity (no user input), which has no dedicated OS signal of its own — it is no longer the mechanism for sleep/lock.

**Evidence (corrective pass):** Built and ran a real hidden Win32 window registered via `WTSRegisterSessionNotification` (real API call, succeeded). Drove synthetic lock/unlock and suspend/resume events through the real `WndProc` via `SendMessageW`, with real wall-clock delays between them. Measured exclusion intervals (300ms, 150ms) matched the real delays exactly — computed from `Instant::now()` deltas at dispatch time, not a fixed timeout bucket. See `M0_TECHNICAL_SPIKE_REPORT.md` M0-G corrective update.

---

## 11. Backup / Restore Feasibility

**Decision:** Archive-based backup/restore (per `ARCHITECTURE.md` §15) is technically feasible at the filesystem-operation layer; production implementation should use a Rust archive crate (e.g. `zip`) rather than shelling out to OS tooling, so the app controls manifest/versioning metadata.

**Evidence:** Byte-identical archive/extract round trip confirmed on a synthetic app-data folder.

**Rejected alternative:** None — this track had one credible approach, and it cleared.

**(corrective pass)** The full manifest → preview → safety-snapshot → restore → verify workflow (not just a raw archive round-trip) was implemented and tested against a synthetic library with both Managed-Copy and Reference books: preview does not mutate state; a safety snapshot is taken before every restore; Reference-file relink needs are surfaced (never silently dropped) when the external file is missing or fingerprint-mismatched; a corrupted/incomplete archive is rejected before any live state is touched, with no partial apply. The full M8 restore UI/versioning polish remains legitimately deferred. See `M0_TECHNICAL_SPIKE_REPORT.md` M0-H corrective update.

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
3. **(corrective pass)** `ort-sys` (the Rust ONNX Runtime binding used for OCR, §8) ships no prebuilt binary for the `x86_64-pc-windows-gnu` target — only MSVC. Release packaging must either target MSVC for the OCR component, or ship/load `onnxruntime.dll` dynamically (as this pass's spike did via `load-dynamic`) rather than assuming a static prebuilt link will succeed.

---

## Known Degraded Cases Carried Forward

- CJK/Latin word-boundary spacing loss in OCR output (M0-F) — correction-mapping design (M4/M5) should expect and handle this class of artifact.
- **(corrective pass, new)** OCR line detection can splice text across column boundaries on multi-column pages, and does not correctly recover top-to-bottom/right-to-left reading order on vertical classical-Chinese layouts — confirmed on a real scanned page, not hypothetical. M5's correction-mapping and layout-analysis design must plan for both.
- 2-character CJK search terms will silently return zero results against stock FTS5 trigram tokenization until the M0-E segmentation adapter is implemented — must not ship search before that adapter exists. **(corrective pass)** The adapter now has a working reference implementation (`tooling/m0-evidence/scripts/m0e_cjk_search_adapter.py`) to build M4's production version from.
- `foliate-js` upstream API instability — mitigated by vendoring/pinning, not eliminated.
- **(corrective pass, new)** EPUB CFI reported by `relocate` after a typography/resize change is not always byte-identical to a previously-saved CFI for the same logical anchor — implementation must re-derive/verify position from content, not assume CFI string equality, when layout has changed in between.
- **(corrective pass, new)** Short text-quote fragments are confirmed genuinely ambiguous on real documents (e.g. a 2-word phrase repeated 3× on one PDF page) — `context_selector` is a real requirement, not a theoretical one.

## Residual Risks for Later Milestones

- M1: live window launch/native visual acceptance for the Tauri shell (M0-A only proved compile-time feasibility).
- M2: PDF/EPUB visual rendering, zoom/fit, selection UX, CJK fallback fonts, large-document (100s of pages) performance. **(corrective pass)** Fixed-layout EPUB parsing and a real 15-page PDF are no longer purely untested — see §4/§5 — but full M2-depth rendering/typography/UX remains M2 scope, unchanged.
- M3: end-to-end anchor stability under OCR-rerun specifically remains M3 depth. **(corrective pass)** Reopen/resize/typography/jump-back for EPUB/PDF/TXT is no longer a residual risk — see §6 — it is now directly evidenced.
- M4: CJK segmentation adapter's performance/quality at library scale (the adapter's *correctness* is no longer residual — see §7); tantivy fallback evaluation if the adapter proves inadequate at scale.
- M5: OCR quality/tuning on a broader real-scan corpus (degraded/multi-column/CJK is no longer entirely untested — see §8 — but one real page each is not a production-quality benchmark); pause/resume/cancel job control; the newly-confirmed column-crossing and reading-order degraded cases need a layout-analysis mitigation design.
- M8: full Restore **UI**/versioning polish above the now-evidenced core workflow (manifest/preview/snapshot/restore/verify/relink is no longer residual — see §11).
- M10: C-toolchain, elevation-free provisioning, and the `ort-sys` GNU-target packaging note (§13) all feed directly into the packaging/installer design.

## Conflict / Escalation Check

No frozen `PRODUCT_SPEC.md` semantic required weakening in the corrected decision set. **One item in the original pass (§10, ReadingSession) had self-approved a frozen-semantic downgrade without escalating; that has been retracted and corrected in this pass, not escalated further, since the corrected decision fully restores conformance to the frozen rule and required no product compromise to do so.** One Architecture Amendment (§7, CJK search) was required; it was resolvable inside architecture authority per `ARCHITECTURE.md`'s own promotion rule and did not require a product compromise. No frozen `DESIGN.md` UI authority required weakening. **No escalation triggered** — the §10 issue was a promotion-process error, corrected within this pass, not a product-vs-technical conflict requiring human adjudication of a trade-off.

---

## M0 Exit Gate Self-Check (against `ROADMAP.md`) — re-run after the corrective pass

- Critical unknowns have evidence — yes, all 9 tracks (A–I) produced a runnable artifact or direct source-level evidence; six tracks additionally received corrective-pass evidence closing gaps between the original spike depth and what the exit-gate claims below actually require.
- Architecture boundaries are coherent — yes, no cross-layer contradiction surfaced.
- No known blocker invalidates frozen V1 scope — confirmed, see Conflict/Escalation Check above (including the §10 retraction/correction).
- `DocumentLocation` has a credible cross-format design — yes, §6, **now backed by direct reopen/resize/typography/jump-back evidence for EPUB/PDF/TXT** rather than cross-track synthesis alone.
- OCR has a credible document-page path — yes, §8, **now backed by a real degraded/multi-column/CJK page and a real Rust `ort` inference run**, with new confirmed (not hypothetical) degraded cases carried into M5.
- Backup/restore is technically feasible — yes, §11, **now backed by the full manifest/preview/snapshot/restore/verify workflow**, not only a raw archive round-trip.
- Packaging direction is credible — yes, §13, with three concrete follow-up items for M10 (one new: `ort-sys` GNU-target binary availability).
- Later Milestones can proceed without guessing core architecture — yes, subject to the Residual Risks list above being tracked, not silently dropped.

**M0 passes its exit gate on the evidence in this ADR and `M0_TECHNICAL_SPIKE_REPORT.md`, as strengthened by the corrective pass. A reproducible evidence harness backing every claim above is committed at `tooling/m0-evidence/`.**

---

### HARD STOP — resolved

Per `ROADMAP.md`: this ADR does not self-promote architecture from Hypothesis to Accepted Baseline; only explicit human approval does that. The first submission of this ADR was declined pending the corrective pass recorded above. This second submission was **approved** at the Human Architecture Gate on 2026-09-08 (HEAD `5729bf4`), promoting this document's decisions from Architecture Hypothesis to **Accepted Architecture Baseline**, together with a continuous M1→M8→Feature Complete Candidate autonomous engineering authorization envelope. The Residual Risks list above remains binding on the Milestones named there; a CI Promotion Gate (`ROADMAP.md` §1.9) was added at this same approval, effective from M1 onward. The next Human Gate in this envelope is the Human Feature Freeze Gate after M8.
