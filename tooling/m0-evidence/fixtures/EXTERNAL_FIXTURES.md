# External (not vendored) fixtures

These fixtures are used by some scripts in this harness but are **not**
committed to the repository, either because their redistribution license is
unclear (arXiv grants arXiv a distribution license; it does not itself place
papers in the public domain or under a permissive license) or because they
are third-party model weights better installed via their normal package
manager than vendored as binary blobs.

Re-fetch/re-install them locally to reproduce the results that reference them.

## arxiv_sample.pdf

A real 15-page PDF used for M0-C/M0-D "larger PDF" and text-quote ambiguity
evidence (`results/m0c_pdf_larger_arxiv.txt`, `results/m0d_pdf_ambiguity_arxiv.txt`).

- Source: `https://arxiv.org/pdf/1706.03762` ("Attention Is All You Need")
- Retrieved: 2026-09-08
- SHA-256: `bdfaa68d8984f0dc02beaca527b76f207d99b666d31d1da728ee0728182df697`

```bash
curl -sL -o arxiv_sample.pdf "https://arxiv.org/pdf/1706.03762"
sha256sum arxiv_sample.pdf   # compare against the hash above
node scripts/m0d_pdf_docloc.mjs arxiv_sample.pdf
node scripts/m0d_pdf_ambiguity.mjs arxiv_sample.pdf
node scripts/m0c_pdf_larger.mjs arxiv_sample.pdf
```

## PP-OCRv4 ONNX models (detection / recognition / classification)

Used by `scripts/m0f_run_rapidocr_real.py` (Python pipeline) and
`scripts/m0f_ort_inference_main.rs` (Rust `ort` inference). Apache-2.0
licensed (PaddleOCR), but binary model weights (~10-15MB each) are better
installed via pip than vendored in-repo, per `ARCHITECTURE.md` SS11.3's
"prefer reuse of already-installed... do not redownload without evidence
it is needed."

```bash
pip install rapidocr-onnxruntime
python -c "import rapidocr_onnxruntime, os; print(os.path.dirname(rapidocr_onnxruntime.__file__) + '/models')"
# ch_PP-OCRv4_det_infer.onnx / ch_PP-OCRv4_rec_infer.onnx / ch_ppocr_mobile_v2.0_cls_infer.onnx
```

## onnxruntime.dll (for the Rust `ort` load-dynamic spike)

`ort-sys` ships no prebuilt binary for the `x86_64-pc-windows-gnu` target
(see `M0_TECHNICAL_SPIKE_REPORT.md` M0-F/M0-A for why this environment uses
the GNU toolchain), so `scripts/m0f_ort_inference_main.rs` loads the ONNX
Runtime shared library dynamically instead of statically linking a
prebuilt. The `onnxruntime` pip package already ships this DLL:

```bash
pip install onnxruntime
python -c "import onnxruntime, os; print(os.path.dirname(onnxruntime.__file__) + '/capi/onnxruntime.dll')"
```
