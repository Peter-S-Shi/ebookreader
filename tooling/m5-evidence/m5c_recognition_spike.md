# M5-C: PP-OCRv6_rec_small recognition — real Rust `ort` end-to-end spike

Continuation of `m5a_det_medium_rust_ort_spike.md` (detection: ACCEPT) and
`m5b_postprocessing_architecture.md` (postprocessing: ACCEPT). This
checkpoint runs the full detect → crop → recognize → CTC-decode pipeline
end-to-end from Rust against a real fixture, to validate the recognition
stage before porting it into `crates/domain`.

## Question

Does the reused `PP-OCRv6_rec_small.onnx` run real inference from Rust
`ort`, and does feeding it real detected/cropped text regions from
`PP-OCRv6_det_medium.onnx` produce plausible recognized text?

## Finding 1 — the character dictionary is embedded in the model itself

`session.metadata().custom("character")` (checked directly via both
Python `onnxruntime` and Rust `ort`) returns a newline-separated list of
18,708 unique characters embedded as ONNX custom metadata on the model
file. The model's output shape is `[batch, seq_len, 18710]` —
18,708 + 1 (CTC blank, index 0) + 1 (trailing space character) = 18,710,
matching PaddleOCR's standard `['blank'] + dict_chars + [' ']`
convention exactly. No separate dictionary file/download was needed —
this resolves what would otherwise have been an open question (which
exact dictionary this specific model was trained against) without
touching the network.

## Finding 2 — preprocessing (public, standard PaddleOCR convention)

Recognition preprocessing (`resize_norm_img`, `imgC=3, imgH=48,
imgW=320`) is a well-documented, public part of PaddleOCR's own
open-source codebase (`ppocr/data/imaug/rec_img_aug.py`), not anything
proprietary: resize to a fixed height of 48px preserving aspect ratio
(width capped at 320px), zero-pad the remaining width, normalize via
`(pixel/255 - 0.5) / 0.5`.

## Finding 3 — the recognition model's output is *also* already
softmax-activated (a second instance of the detector's "already
activated" pattern)

Running the rec model against a random input in Python confirmed each
output row already sums to ~1.0 with all values in `[0, 1]` — it is
**not** raw logits. This is the same pattern as the detector's
already-sigmoided `fetch_name_0` (Finding 4 in `m5a_...md`), just for a
different activation. A first version of this spike's CTC decode
function applied a redundant softmax on top when computing per-character
confidence. This did **not** corrupt the decoded text (argmax selection
is invariant under a monotonic transform), but it did silently produce
near-zero confidence scores (re-normalizing an already-normalized
18,710-way distribution collapses the winning class's apparent
probability toward zero). Caught by the every-box `conf=0.000` pattern
being implausible on its face, not by a crash. Fixed by using the
selected class's value directly as its confidence — verified by
re-running: confidences moved from a uniform `0.000` to a plausible
`0.41–0.64` range. The same fix was ported to the production module,
`crates/domain/src/ocr_recognize.rs`.

## Finding 4 — end-to-end pipeline runs and produces partially-correct text

Ran detect → crop (axis-aligned bounding box of each detected rotated
rect) → recognize → CTC-decode against the real fixture
(`fixtures/ocr_real/ia_100.jpg`), sampling the 8 largest-area detected
boxes (full-width body-text lines):

| box | crop size | decoded text | confidence |
|---|---|---|---|
| 0 | 588×34 | `[agintfroantrttComp.the` | 0.578 |
| 1 | 587×33 | `grr` | 0.411 |
| 2 | 588×36 | `n,` | 0.511 |
| 3 | 586×34 | `thepartananLang` | 0.540 |
| 4 | 588×34 | `hesidTemanttWho` | 0.591 |
| 5 | 587×35 | `TiLng` | 0.558 |
| 6 | 587×35 | `tng` | 0.620 |
| 7 | 587×36 | `"."` | 0.638 |

Recognizable English fragments (`the`, `Comp.`, `Lang`, `Who`, `","`)
appear inside otherwise-noisy output, and no word-boundary spacing
appears anywhere — the pipeline is mechanically working (real Rust
`ort` inference for both stages, real CTC decode, real embedded
dictionary), but recognition accuracy is not yet production quality.

## Architecture Implication

Likely contributors to the accuracy gap, not yet isolated by fixture-level
ablation:
- **axis-aligned bounding-box crop** instead of a true perspective/rotation
  correction using the detected rotated rect's actual corners — a
  skewed or rotated text line loses fidelity when force-cropped
  axis-aligned;
- **no border padding** around the crop (PaddleOCR's own pipeline
  typically pads text-line crops before feeding the recognizer);
- **missing word-boundary spacing** in the raw CTC output is not a new
  problem here -- it directly corroborates the same word-boundary
  spacing loss already carried forward from M0 as a known OCR residual
  (`PROJECT_STATUS.md` "M0's carried-forward OCR residuals for M5 to
  own"), not something newly discovered.

None of these are blockers to accepting that the recognition stage
mechanically works end-to-end from Rust; they are refinement work still
owed under M5's Success Evidence, tracked here rather than silently
dropped.

## Status: ACCEPT (pipeline mechanics) / refinement work owed (accuracy)

**ACCEPT**: `PP-OCRv6_rec_small.onnx` loads and runs real inference from
Rust `ort`; its embedded character dictionary is real and usable at
runtime with no separate download; CTC greedy decode (ported to
`crates/domain/src/ocr_recognize.rs`, 5 unit tests, no model dependency)
is correct. The full detect→recognize pipeline runs end-to-end on a real
fixture using only locally reused, already-license-cleared assets.

**Not yet ACCEPT**: recognition accuracy. Perspective-correct cropping,
border padding, and closing the word-boundary spacing gap are real,
scoped follow-up work for M5's remaining Success Evidence -- not
guessed at here, but named so the next checkpoint knows exactly what to
try first.
