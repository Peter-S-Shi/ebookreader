# M5-A: PP-OCRv6_det_medium via Rust `ort` — real inference, preprocessing finding

Continuation of M0-F's spike (`tooling/m0-evidence/` — the earlier
`sigmoid_0.tmp_0`-output detector), now run against the **reused**
`PP-OCRv6_det_medium.onnx` (see `README.md` in this directory for its
provenance/hashes). Uses the same throwaway harness this repo's M0-F
spike originally used, kept outside this repo per the `prototype`
skill convention — not committed.

## Question

Does the reused `PP-OCRv6_det_medium.onnx` + `onnxruntime.dll` actually
run real inference from Rust's `ort` crate, and does this repo's
earlier M0-F preprocessing/output-name assumptions still hold for this
specific model variant?

## Finding 1 — output tensor name differs from the M0-F model

`session.get_outputs()` (checked via a local Python `onnxruntime`
install) reports a single output named `fetch_name_0`
(`ConvTranspose_592_o0` shape), not `sigmoid_0.tmp_0` as the earlier
M0-F detector used. `fetch_name_0` is **pre-sigmoid logits**, not an
already-sigmoided probability map — the harness now applies sigmoid
itself before interpreting values as textness scores.

## Finding 2 — `limit_side_len` resize condition is on the *shorter*
side, not the longer

Reading a locally available, already-validated reference
implementation of this exact model's preprocessing (not guessed):

```python
if min(h, w) < self.limit_side_len:
    ratio = float(self.limit_side_len) / (h if h < w else w)
else:
    ratio = 1.0
```

This is the opposite of a naive "cap the longer side at 640" reading of
`limit_side_len` — a first guess in this spike using `max(h, w)` was
wrong and is corrected here (Rust harness now matches exactly).
Consequence: a real book-page-scan-shaped image (short side well over
640px, as `fixtures/ocr_real/ia_100.jpg`'s 1605px shorter side is) gets
**no downscale at all** and runs at native resolution — this is why the
original M0-F-style run against that fixture took 72 seconds on CPU (no
GPU acceleration available in this harness), and matches why the
reference implementation invests in GPU acceleration for this exact
model.

## Finding 3 — real inference runs end-to-end; output is not yet
confirmed correct

With both fixes applied (sigmoid + correct resize direction), the
detector loads and runs to completion against real fixture images
without error:

| Fixture | Resized to | min | max | mean | wall time (CPU) |
|---|---|---|---|---|---|
| `fixtures/ocr_real/ia_100.jpg` (real scanned page, 1605x2500) | 416x640 | 0.500000 | 0.730949 | 0.559078 | 781 ms |
| `fixtures/ocr_en.png` (synthetic clean text, 900x200) | 2880x640 | 0.500000 | 0.731051 | 0.503086 | 33,064 ms |

Neither output looks like a correct DBNet probability map. A working
detector's background pixels should sit near 0.0-0.1 and text-region
pixels near 0.9+; instead every pixel sits in a narrow ~0.50-0.73 band
regardless of image content, and the exact-0.500000 floor (`sigmoid(0)
== 0.5`) on both fixtures suggests the raw pre-sigmoid logits are
pinned near zero almost everywhere. This is **not yet confirmed
detection output** -- it's evidence the pipeline runs, not evidence it
works.

The leading unresolved hypothesis, not yet tested: the reference
implementation's preprocessing receives its input image as a raw array
from its own frame-decoding pipeline, whose channel order (RGB vs. BGR)
was not confirmed by reading the preprocessing function alone; this
Rust harness currently assumes RGB (via the `image` crate's default
decode). A channel-order mismatch is a well-known cause of exactly this
kind of washed-out, low-discrimination CNN output, and is the concrete
next step for whoever picks this checkpoint back up -- not a rabbit
hole to keep pulling on speculatively in this same pass. The very long
wall time on the small synthetic fixture (33s, vs. 781ms on the much
larger real scan) is also worth carrying forward: it's the direct
consequence of Finding 2's shorter-side upscale rule inflating a small
image to 2880x640 -- CPU inference cost scales with resized pixel
count, not input file size.

## Status: not yet ACCEPT

This is real, positive evidence that:
- the reused model + `onnxruntime.dll` are mechanically viable from
  Rust `ort` (loads, runs, returns a correctly-shaped tensor);
- this repo's own earlier preprocessing assumptions (both output name
  and resize direction) were wrong and are now corrected against a
  real, already-validated reference implementation, not guesswork.

It is **not** yet evidence of a working detector -- the channel-order
question above needs to be resolved and the output visually/numerically
validated against a known-good box before this can be called ACCEPTed.
Postprocessing (contour extraction, polygon unclipping) has **no Rust
port started yet at all** -- that dependency choice (an OpenCV-
equivalent Rust crate vs. a hand-built contour/unclip step, vs. an
FFI/subprocess bridge) is itself an open architecture question for the
next M5 checkpoint, not resolved here. Recognition
(`PP-OCRv6_rec_small.onnx`) and the text-orientation classifier
(`ch_ppocr_mobile_v2.0_cls_mobile.onnx`) have not been exercised at all
in this pass.
