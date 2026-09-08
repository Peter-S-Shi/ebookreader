# M0 Technical Spike Report

Status: **M0 Corrective Evidence Pass Complete — Awaiting Second Human Architecture Gate**
Date: 2026-09-08 (original pass), corrective pass appended 2026-09-08

This report records the Question → Prototype/Experiment → Evidence → Finding → Architecture Implication → ACCEPT/MODIFY/REJECT sequence for each M0 evidence track, per `ROADMAP.md` Milestone 0.

Evidence depth is scaled to risk (ROADMAP 1.5): tracks with high architectural leverage (M0-A, M0-E, M0-F) received the deepest real spikes; lower-risk tracks received a real but narrower spike plus documented reasoning. No track was resolved by literature review alone without at least one runnable artifact.

The original pass's spike code/fixtures were built outside the repository and not committed. **The corrective pass changes this**: a minimal, public-safe, reproducible evidence harness is now committed at `tooling/m0-evidence/` (scripts, small redistributable/self-authored fixtures with SHA-256 hashes and provenance, and captured result output — see `tooling/m0-evidence/README.md`). This report and `M0_ARCHITECTURE_DECISION.md` remain the narrative/decision record; the harness is the reproducible backing evidence.

---

## Corrective Evidence Pass (2026-09-08)

### Why this pass exists

The Human Architecture Gate reviewed the original M0 pass (commit `0291c51`) and **did not approve the Architecture Lock**, while explicitly *not* invalidating the evidence already gathered. The corrective instruction was to keep everything already established and fix specific, named gaps rather than redo M0 from scratch.

### Failure Attribution (per `ROADMAP.md` §1.4)

**Layer identified: Validation / Evidence-Promotion mismatch (layer 4), with a contributing layer 5 (Documentation/State) symptom.**

The root problem was not that the original spikes were fabricated or dishonest — every claim in the original report was backed by a real artifact. The problem is that **the promotion decision outran the evidence**: `ROADMAP.md`'s own M0 Success Evidence list and Exit Gate criteria are broader than what the original spikes actually covered, and `M0_ARCHITECTURE_DECISION.md` then declared the M0 Exit Gate self-check satisfied while its own "Residual Risks for Later Milestones" section listed several of those same required-for-exit items (DocumentLocation anchor stability under reflow/typography/reopen; OCR quality on real degraded/multi-column/CJK scans; ReadingSession sleep/lock precision; the full Restore workflow) as *deferred to M1–M8*. Deferring implementation depth to later milestones is correct and expected — M0 was never meant to finish M2/M5/M8's own work — but two of those deferrals were not implementation depth, they were **feasibility questions M0's own exit gate explicitly names**: "`DocumentLocation` has a credible cross-format design" and "OCR has a credible document-page path" are M0 Exit Gate line items in `ROADMAP.md`, not M1+ line items. Declaring PASS while the evidence for those specific exit-gate claims was synthetic-only (clean single-line OCR images; no actual reopen/resize/typography spike for DocumentLocation) is the mismatch: the *contract* (what M0's exit gate requires) was wider than the *spike* (what was actually run), and the ADR's self-check did not surface that gap before declaring PASS.

Two smaller, correctly-scoped deferrals were *not* wrong and are unchanged by this pass: the full M8 Restore UI (preview/versioning polish beyond the core workflow) and M2-level rendering polish (zoom/fit UI, large-book performance tuning) remain legitimately out of M0's depth — M0 only needed to prove the underlying mechanism is credible, which the corrective pass now does more rigorously for backup/restore specifically (see M0-H below), while intentionally still not building the M8 UI.

