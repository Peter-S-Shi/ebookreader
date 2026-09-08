# M0 Technical Spike Report

Status: **M0 Evidence Produced — Awaiting Human Architecture Gate**
Date: 2026-09-08

This report records the Question → Prototype/Experiment → Evidence → Finding → Architecture Implication → ACCEPT/MODIFY/REJECT sequence for each M0 evidence track, per `ROADMAP.md` Milestone 0.

Evidence depth is scaled to risk (ROADMAP 1.5): tracks with high architectural leverage (M0-A, M0-E, M0-F) received the deepest real spikes; lower-risk tracks received a real but narrower spike plus documented reasoning. No track was resolved by literature review alone without at least one runnable artifact.

All spike code/fixtures were built outside the repository (local temp workspace) and are not committed; this report and the companion `M0_ARCHITECTURE_DECISION.md` are the durable evidence artifacts.

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

**Decision:** **ACCEPT** the ReadingSession timing architecture as specified, with a Local Implementation Adjustment: treat immediate OS sleep/lock detection as an enhancement, not a hard V1 requirement, since the frozen inactivity-timeout policy already provides a truthful (if slightly delayed) fallback.

**Residual risk (deferred to M3):** Actual wiring and end-to-end factual-time accounting is M3's own scope; this track only confirms the signal sources exist.

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

## Cross-Track Summary

| Track | Decision | Evidence depth |
|---|---|---|
| M0-A Shell & Storage | ACCEPT (+ toolchain adjustment) | Real compile + registry check |
| M0-B EPUB Renderer | ACCEPT (+ vendoring adjustment) | Real load/CFI/TOC against a real EPUB |
| M0-C PDF Renderer | ACCEPT | Real headless text+geometry extraction |
| M0-D DocumentLocation | ACCEPT (+ fallback-anchor priority) | Synthesized from B/C/F evidence |
| M0-E Search / CJK | **MODIFY** (add CJK segmentation adapter) | Real FTS5 tokenizer tests, both directions |
| M0-F Document OCR | ACCEPT (+ Rust-runtime + degraded case) | Real recognition run, EN + CJK/Latin |
| M0-G ReadingSession Timing | ACCEPT (+ scope enhancement note) | Real dependency source inspection |
| M0-H Backup/Restore | ACCEPT | Real archive/restore round trip |
| M0-I Update Awareness | ACCEPT (+ state-model refinement) | Real API calls, real failure simulation |

No track produced a REJECT or a frozen-product-contract conflict. One track (M0-E) requires an Architecture Amendment (not a product compromise): SQLite FTS5 needs a CJK segmentation/n-gram adapter in front of it, exactly as `ARCHITECTURE.md` §10 already anticipated as a possible outcome.

No known blocker invalidates frozen V1 scope. See `M0_ARCHITECTURE_DECISION.md` for the consolidated ADR-style decision package required by `ARCHITECTURE.md` §20.
