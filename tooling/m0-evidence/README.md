# M0 Evidence Harness

This is the minimal, public-safe, reproducible harness behind the M0
Corrective Evidence Pass (see `M0_TECHNICAL_SPIKE_REPORT.md` and
`M0_ARCHITECTURE_DECISION.md` at the repo root). It exists so a reviewer
(human or a future agent session) can re-run the spikes that back the M0
findings, not just read a narrative claim about them.

It does **not** vendor build caches, `node_modules/`, Rust `target/`
directories, or ONNX model weights - only source scripts, small
redistributable/self-authored fixtures, and captured result output.

## Layout

```
fixtures/       small, safely redistributable/self-authored test documents
fixtures/EXTERNAL_FIXTURES.md   fixtures NOT vendored (license/size reasons) + fetch instructions + pinned hashes
scripts/        the actual spike code (Python / Node / Rust) that produced results/
results/        captured stdout/JSON output from running each script
```

## Tool versions used when this evidence was produced (2026-09-08)

- Windows 11, `rustc`/`cargo` 1.98.1 (`stable-x86_64-pc-windows-gnu` toolchain)
- MinGW-w64 (WinLibs UCRT build, gcc 16.1.0) - required because the bare
  `rustup` GNU toolchain ships no C compiler; installed via
  `winget install BrechtSanders.WinLibs.POSIX.UCRT` (see M0-A in the spike report)
- Node.js v24.18.0, `pdfjs-dist` 6.3.289, `foliate-js` 1.0.1
- Python 3.12.10, `rapidocr-onnxruntime`, `onnxruntime` (pip)
- Rust `ort` 2.0.0-rc.13 (`load-dynamic` feature - see
  `fixtures/EXTERNAL_FIXTURES.md` for why), `windows` 0.62.2

## Reproducing each corrective-pass item

### (1) DocumentLocation stability - EPUB / PDF / TXT

- **EPUB** (`scripts/m0d_epub_docloc_App.tsx`): scaffold a Vite+React app,
  `npm install foliate-js`, copy `fixtures/alice.epub` to `public/fixtures/`,
  drop this file in as `src/App.tsx`, `npm run dev`, read the rendered log.
  Captured output: `results/m0d_epub_docloc.txt`.
- **PDF** (`scripts/m0d_pdf_docloc.mjs`): `npm install pdfjs-dist`, then
  `node scripts/m0d_pdf_docloc.mjs fixtures/sample.pdf`.
  Captured output: `results/m0d_pdf_docloc.txt`. A larger/richer real PDF
  variant (ambiguity + performance) uses `arxiv_sample.pdf` - see
  `fixtures/EXTERNAL_FIXTURES.md` - captured in
  `results/m0d_pdf_ambiguity_arxiv.txt` / `results/m0c_pdf_larger_arxiv.txt`.
- **TXT** (`scripts/m0d_txt_docloc.py`): `python scripts/m0d_txt_docloc.py`.
  Captured output: `results/m0d_txt_docloc.txt`.

### (2) CJK search adapter (real implementation, not just diagnosis)

`python scripts/m0e_cjk_search_adapter.py` - implements and tests a bigram
FTS5-phrase-query adapter directly against SQLite (stdlib `sqlite3`).
Captured output: `results/m0e_cjk_search_adapter.txt`.

### (3) OCR on real degraded/multi-column/CJK pages + Rust `ort` inference

- `pip install rapidocr-onnxruntime`, then
  `python scripts/m0f_run_rapidocr_real.py` (full det+rec+cls pipeline on
  `fixtures/ocr_real/*.jpg` - see `fixtures/ocr_real/SOURCE.md` for
  provenance). Captured output: `results/m0f_rapidocr_result_ia_100.json`,
  `results/m0f_rapidocr_result_ia_200.json`.
- Rust `ort` inference (`scripts/m0f_ort_inference_main.rs` +
  `scripts/m0f_ort_inference_Cargo.toml`): `cargo new`, drop these files in,
  `cargo build --release`, then run with `<onnxruntime.dll path>
  <det model .onnx path> <image path>` (see `fixtures/EXTERNAL_FIXTURES.md`
  for where to get both). Captured output: `results/m0f_rust_ort_ia_100.txt`,
  `results/m0f_rust_ort_ia_200.txt`.
- Synthetic single-line English/CJK images from the *first* M0 pass are
  still included (`fixtures/ocr_en.png`, `fixtures/ocr_zh.png`,
  `results/m0f_rapidocr_synthetic.txt`) for comparison against the real,
  harder fixtures above.

### (4) ReadingSession Win32 sleep/session-lock hook

`scripts/m0g_session_lock_main.rs` + `scripts/m0g_session_lock_Cargo.toml`:
`cargo new`, drop these files in, `cargo build --release`, run the binary.
Registers a real hidden window for `WTSRegisterSessionNotification`, then
drives synthetic `WM_WTSSESSION_CHANGE` / `WM_POWERBROADCAST` messages
through the real `WndProc` via `SendMessageW` (synthetic events are used
instead of actually locking/suspending the machine, which would be unsafe
to do from an automated harness). Captured output:
`results/m0g_session_lock_hook.txt`.

### (5) Backup/Restore minimal real workflow

`python scripts/m0h_backup_restore_spike.py` (runs entirely under a temp
directory, never touches the repo). Exercises manifest build, preview
(no mutation), safety snapshot, restore, Reference-relink surfacing when an
external file goes missing, and rejection of a corrupted/incomplete archive
without partial state application. Captured output:
`results/m0h_backup_restore.txt`.

### (6) Renderer-lock sanity checks - fixed-layout EPUB, larger PDF

- Fixed-layout EPUB: `fixtures/make_fixed_layout_epub.py` generates
  `fixtures/fixed_layout_sample.epub` (self-authored, `rendition:layout=
  pre-paginated`). `scripts/m0_6_fixed_layout_epub_App.tsx` loads it via
  foliate-js the same way as the EPUB DocumentLocation harness above.
  Captured output: `results/m0_6_fixed_layout_epub.txt`.
- Larger PDF: see (1) above, `results/m0c_pdf_larger_arxiv.txt` /
  `results/m0c_pdf_larger_sample.txt`.

## Fixture licensing summary

| Fixture | License / status |
|---|---|
| `fixtures/alice.epub` | Project Gutenberg, public domain |
| `fixtures/sample.pdf` | W3C public test fixture |
| `fixtures/fixed_layout_sample.epub` | self-authored for this harness |
| `fixtures/ocr_en.png`, `fixtures/ocr_zh.png` | self-authored synthetic test images |
| `fixtures/ocr_real/ia_100.jpg`, `ia_200.jpg` | public domain (1893), see `fixtures/ocr_real/SOURCE.md` |
| `arxiv_sample.pdf` (not vendored) | see `fixtures/EXTERNAL_FIXTURES.md` |
| PP-OCRv4 ONNX models (not vendored) | Apache-2.0 (PaddleOCR), installed via pip |
