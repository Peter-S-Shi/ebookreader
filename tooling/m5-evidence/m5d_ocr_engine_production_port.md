# M5-D: production `OcrEngine` — real inference ported out of the spike

Continuation of M5-A/B/C, which validated detection, postprocessing, and
recognition as throwaway spikes outside the repo (per the `prototype`
skill convention). This checkpoint ports the validated pipeline into real,
committed production code.

## What was ported

- `crates/domain/src/ocr_preprocess.rs`: pure detector/recognizer image
  preprocessing (resize-dims computation, ImageNet/rec normalization).
  10 unit tests, several asserting the *exact* real values observed in the
  M5-A/C spikes (e.g. `det_resize_dims(1605, 2500) == (1600, 2496, 1.0)`),
  so a future change that silently breaks preprocessing fails a real test,
  not just a spike run by hand. No model dependency -- runs in CI.
- `crates/domain/src/ocr_engine.rs`: `OcrEngine`, wrapping two `ort`
  `Session`s (detector + recognizer) into one `process_page(image) ->
  Vec<RecognizedLine>` call: detect boxes, scale to original coordinates,
  crop, recognize, CTC-decode. Model-dependent, so not exercised by CI
  (no model assets there) -- has one `#[ignore]`d integration test, run
  locally against `ocr-assets/`.

## Deliberate improvement over the spike: no fixed-320 recognition width cap

The M5-C spike used PaddleOCR's own fixed `imgW=320` recognition width cap,
which exists in the reference implementation to let multiple crops share
one padded batch tensor. This pipeline recognizes one line at a time
(batch size 1) against a model with a dynamic width input dimension, so
that cap serves no purpose here and was actively destructive: real
full-width body-text lines in the M5-C fixture were ~587px wide, more than
80% wider than the 320px cap, meaning the reference-shaped preprocessing
was discarding well over half the line's horizontal resolution before the
recognizer ever saw it. `ocr_preprocess::rec_resize_width` removes the
cap (replaced with a generous 4000px safety bound against pathological
input) and keeps the crop's true computed width. Not yet re-measured
against the M5-C fixture's per-box accuracy (see Residual below) — this is
a principled improvement, not yet confirmed by a before/after comparison.

## Result: real, evidenced pass

`cargo test -p ebookreader-domain --release -- --ignored
processes_a_real_scanned_page_end_to_end` against the real fixture
(`fixtures/ocr_real/ia_100.jpg`) with `ocr-assets/` populated: passes,
84s wall time, at least one recognized line with a positive detector
score -- the production code path (not the throwaway spike) runs real
Rust `ort` inference end-to-end.

## Residual

The uncapped recognition width has not yet been measured against the
M5-C fixture's specific boxes to confirm it actually improves recognized
text accuracy (versus just being a principled preprocessing correction).
That measurement, plus perspective-correct (non-axis-aligned) cropping
and border padding named in `m5c_recognition_spike.md`, remain open
recognition-accuracy refinement work for M5's Success Evidence.