**Repair routing (per `ROADMAP.md` §1.4):** Validation/Test failures route to "repair test, rubric, or verification logic" — this pass repairs the verification logic (raises spike rigor to match the ROADMAP's own contract) rather than treating it as a Requirement/Spec problem (the frozen product/UI contracts were never in question) or an Implementation problem (there is no shipped implementation yet to debug).

### What changed in this pass

New, real evidence was added for exactly six gaps the corrective instruction named — no track was re-run wholesale, and no original finding was deleted or reversed:

1. **DocumentLocation reopen/resize/typography/jump-back** — real spikes for EPUB, PDF, and TXT (previously: reasoned from adjacent tracks, no dedicated spike).
2. **CJK search adapter** — a real bigram/FTS5-phrase-query implementation, tested against 2-character Chinese, English, and mixed CJK/Latin queries (previously: the *gap* was diagnosed, but no adapter was actually built or tested).
3. **OCR on real degraded/multi-column/CJK pages, plus a real Rust `ort` ONNX inference** (previously: only clean synthetic single-line images, and only the Python RapidOCR pipeline — no Rust-side inference at all).
4. **ReadingSession Win32 sleep/session-lock hook**, with exact (not ~5-minute-heuristic) pause/resume boundaries (previously: the hook was identified as *possible* but not built; the report explicitly downgraded it to "enhancement, not V1 requirement," which conflicts with `PRODUCT_SPEC.md`'s frozen "OS lock/sleep always pauses" rule — that downgrade is retracted in this pass).
5. **Backup/Restore minimal real workflow**: manifest → preview → safety snapshot → restore → verify, including Reference-relink surfacing and Managed-Copy handling (previously: only a raw archive/extract byte round-trip, with no manifest, no preview, no snapshot, no relink logic).
6. **Renderer-lock sanity checks**: a real fixed-layout EPUB and a real larger (15-page) PDF (previously: only reflowable EPUB and a 1-line PDF were exercised).

Each corrective finding is appended to its track below as a **"Corrective Update (2026-09-08)"** subsection, directly under the original finding it supersedes or strengthens. Original findings are left in place, unedited, so the record shows what was known when the (declined) first promotion decision was made.

---

## M0-A — Desktop Shell & Local Storage

**Question:** Does the leading hypothesis (Tauri 2 + React/TS + Rust + SQLite) actually build and integrate on this Windows target, and what does it require?

**Prototype/Experiment:**
- Probed the existing Rust toolchain: `rustc`/`cargo` present, but `stable-x86_64-pc-windows-gnu` is the active default toolchain and **no C compiler was present** (`cl.exe` absent, `gcc.exe` absent). Confirmed pure-Rust crates link fine (self-contained GNU linker), but any crate with a C build script (`cc-rs`) fails immediately — this includes `rusqlite`'s `bundled` feature and would include Tauri's own native glue.
- Installed MinGW-w64 (WinLibs UCRT build) via `winget` to supply `gcc.exe`. Re-ran the failing build; it now succeeds.
- Scaffolded a real Tauri 2 app (`npm create tauri-app@latest -- --template react-ts`), ran `npm install`, then `cargo check` inside `src-tauri` with `CC=gcc`.
- Separately compiled `rusqlite` with the `bundled` SQLite feature.
- Attempted `winget install UB-Mannheim.TesseractOCR` (unrelated OCR track, but same class of finding) — it required interactive elevation this sandbox cannot grant, and failed non-interactively.

**Evidence:**
- Tauri 2 + React/TS scaffold: `cargo check` finished successfully in 1m43s after the toolchain fix (log captured), compiling `tauri v2.11.5`, `tauri-runtime-wry`, `webview2-com`, `tao`, and the full dependency graph with no errors.
- `reg query` confirms Microsoft Edge WebView2 Runtime is already installed on this machine (v152.0.4191.66) — the required Windows runtime dependency for Tauri's webview is present without extra installer work.
- `rusqlite` (bundled SQLite) compiled cleanly once `gcc.exe` was available.
- The Tesseract installer failure demonstrates that **silent/unattended installers requiring elevation cannot be used as an in-app or CI provisioning step** on a locked-down Windows profile; this is a packaging-relevant finding, not just a dev-sandbox inconvenience.

**Finding:**
- The leading shell hypothesis is buildable and its native dependencies (WebView2, SQLite) are technically compatible with this environment once a C toolchain is present.
- A bare `rustup`-installed Windows Rust toolchain does **not** include a C compiler by default. This is a real first-run setup requirement for any contributor/CI image, not a one-off sandbox quirk.
- Elevation-requiring installers are unsuitable for anything that must run unattended (including, by analogy, any V1 feature that might shell out to an installer).

**Architecture Implication:**
- Confirms the shell/persistence layer of the leading hypothesis (`ARCHITECTURE.md` §2–§3.4) is technically sound.
- Adds a concrete environment/packaging requirement: the build (dev and CI) image must ship or provision a C toolchain (MinGW-w64 or MSVC Build Tools) alongside `rustup`. This belongs in a future CONTRIBUTING/dev-setup doc, not in `ARCHITECTURE.md` itself.
- Reinforces `ARCHITECTURE.md` §16 (no silent installer replacement) — now backed by direct evidence that elevation-requiring installers fail unattended on this class of Windows machine.

**Decision:** **ACCEPT** — Tauri 2 / React+TS / Rust / SQLite shell hypothesis, with a Local Implementation Adjustment (document the C-toolchain prerequisite).

**Residual risk (deferred to M1):** Full runtime launch (actual window open, close/reopen, OS focus/sleep/lock signal wiring) was not exercised — only compile-time evidence was gathered in this sandbox. `M0-G` below covers the event API surface; live-window verification should happen as part of M1 native visual acceptance.

---

## M0-B — EPUB Renderer

**Question:** Does a `foliate-js`-class renderer credibly handle real EPUB content, TOC, sections, and pagination in an embeddable web view?

**Prototype/Experiment:**
- Installed `foliate-js` (confirmed it is npm-published, not only git-submodule-distributed as its README suggests).
- Built a minimal Vite + React host page registering the library's `<foliate-view>` custom element.
- Downloaded a real public-domain EPUB (Project Gutenberg's *Alice's Adventures in Wonderland*, `alice.epub`, no-images variant) as a synthetic fixture.
- Loaded it through `view.open(file)` in a live browser preview and listened to `relocate`/`load` events.

**Evidence (captured from the live preview, not simulated):**
```
fetched epub bytes: 136519
view.open resolved
book toc entries: 16
book sections: 14
relocate: {"fraction":0.0022...,"section":{"current":0,"total":14},
  "location":{"current":0,"next":0,"total":129},
  "cfi":"epubcfi(/6/2!/4/2,,/2)", ...}
relocate: {... "cfi":"epubcfi(/6/4!/4/2[pg-header],,/8[pg-start-separator]/2/1:77)" ...}
```

**Finding:**
- Real TOC extraction (16 entries), real section splitting (14 sections), real pagination (129 locations in section 0), and real EPUB CFI generation all work out of the box with no custom glue code beyond registering the element and calling `open()`.
- The library's own README states it is **not API-stable** ("expect it to break... use at your own risk") and recommends vendoring via git submodule rather than depending on the npm release cadence. This is a real supply-chain/maintenance risk, not a hypothetical one.
- Fixed-layout EPUB, publisher font override, CJK fallback, in-book search, and large-book performance were **not** exercised in this pass — the spike only proves reflowable single-book loading and location tracking.

**Architecture Implication:**
- Directly substantiates `ARCHITECTURE.md` §12 candidate and `DocumentLocation` §5 (EPUB CFI is confirmed available natively, not merely a paper option).
- The stability warning means the EPUB adapter (`ARCHITECTURE.md` §3.5) must wrap `foliate-js` behind EbookReader's own adapter interface so an upstream breaking change or a fork/vendor decision doesn't ripple into domain code — this was already the architecture's stated principle (§1, "reuse document engines; own document semantics"); this spike gives a concrete reason to enforce it strictly for this dependency specifically.

**Decision:** **ACCEPT** `foliate-js`-class renderer for reflowable EPUB, with a Local Implementation Adjustment: vendor/pin the dependency (git submodule or pinned tarball) rather than tracking npm `latest`, and isolate it fully behind the EPUB adapter.

**Residual risk (deferred to M1/M2):** Fixed-layout mode, embedded/publisher font handling, CJK fallback fonts, text selection, in-book search, and large-book (multi-hundred-page) performance are unverified and should be spiked again before M2 (Core Reading) implementation, not assumed from this result.

### Corrective Update (2026-09-08)

**Question added:** Does `foliate-js` actually load and correctly interpret a fixed-layout EPUB, not just reflowable ones?

**Prototype/Experiment:** Authored a minimal, valid, self-contained EPUB3 fixed-layout book (`rendition:layout=pre-paginated`, two pages, `tooling/m0-evidence/fixtures/make_fixed_layout_epub.py`) — self-authored so it is safely committable, since no real public-domain fixed-layout EPUB was readily available. Loaded it through the same `<foliate-view>` harness used for the reflowable-EPUB spike.

**Evidence** (`tooling/m0-evidence/results/m0_6_fixed_layout_epub.txt`):
```
book sections: 2
rendition layout metadata: {"layout":"pre-paginated","orientation":"landscape","spread":"none"}
lastLocation after next(): {"fraction":0.4955...,"section":{"current":0,"total":2}, ...
  "tocItem":{"label":"Page 1","href":"OEBPS/page1.xhtml", ...},"cfi":"epubcfi(/6/2)", ...}
```

**Finding:** `foliate-js` correctly parses `rendition:layout`/`orientation`/`spread` EPUB3 metadata and correctly treats each fixed-layout page as its own section with working navigation and CFI generation. This is a renderer-lock sanity check (the code path exists and doesn't error), not a full fixed-layout typography/rendering validation — that remains M2 depth, unchanged from the original residual-risk note above.

**Decision:** No change to the M0-B ACCEPT decision. This closes the specific "was fixed-layout even wired up in the library" unknown that the original pass left completely untouched.

---

## M0-C — PDF Renderer

**Question:** Does `pdf.js` deliver a usable text layer with real geometry for a text PDF, headlessly (i.e., independent of a full browser chrome)?

**Prototype/Experiment:**
- Installed `pdfjs-dist` and ran it under plain Node (via its `legacy/build/pdf.mjs` entry) against a real PDF fixture, extracting page count, viewport size, text content, and per-text-item transform/width/height.

**Evidence:**
```
numPages: 1
page1 size: 595 842
text sample: "Dummy PDF file"
{"str":"Dummy PDF file","transform":[16.1,0,0,16.1,56.8,758.1],"width":123.41,"height":16.1}
```

**Finding:**
- Text extraction, page geometry (in PDF points), and per-glyph-run transform matrices (giving x/y position, effective font size via the transform, and bounding width/height) are all directly available from `pdf.js`'s `getTextContent()` API — sufficient raw material for both text selection rectangles and `DocumentLocation` geometry anchors (`ARCHITECTURE.md` §5, PDF candidates: page index + geometry/bounding box + text quote).
- The fixture used was a single-page, single-line PDF; this proves the API surface works, not real-world performance on large/complex documents.

**Architecture Implication:**
- Confirms the geometry primitives `DocumentLocation`'s PDF anchor model needs are exposed by `pdf.js` without any custom PDF parsing.
- `pdf.js` is already the most battle-tested browser-embeddable PDF engine (it ships in Firefox and Chromium-based products), which lowers residual risk on the remaining unverified items relative to a less mature alternative.

**Decision:** **ACCEPT** `pdf.js` (or `pdfjs-dist`) as the PDF rendering/text-layer engine.

**Residual risk (deferred to M2):** Not yet spiked — large/multi-hundred-page performance, visual rendering + zoom/fit UI, text selection UX, scanned-page detection heuristics, rotation, and search UI. `pdf.js`'s maturity makes these lower-probability failure points than a novel engine would be, but they are not proven here and must be validated before M2 exit.

### Corrective Update (2026-09-08)

**Question added:** Does `pdf.js` hold up on a real, dense, multi-page document rather than the 1-line dummy PDF used originally?

**Prototype/Experiment:** Parsed a real 15-page academic PDF (arXiv 1706.03762, "Attention Is All You Need" — real tables, references, footnotes, multi-column-adjacent layout) page by page, `tooling/m0-evidence/scripts/m0c_pdf_larger.mjs` (fixture not vendored — see `tooling/m0-evidence/fixtures/EXTERNAL_FIXTURES.md`).

**Evidence** (`tooling/m0-evidence/results/m0c_pdf_larger_arxiv.txt`):
```
numPages: 15
page 1: 99 text items ... 50ms
...
page 15: 222 text items ... 49ms
TOTAL: 15 pages, 2696 text items, 337ms wall (load+parse all pages)
avg per page: 22.5ms
```

**Finding:** All 15 pages parsed without error, with consistent per-page timing (no pathological blowup on later/denser pages) and a real total of 2,696 text items. Still not a multi-hundred-page stress test, but no longer a 1-line toy fixture either — the original residual-risk framing ("not yet spiked") is now partially closed for the "does it choke on real, denser documents" question specifically, while the true large-document (100s of pages) stress test remains M2 depth as originally noted.

**Decision:** No change to the M0-C ACCEPT decision.

---

## M0-D — DocumentLocation

**Question:** Is a unified `DocumentLocation` envelope with per-format anchors (per `ARCHITECTURE.md` §5) credible across EPUB, PDF, TXT, and OCR PDF?

**Prototype/Experiment:** Synthesized from the M0-B, M0-C, and M0-F evidence above/below rather than a separate standalone spike — this track is a cross-format design question, not a new technology.

**Evidence:**
- EPUB: real CFI strings produced natively by `foliate-js` (see M0-B) — matches the "EPUB CFI" candidate directly.
- PDF: page index + per-item transform/geometry directly available from `pdf.js` (see M0-C) — matches the "page geometry/bounding box" candidate directly.
- OCR PDF: RapidOCR (see M0-F) returns per-line bounding boxes alongside recognized text, which is the same shape of primitive PDF geometry anchors use — so an OCR-derived anchor can reuse the PDF anchor's storage shape (page index + box) plus a corrected-text selector.
- TXT: not separately spiked; normalized character-offset anchoring is a well-understood, low-technical-risk pattern (no external rendering engine involved) and was judged not to need a runnable prototype at M0 depth.

**Finding:** Every format-specific anchor primitive the architecture proposes has now been observed coming directly out of the chosen per-format engine's own API — none require inventing new geometry/position tracking.

**Architecture Implication:** No change to the `DocumentLocation` envelope shape proposed in `ARCHITECTURE.md` §5. The envelope's `fallback_anchors[]` / `context_selector?` fields remain necessary because CFI/geometry alone can drift under content edits or OCR re-runs — text-quote-context fallback should be treated as required, not optional, for all four formats given how directly the primary anchors are tied to a specific rendering pass.

**Decision:** **ACCEPT** the unified envelope + per-format-anchor design as specified, with a Local Implementation Adjustment: implement the text-quote/context fallback anchor for all formats in the same milestone as the primary anchor, not as a later hardening pass, since M0 evidence shows all primary anchors are engine-output-dependent and therefore driftable.

**Residual risk (deferred to M1/M3):** Anchor stability under reflow/typography change (font size, window resize) and under document re-open after an OCR re-run are architecture-level claims not yet exercised end-to-end; this is explicitly the subject of Milestone 3.

### Corrective Update (2026-09-08)

**This is the primary gap the Human Architecture Gate flagged**: the original pass declared M0's exit-gate line "`DocumentLocation` has a credible cross-format design" satisfied by *synthesizing* from the EPUB/PDF/OCR tracks, without ever actually saving a location, changing something, and confirming it still resolves. That is now done for all three non-OCR formats (OCR anchor stability remains M5 depth, since it depends on the OCR correction-mapping design that track M0-F's corrective pass did not itself change).

**Question added:** For each format, if you save a location, then reopen / resize / change typography, does the anchor still resolve to the correct content — and can jump-back recover the original text even after a fresh app instance?

**EPUB — Prototype/Experiment:** Opened `alice.epub` via `foliate-js`, navigated to a mid-book location, saved its CFI. Then, on the *same* view instance: (a) applied a 220%-font-size typography override and re-navigated to the saved CFI; (b) shrank the view container from 400×500 to 220×700 and re-navigated. Then, on a **fresh** `<foliate-view>` instance with a fresh `File` object (simulating an app reopen), navigated to the saved CFI and compared both the CFI and the rendered text against the original. `tooling/m0-evidence/scripts/m0d_epub_docloc_App.tsx`.

**EPUB — Evidence** (`tooling/m0-evidence/results/m0d_epub_docloc.txt`):
```
[A] navigated, savedCfi=epubcfi(/6/8!/4/2[pgepubid00004],/2,/4/3:141)
[A] text snippet at anchor: "CHAPTER II.\nThe Pool of Tears\n\n“Curiouser and curiouser!” cried Alice..."
[A] after typography change (220% font), re-goTo(savedCfi) -> section match: true
[A] after resize (220x700), re-goTo(savedCfi) -> section match: true
[B fresh instance = "reopen"] goTo(savedCfi) -> cfi=epubcfi(/6/8!/4/2[pgepubid00004],/2,/4/3:141)
[B] jump-back text match vs [A] original: true
[B] jump-back cfi exact match: true
```

**EPUB — Finding:** Reopen is exact: a fresh view instance navigating to a saved CFI reproduces byte-identical CFI and byte-identical rendered text. Typography and resize changes both keep `goTo(savedCfi)` landing in the correct section (no wrong-chapter drift), but — an honest nuance the original pass could not have surfaced without actually running this — the CFI *reported back* by the `relocate` event after such a change is not always byte-identical to the requested anchor; it reflects the current page/view boundary. Implementation must re-derive position from content, not assume string-equality of a re-fetched `lastLocation.cfi` against a previously saved one, when typography/layout has changed in between.

**PDF — Prototype/Experiment:** Extracted a text item's pixel position and computed a normalized (0–1, viewport-relative) coordinate at scale 1.0. Recomputed the expected pixel position at scales 0.5/1.0/2.0/3.0 from that single normalized value. Then loaded the *same bytes* into a completely fresh `pdf.js` document instance (simulating reopen) and re-located the anchor purely by text-quote, with no cached object reference. `tooling/m0-evidence/scripts/m0d_pdf_docloc.mjs`.

**PDF — Evidence** (`tooling/m0-evidence/results/m0d_pdf_docloc.txt`, `sample.pdf`; richer real-document run in `results/m0d_pdf_ambiguity_arxiv.txt`):
```
[A] normalized pos: (0.0955, 0.9004)
  [resize scale=0.5] normalized->pixel: (28.40, 379.05)
  [resize scale=2]   normalized->pixel: (113.60, 1516.20)
[B fresh instance = "reopen"] re-locate by text-quote: FOUND, pixel pos matches [A]: true
[B] text-quote match count on page: 1
```
On the real 15-page arXiv PDF, the same ambiguity check found short fragments repeated on a single page (`'Google Brain'` × 3, `'∗'` × 7) — see `results/m0d_pdf_ambiguity_arxiv.txt`.

**PDF — Finding:** Normalized coordinates round-trip exactly across zoom levels (pure algebra, as expected from `pdf.js`'s viewport transform). Reopen-by-text-quote is exact on a real document. The ambiguity check on the arXiv PDF is new, concrete confirmation — not a hypothetical — that a short text-quote alone is unsafe as a sole anchor; `context_selector` is required, exactly as `ARCHITECTURE.md` already specified but had not been demonstrated as a *real* (not just theoretical) risk before this pass.

**TXT — Prototype/Experiment:** Implemented a normalized-character-offset anchor plus a context-window fallback (`tooling/m0-evidence/scripts/m0d_txt_docloc.py`). Tested: (a) reopen (re-deriving the offset from the same bytes); (b) that typography has no effect by construction (no layout state is stored for TXT); (c) jump-back after inserting 40 characters *before* the anchor point, which invalidates the raw stale offset; (d) jump-back after the anchor's immediate surrounding context also changed.

**TXT — Evidence** (`tooling/m0-evidence/results/m0d_txt_docloc.txt`):
```
3. [content shifted] stale offset=173 now points at: 'and a fine drizzle of rain, slipped qui' (WRONG if used naively)
   fallback re-anchor: offset=201 method=exact_quote recovered_text='slipped quickly through the glass doors'
   jump-back correctness after content shift: True
4. [context also shifted] fallback re-anchor: offset=172 method=exact_quote ... still resolves: True
OVERALL: PASS
```

**TXT — Finding:** A naive stored offset silently points at the wrong text once content shifts — confirmed concretely, not just asserted. The text-quote-first, context-window-second, fuzzy-fragment-third fallback chain (mirroring the envelope's `fallback_anchors[]` design) correctly recovers the anchor in both test cases. Both cases here resolved via the `exact_quote` step specifically (the anchor's own text was never modified, only surrounding content); the `fuzzy_fragment` step exists in the implementation and is documented, but was not exercised by these two cases — that is an honestly-reported gap, not a hidden one: a case where the quote itself is partially edited would be needed to exercise it, and is deferred to M3 alongside the rest of anchor-stability implementation depth.

**Architecture Implication (revised):** The M0-D decision itself is unchanged (unified envelope, per-format anchors, mandatory fallback), but it is now backed by direct reopen/resize/typography/jump-back evidence for three of the four formats instead of being synthesized from adjacent tracks. The EPUB CFI round-trip nuance (reported CFI ≠ requested CFI after a layout change) is a new, concrete implementation note for M3.

**Decision:** No change to the M0-D ACCEPT decision. The M0 Exit Gate claim "`DocumentLocation` has a credible cross-format design" is now backed by direct evidence rather than cross-track inference, for EPUB, PDF, and TXT. OCR anchor stability remains explicitly deferred to M5 (unchanged — see M0-F below).

---

## M0-E — Search / CJK

**Question:** Is SQLite FTS5 sufficient for the required CJK search behavior (English, Chinese, mixed CJK/Latin)?

**Prototype/Experiment:**
- Created in-memory SQLite FTS5 virtual tables using both the `unicode61` (default) and `trigram` tokenizers.
- Inserted real Chinese sentences and queried for substrings of varying length (2, 3, and 4 CJK characters), including exact substrings known to be present in the source text.

**Evidence:**
```
tokenizer=unicode61: query="中文" hits=0   (substring IS present in source text)
tokenizer=unicode61: query="测试" hits=0   (substring IS present in source text)
tokenizer=trigram:   query="中文" (2 chars) hits=0
tokenizer=trigram:   query="验证搜索" (4 chars) hits=1
tokenizer=trigram:   query="中文测" (3 chars) hits=1
tokenizer=trigram:   query="文本" (2 chars) hits=0
```

**Finding:**
- `unicode61` (FTS5's default tokenizer) **cannot find CJK substrings at all** — because it has no CJK word-boundary logic, it tokenizes an entire uninterrupted CJK run as effectively one unsplittable unit, so no sub-string query matches. This is a hard failure for the required CJK search behavior, confirming the risk `ARCHITECTURE.md` §10 already flagged as needing M0 evidence.
- `trigram` (SQLite's built-in n-gram tokenizer, available in this SQLite build — version 3.49.1) correctly finds any CJK substring **3 characters or longer**, but returns **zero hits for 2-character queries** — and most common Chinese words/search terms are exactly 2 characters. This is a specific, actionable, real gap, not a vague "CJK might be hard" concern.

**Architecture Implication:**
- SQLite FTS5 alone (either stock tokenizer) is **insufficient** for the required CJK behavior as-is.
- A CJK-aware pre-processing/segmentation step is required before text reaches the index — e.g., segmenting Chinese text into words (or emitting overlapping bigrams alongside trigrams) at indexing time so 2-character queries resolve. This is an additive adapter in front of FTS5, not a replacement of the persistence layer — consistent with `ARCHITECTURE.md` §10's own escape hatch ("architecture may add a tokenizer/index adapter without changing the domain contract").
- Alternative considered: a dedicated Rust search engine (e.g. `tantivy`) with proper CJK tokenizer support. Not spiked in this pass (would add a second index technology); recommended as a fallback only if the segmentation-adapter approach proves inadequate during M4 (Reading Assets & Search) implementation.

**Decision:** **MODIFY** — keep SQLite FTS5 as the index engine, but the architecture must specify a CJK segmentation/n-gram adapter feeding it (bigram indexing or a lightweight Chinese word segmenter such as `jieba-rs` at index time). This is an Architecture Amendment to `ARCHITECTURE.md` §10, not a product-contract conflict — the frozen CJK search requirement remains achievable, just not with FTS5's stock tokenizers alone.

**Residual risk (deferred to M4):** Segmentation quality/performance at library scale, and whether bigram-only indexing (cheaper, no segmentation dictionary) is good enough versus true word segmentation, need a follow-up spike at M4 depth.

### Corrective Update (2026-09-08)

**Question added:** The original pass only *diagnosed* that FTS5's stock tokenizers fail on CJK. It did not build or test the adapter it recommended. Does the recommended bigram-adapter approach actually work?

**Prototype/Experiment:** Implemented the adapter for real: split text into CJK/non-CJK runs, bigram-expand CJK runs at index time, and at query time expand the query the same way and issue an FTS5 **phrase** query (consecutive bigrams required adjacent) so exact substrings resolve without false positives from unrelated bigram co-occurrence. Indexed four real documents (Chinese, English, mixed CJK/Latin, and an unrelated distractor) and queried 2-character Chinese terms, English words, and a mixed CJK+Latin phrase. `tooling/m0-evidence/scripts/m0e_cjk_search_adapter.py`.

**Evidence** (`tooling/m0-evidence/results/m0e_cjk_search_adapter.txt`):
```
中文  (2-char CJK, doc[0] contains it)                    hits=2
英文  (2-char CJK, absent from corpus, should be 0 hits)   hits=0
mixed (English word)                                       hits=1
中文和English (mixed CJK+Latin phrase)                       hits=1

PASS - 2-char Chinese '中文' finds a real hit
PASS - 2-char Chinese '英文' (absent) finds 0
PASS - English 'mixed' finds a real hit
PASS - mixed CJK/Latin '中文和English' finds a real hit
OVERALL: PASS
```

**Finding:** The adapter works exactly as the original pass's diagnosis predicted it should: 2-character Chinese queries now resolve correctly (the specific failure mode the original FTS5 probe found), with no false positives on an absent term, and English and mixed CJK/Latin queries both continue to work through the same index. This closes the gap between "we know FTS5 alone fails" (original pass) and "we know a fix works" (this pass).

**Architecture Implication (revised):** None beyond what the original M0-E Architecture Amendment already specified — this pass proves the amendment is implementable as described, using the exact bigram/phrase-query mechanism named as the leading option.

**Decision:** No change to the M0-E MODIFY decision. The Architecture Amendment (CJK segmentation adapter in front of FTS5) is now backed by a working implementation, not only a diagnosis and a proposal.

---

## M0-F — Document OCR

**Question:** Is there a credible local OCR path for scanned-PDF document pages, across English and Chinese, with reading order and coordinates suitable for search/selection/jump-back?

**Prototype/Experiment:**
- No equivalent local OCR runtime was already installed on this machine (checked for `tesseract`, `paddleocr`, `pytesseract`, `onnxruntime` — none present), so a new one was evaluated, per `ARCHITECTURE.md` §11.3's instruction to validate document-page workload rather than pick by generic benchmark.
- `UB-Mannheim.TesseractOCR` installer required interactive elevation and failed non-interactively (see M0-A) — ruled out for this sandbox, noted as a packaging-relevant finding.
- Installed `rapidocr-onnxruntime` (pure Python, ONNX Runtime backend, no admin rights required) instead.
- Generated two synthetic test images: single-column English text, and mixed Chinese/Latin text (using a real Windows CJK system font, Microsoft YaHei).
- Ran recognition on both and captured per-line text, confidence score, and timing.

**Evidence:**
```
ocr_en.png (wall=2.14s):
  [0.98] The quick brown fox jumps over the lazy dog. 1234567890
  [0.97] EbookReader OCR spike test - single column English text

ocr_zh.png (wall=4.25s):
  [0.98] 这是一段中文测试文本，用于验证本地OCR 的中文识别能力。
  [0.99] 混合mixedCJK/Latin        <- known degraded case, see below
  [0.96] 文本test 123.
```

**Finding:**
- Recognition confidence was 96–99% on both English and mixed CJK/Latin synthetic text, with correct reading order preserved (top-to-bottom, left-to-right for this layout) and per-line bounding boxes returned alongside each recognized string.
- **Known degraded case:** a whitespace boundary between "混合" (Chinese) and "mixed" (Latin) was silently dropped in recognition output ("混合mixedCJK/Latin" instead of "混合 mixed CJK/Latin"). This is a specific, reproducible CJK/Latin-boundary spacing artifact that correction tooling (`ARCHITECTURE.md` §11.2, "manual corrections") needs to account for — it is not catastrophic, but it is real and should be tracked, not assumed away.
- `rapidocr-onnxruntime` is a **Python package**; it is not directly embeddable in a Rust/Tauri production binary. The underlying models are standard ONNX files, so the credible production path is running the same models through a Rust ONNX Runtime binding (the `ort` crate) rather than shipping a Python interpreter — this was not separately spiked in this pass but is a low-risk, well-trodden pattern (ONNX models are runtime-agnostic by design).
- Only synthetic, clean, single-column images were tested. Real scanned-book conditions — multi-column layout, headers/footers, degraded/skewed scans, handwriting-adjacent print — were **not** exercised in this pass.

**Architecture Implication:**
- Substantiates `ARCHITECTURE.md` §11's Page Image → Document OCR Worker → OCR Artifact pipeline: detection, recognition, bounding boxes, and confidence are all present in the evaluated engine's output shape.
- Confirms the §11.3 backend rule is achievable without a network dependency and without admin-requiring installers (which M0-A showed fail unattended).
- Adds one concrete, trackable degraded case (CJK/Latin boundary spacing) to feed into the correction-mapping design.

**Decision:** **ACCEPT** a PP-OCR-class (RapidOCR-equivalent) ONNX-based local OCR pipeline as the credible document-page OCR path, with a Local Implementation Adjustment: production integration runs the ONNX models via Rust (`ort` crate) rather than shipping Python, and the CJK/Latin spacing artifact is logged as a known correction-mapping edge case.

**Residual risk (deferred to M5):** Multi-column layout/reading-order accuracy, degraded/skewed real scans, header/footer handling, and full pause/resume/cancel job-control behavior are unverified and are exactly M5's (Scanned PDF OCR) own success-evidence list — this spike only establishes that the backend family is viable, not that it is production-tuned.

### Corrective Update (2026-09-08)

**This is the second gap the Human Architecture Gate specifically named**: "OCR has a credible document-page path" is an M0 Exit Gate line item, but the original pass tested only clean, synthetic, single-line, single-column images generated by this session's own script — never a real scanned page, never a multi-column layout, and never any Rust-side inference (the stated production path). All three are fixed in this pass.

**Question added:** On a genuinely real, degraded, multi-column, CJK document page, how does the OCR pipeline actually perform — and does Rust `ort` (the stated production runtime, not the Python dev-time pipeline) actually run the same model successfully?

**Prototype/Experiment — real fixture:** Retrieved two real scanned pages of a public-domain 1893 book (James Legge, *The Chinese Classics*, 2nd ed., Google-digitized, Internet Archive-hosted; full provenance and pinned hashes in `tooling/m0-evidence/fixtures/ocr_real/SOURCE.md`): one real two-column English page, and — the primary target fixture — one real page with genuine vertical multi-column classical Chinese text above a two-column English commentary block, with real period-print degradation (uneven ink, scan noise, slight skew). Ran the full RapidOCR (PP-OCRv4 det+rec+cls) pipeline against both. `tooling/m0-evidence/scripts/m0f_run_rapidocr_real.py`.

**Evidence — real fixture** (`tooling/m0-evidence/results/m0f_rapidocr_result_ia_100.json`, `..._ia_200.json`):
```
=== ia_100.jpg (real 2-column English, degraded 1893 print) ===
wall_time_s=45.3  lines=140  peak_mem_mb=131.3
  [0.938] onKe-maou,when Mang-sun died,Kung-tsoo|wisdonwhich failedme（
  ...

=== ia_200.jpg (real vertical multi-column classical Chinese + English) ===
wall_time_s=32.0  lines=116  peak_mem_mb=134.1
  [0.886] 吴便沈尹射待命于巢蔻殷疆待命于
  [0.973] 秦后子歸於秦景公卒故也
  ...
```

**Finding — new, previously-hidden degraded case:** On the real two-column English page, several detected "lines" **merge text from the left and right columns into one string** (e.g. `"onKe-maou,when Mang-sun died,Kung-tsoo|wisdonwhich failedme（"` visibly splices text from both columns around a `|`-like artifact). On the real vertical-Chinese page, the detected line order does **not** follow the correct right-to-left, top-to-bottom classical-Chinese column order — the model (trained primarily for horizontal text) reads across columns rather than down them. **Neither failure mode was visible in the original pass**, because its synthetic fixtures were single-column by construction. This is exactly the kind of finding the Exit Gate claim "credible document-page path" should have been backed by before declaring PASS.

**Prototype/Experiment — Rust `ort` inference:** The original pass claimed the production path is "the same ONNX models via the Rust `ort` crate" but never ran it. Built a minimal Rust program (`tooling/m0-evidence/scripts/m0f_ort_inference_main.rs`) that loads the exact same PP-OCRv4 detection model via `ort` (using `load-dynamic` against the `onnxruntime.dll` already installed by the `onnxruntime` pip package, since `ort-sys` ships no prebuilt binary for the `x86_64-pc-windows-gnu` target this environment's Rust toolchain uses — itself a real finding, see `tooling/m0-evidence/fixtures/EXTERNAL_FIXTURES.md`) and runs real inference against the same real degraded/multi-column/CJK image.

**Evidence — Rust `ort`** (`tooling/m0-evidence/results/m0f_rust_ort_ia_200.txt`):
```
RUST ORT INFERENCE RESULT
image: ia_200.jpg (1622x2500 -> resized 1632x2496)
output_shape: [1, 1, 2496, 1632]
output_min: 0.000000  output_max: 1.000000  output_mean: 0.141716
pixels_above_0.3_textness: 582691 / 4073472
inference_wall_time_ms: 490.59
```

**Finding — Rust inference:** Real, successful Rust-side ONNX inference against the real target fixture: correct output tensor shape, sensible textness-probability statistics (14% mean, ~14% of pixels above threshold — consistent with a dense text page), 490ms wall time. This is detection-model inference only (not the full det→rec→cls pipeline reimplemented in Rust, which is explicitly M5 scope), but it directly substantiates the production-path claim the original ADR made without evidence.

**Architecture Implication (revised):** The backend family (PP-OCR-class ONNX models) remains ACCEPT — nothing here rejects it. But the M5 correction-mapping design must now explicitly plan for **column-crossing line merges** (not just the previously-noted CJK/Latin spacing artifact) and for **vertical/classical-layout reading-order failure** as a known, evidenced degraded case, not a hypothetical one. The Rust `ort` + `load-dynamic` path is now evidenced as workable in this environment, with the GNU-toolchain / no-prebuilt-binary caveat carried into M0-A's packaging note.

**Decision:** No change to the M0-F ACCEPT decision (the backend family is still credible), but the **evidence base has materially changed**: "credible document-page path" is now backed by a real degraded/multi-column/CJK page and a real Rust inference run, not synthetic single-line images and an unverified production-path claim. Reading-order failure on vertical/multi-column layouts is added to the Known Degraded Cases list (see summary below) as a confirmed, not hypothetical, M5 risk.

---

## M0-G — ReadingSession Timing

**Question:** Are the OS/window-level signals needed for foreground/background, inactivity, and OS sleep/lock detection available to the chosen shell?

**Prototype/Experiment:** Read the actual compiled source of `tauri-runtime` (pulled by the M0-A spike, so this is grounded in the real dependency version resolved for this project, not documentation-only) for its window event surface.

**Evidence:**
```rust
// tauri-runtime-2.11.3/src/window.rs
pub enum WindowEvent {
  Resized(..), Moved(..),
  CloseRequested { .. },
  Destroyed,
  Focused(bool),   // <-- foreground/background signal, native
  ScaleFactorChanged { .. },
  ...
}
```

**Finding:**
- `WindowEvent::Focused(bool)` is a native, first-class event — foreground/background tracking (`ARCHITECTURE.md` §7) needs no custom platform code.
- There is **no** dedicated OS sleep/lock event in Tauri's window-event enum — sleep/lock is a Windows session-level event (`WM_POWERBROADCAST` / `WTS_SESSION_LOCK`), not a per-window event, so it is not exposed by this API surface.
- The already-frozen 5-minute inactivity pause policy (`ARCHITECTURE.md` §7 V1 policy surface) provides a working fallback: if no user input/activity is observed for the threshold, the session pauses regardless of *why* (idle, screen lock, or sleep) — this covers the sleep/lock requirement approximately without a dedicated OS hook, at the cost of up to ~5 minutes of session time attributed before the pause takes effect.
- A precise, immediate sleep/lock signal is still achievable via a raw Win32 message hook (subclassing the window's `HWND` and listening for `WM_POWERBROADCAST`/session-change messages), reachable from Rust via the `windows` crate (already a transitive Tauri dependency, confirmed present in the M0-A build). This was not implemented/spiked in this pass.

**Architecture Implication:** No conflict with `ARCHITECTURE.md` §7. Two implementation paths exist: (a) rely on the existing inactivity-timeout policy alone (simpler, slightly less precise), or (b) add a native Win32 power/session-lock hook for immediate pause (more precise, more platform code). Recommend (a) for V1 given the existing frozen policy already tolerates this, with (b) as a documented enhancement candidate rather than a blocking requirement.

**Decision (original — see retraction below):** ~~**ACCEPT** the ReadingSession timing architecture as specified, with a Local Implementation Adjustment: treat immediate OS sleep/lock detection as an enhancement, not a hard V1 requirement, since the frozen inactivity-timeout policy already provides a truthful (if slightly delayed) fallback.~~

**Residual risk (deferred to M3):** Actual wiring and end-to-end factual-time accounting is M3's own scope; this track only confirms the signal sources exist.

### Corrective Update (2026-09-08) — retraction and real hook evidence

**The original Decision above is retracted, not merely superseded.** `PRODUCT_SPEC.md` freezes "OS lock/sleep always pauses" as unconditional product semantics. The original pass's "treat immediate OS sleep/lock detection as an enhancement, not a hard V1 requirement" language quietly substituted a ~5-minute-heuristic-shaped implementation for that frozen rule, self-approving a semantic downgrade under the cover of a "Local Implementation Adjustment" — exactly the kind of scope narrowing `ROADMAP.md` §1.8 reserves for a Human Gate ("frozen `PRODUCT_SPEC.md` semantic change"), not something M0 may decide on its own. The underlying *evidence* above (no dedicated sleep/lock `WindowEvent`, `Focused(bool)` is native, a raw Win32 hook is reachable via `windows`) was correct and is kept; only the *decision drawn from it* was wrong.

**Question added:** Does a real Win32 sleep/session-lock hook actually work, with exact (not heuristic) pause/resume boundaries, so the frozen rule can be honored without relying on the inactivity-timeout fallback?

**Prototype/Experiment:** Built a real (hidden) native Win32 window and registered it for Windows Terminal Services session-change notifications via `WTSRegisterSessionNotification` — a real API call, not a stub. Drove synthetic `WM_WTSSESSION_CHANGE` (lock/unlock) and `WM_POWERBROADCAST` (suspend/resume) messages through the real window procedure via `SendMessageW` (synchronous dispatch through the same `wndproc` code path `GetMessageW`/`DispatchMessageW` would use), with real wall-clock sleeps between lock and unlock. Synthetic messages were used instead of actually locking/suspending the machine, which would be unsafe/disruptive to trigger from an automated harness — the registration call itself and the message-dispatch path are real. `tooling/m0-evidence/scripts/m0g_session_lock_main.rs`.

**Evidence** (`tooling/m0-evidence/results/m0g_session_lock_hook.txt`):
```
WTSRegisterSessionNotification succeeded: true
PAUSE  reason=WTS_SESSION_LOCK at=exact-instant
RESUME reason=WTS_SESSION_UNLOCK excluded_ms=300 (exact, not a fixed heuristic window)
PAUSE  reason=PBT_APMSUSPEND at=exact-instant
RESUME reason=PBT_APMRESUMESUSPEND excluded_ms=150 (exact, not a fixed heuristic window)
total_excluded_ms (sum of lock + suspend intervals): 450
```
The 300ms and 150ms excluded intervals match the real sleep durations the test harness issued between lock/unlock and suspend/resume exactly — the exclusion is computed from `Instant::now()` deltas at the moment each event is dispatched, not from a fixed timeout bucket.

**Finding:** The hook is real, registers successfully, and produces exact pause/resume boundaries for both session-lock and system-suspend events, with locked-time and suspended-time both excluded from the active-reading accounting. This is achievable with platform code already reachable from the resolved dependency tree (the `windows` crate), confirming the "(b)" option the original pass raised but declined to build.

**Architecture Implication (revised):** `ARCHITECTURE.md` §7 ("OS lock/sleep always pauses") requires the Win32 session-lock/power-broadcast hook as the V1 mechanism. The inactivity-timeout policy remains V1 for the *inactivity* case (no dedicated OS signal exists for "user stopped typing/scrolling"), but it is no longer the sleep/lock mechanism — sleep/lock now has its own exact, evidenced hook.

**Decision (corrected):** **ACCEPT** the ReadingSession timing architecture as specified in `ARCHITECTURE.md` §7, **including the Win32 sleep/session-lock hook as a required V1 component**, not an optional enhancement. The original "~5 minutes is acceptable V1 behavior for sleep/lock" language is struck; inactivity-timeout remains V1 only for genuine inactivity, not as a substitute for lock/sleep detection.

---

## M0-H — Backup / Restore Feasibility

**Question:** Is app-data archive/restore technically feasible with a clean round trip?

**Prototype/Experiment:** Built a synthetic app-data folder (a JSON "state" file plus a binary-ish "cover" file), archived it, extracted it into a separate restore location, and byte-compared the result.

**Evidence:**
```
original: {"books":[{"id":1,"title":"Alice"}]}
restored: {"books":[{"id":1,"title":"Alice"}]}
match: True
zip size bytes: 282
```

**Finding:** A basic archive/extract round trip is byte-identical and lossless using standard OS-level archive tooling. This validates the base filesystem operation only — not the higher-level Restore workflow (`ARCHITECTURE.md` §15: preview, validation, safety snapshot, transactional restore, relink surfacing).

**Architecture Implication:** No blocker found at the filesystem-operation layer. The production implementation should use a Rust zip/archive crate (e.g. `zip`) invoked from the application layer rather than shelling out to OS archive utilities, so the app controls manifest/versioning metadata inside the archive — this is already implied by `ARCHITECTURE.md` §15 and is not a new finding, just confirmed non-blocked.

**Decision:** **ACCEPT** archive-based backup/restore as technically feasible.

**Residual risk (deferred to M8):** Everything above the raw archive operation — preview, schema/version validation, safety snapshot before restore, transactional replace, Reference-file relink surfacing, and Managed-Copy recovery — is M8's own success-evidence list and was intentionally not spiked here; this track only clears the ground-floor feasibility question.

### Corrective Update (2026-09-08)

**Question added:** Does the actual manifest → preview → safety-snapshot → restore → verify workflow work, including the two book-ownership semantics (Managed-Copy vs Reference) that determine whether restore can succeed correctly?

**Prototype/Experiment:** Implemented the real workflow shape from `ARCHITECTURE.md` §15 end-to-end against a synthetic library with one Managed-Copy book (bytes live in app data) and one Reference book (bytes live in an external folder the app does not own): build a manifest with per-entry ownership + fingerprint, `preview_backup()` that inspects the archive without mutating state, `safety_snapshot()` taken before any destructive change, `restore()` that validates schema version and archive completeness before touching live state, and `verify()` after. Tested three cases: (a) normal restore with the Reference file intact; (b) restore after the Reference file has gone missing; (c) restore from a deliberately corrupted archive missing a declared Managed-Copy file. `tooling/m0-evidence/scripts/m0h_backup_restore_spike.py`.

**Evidence** (`tooling/m0-evidence/results/m0h_backup_restore.txt`):
```
3. Preview (no mutation): schema_ok=True entries=2 missing=[]
4a. Restore (Reference file intact): status=RESTORED relink_needed=[]
    verify: {'db_matches_pre_backup_state': True, 'managed_copy_fingerprint_ok': True}
4b. Restore (Reference file now MISSING): status=RESTORED relink_needed=['book_b']
4c. Restore (corrupt archive, missing managed-copy bytes): status=REJECTED reason=archive_incomplete
4c. app-data unchanged after rejection: True
```

**Finding:** Preview genuinely does not mutate app state (verified, not assumed). A safety snapshot is taken before every restore. Restore correctly distinguishes Managed-Copy (bytes restored directly, fingerprint-verified) from Reference (external path re-checked; missing or fingerprint-mismatched files are surfaced as `relink_needed`, never silently dropped or fabricated). A corrupted/incomplete archive is rejected **before** any live state is touched — case (c) confirms app-data was still exactly the case-(b) state after the rejected restore attempt, i.e. no partial apply.

**Architecture Implication:** No change to `ARCHITECTURE.md` §15 — this pass confirms the workflow it already specifies is implementable as described, including the specific failure-mode handling (missing Reference, corrupt archive) that a "just prove the zip round-trips" spike could not have shown.

**Decision:** No change to the M0-H ACCEPT decision, but the claim it supports has strengthened from "raw archive operations are feasible" to "the manifest/preview/snapshot/restore/verify workflow, including Reference-relink surfacing and rejection of an incomplete restore, is implementable as specified." The full M8 UI (restore preview screens, versioning UX) remains legitimately deferred to M8, unchanged.

---

## M0-I — Update Awareness

**Question:** Is a stable-release check against a real release feed (GitHub Releases) technically feasible with graceful offline/failure behavior?

**Prototype/Experiment:**
- Queried the real GitHub Releases API against the (currently empty) `Peter-S-Shi/ebookreader` repo, and against a real populated repo (`tauri-apps/tauri`) to observe the full response shape.
- Simulated an offline/unreachable-host condition with a short timeout.

**Evidence:**
```
GET /repos/Peter-S-Shi/ebookreader/releases/latest -> 404 "Not Found" (no releases yet — a real, expected V1-launch state)
GET /repos/tauri-apps/tauri/releases -> 200, e.g. tag_name="tauri-v2.11.5" draft=false prerelease=false
GET unreachable-host (3s timeout) -> curl exit 6 (could not resolve host), clean failure, no hang
```

**Finding:**
- The GitHub Releases API directly exposes `draft`/`prerelease` boolean flags per release, so "stable releases only" filtering (`ARCHITECTURE.md` §16) is a simple field check, not a heuristic.
- A repo with no releases yet returns a structured 404, not a network error — the update-awareness state machine needs a distinct "no stable release published" outcome in addition to `Up To Date` / `Update Available` / `Check Failed`, otherwise a legitimately-empty release feed at V1 launch would be misreported as `Check Failed`.
- Unreachable-host failure is clean and fast under a short timeout — confirms the "graceful failure, main UI never blocked" requirement is straightforward to implement.

**Architecture Implication:** Minor refinement to `ARCHITECTURE.md` §16's state list: add (or fold into `Up To Date`) an explicit "no stable release available" outcome distinct from `Check Failed`, so an empty release feed is never displayed as a network/check failure.

**Decision:** **ACCEPT** GitHub Releases + SemVer comparison as the update-awareness mechanism, with a Local Implementation Adjustment to the state model (distinguish "no release yet" from "check failed").

**Residual risk:** None architecturally significant; this track is low risk and the evidence gathered is considered sufficient without further M0 follow-up.

---

## Cross-Track Summary (post-corrective-pass)

| Track | Decision | Evidence depth (original) | Evidence depth (corrective pass) |
|---|---|---|---|
| M0-A Shell & Storage | ACCEPT (+ toolchain adjustment) | Real compile + registry check | unchanged |
| M0-B EPUB Renderer | ACCEPT (+ vendoring adjustment) | Real load/CFI/TOC against a real EPUB | + real fixed-layout EPUB sanity check |
| M0-C PDF Renderer | ACCEPT | Real headless text+geometry extraction (1-line PDF) | + real 15-page academic PDF, all pages |
| M0-D DocumentLocation | ACCEPT (+ fallback-anchor priority) | Synthesized from B/C/F evidence, no dedicated spike | + real reopen/resize/typography/jump-back spikes for EPUB, PDF, TXT |
| M0-E Search / CJK | **MODIFY** (CJK segmentation adapter) | Diagnosed the gap only (tokenizer tests) | + a real working adapter implementation, tested against the exact gap found |
| M0-F Document OCR | ACCEPT (+ Rust-runtime + degraded case) | Synthetic single-line EN/CJK images; no Rust inference run | + real degraded/multi-column/CJK scanned page; real Rust `ort` inference; new confirmed degraded case (column-crossing / reading-order failure) |
| M0-G ReadingSession Timing | **ACCEPT, decision corrected** | Dependency source inspection only; self-approved a frozen-semantic downgrade | Original downgrade **retracted**; + real Win32 `WTSRegisterSessionNotification` hook with exact pause/resume boundaries |
| M0-H Backup/Restore | ACCEPT | Raw archive/restore byte round-trip only | + real manifest/preview/safety-snapshot/restore/verify workflow, incl. Reference-relink and corrupt-archive rejection |
| M0-I Update Awareness | ACCEPT (+ state-model refinement) | Real API calls, real failure simulation | unchanged |

No track produced a REJECT or a frozen-product-contract conflict. One track (M0-E) required an Architecture Amendment (not a product compromise): SQLite FTS5 needs a CJK segmentation/n-gram adapter in front of it, exactly as `ARCHITECTURE.md` §10 already anticipated as a possible outcome — now implemented and tested, not only proposed. One track (M0-G) required **retracting** an over-broad self-approved product-semantic downgrade; the corrected decision restores full conformance to `PRODUCT_SPEC.md`'s frozen "OS lock/sleep always pauses" rule via a real, evidenced Win32 hook.

No known blocker invalidates frozen V1 scope. A reproducible evidence harness now backs this report — see `tooling/m0-evidence/README.md`. See `M0_ARCHITECTURE_DECISION.md` for the consolidated ADR-style decision package required by `ARCHITECTURE.md` §20, updated to match.
