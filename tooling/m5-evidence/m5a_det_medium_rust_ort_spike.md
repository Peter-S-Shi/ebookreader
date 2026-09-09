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

The very long wall time on the small synthetic fixture (33s, vs. 781ms
on the much larger real scan) is worth carrying forward: it's the
direct consequence of Finding 2's shorter-side upscale rule inflating a
small image to 2880x640 -- CPU inference cost scales with resized pixel
count, not input file size.

## Finding 4 — root cause was a double-sigmoid bug, not channel order

The channel-order hypothesis above was tested empirically, not assumed:
a standalone Python cross-check (same model, same fixture, CPU
provider, the reference implementation's exact preprocess/postprocess
logic ported inline) ran the detector against both BGR (native
`cv2.imread` order) and RGB (converted) input and found **bit-for-bit
identical output** either way -- channel order is not a live hypothesis
for this model.

The actual bug: `fetch_name_0` is **already a sigmoid-activated [0,1]
probability map**, not pre-sigmoid logits as Finding 1 assumed. Both
this Rust harness and the first pass of the Python cross-check were
applying sigmoid a second time, which compresses [0,1] into
[0.5, 0.7310585] (`sigmoid(0)=0.5`, `sigmoid(1)=0.7310585`) -- an exact
numeric match to the flat ~0.50-0.73 band observed on every fixture in
Finding 3. Removing the redundant sigmoid in the Python cross-check
produced a sane, spatially-varying map (min 0.000000, max 0.999886,
mean 0.207557) with 142 plausible detection boxes (scores 0.759-0.926)
on the real scanned-page fixture.

Applying the same fix to this Rust harness (dropping the post-hoc
sigmoid on `fetch_name_0`) and re-running against the same real fixture
reproduced the Python result almost exactly from Rust `ort` directly:

| | Python (`cv2`/`onnxruntime`, cross-check) | Rust `ort` (this harness) |
|---|---|---|
| output min | 0.000000 | 0.000000 |
| output max | 0.999886 | 0.999886 |
| output mean | 0.207557 | 0.207661 |
| textness pixels (>0.3) | -- | 856,341 / 3,993,600 (21.4%) |

The tiny mean delta (0.207557 vs 0.207661) is consistent with `cv2`'s
vs. `image`-crate's resize interpolation differing slightly, not a
remaining bug.

## Status: ACCEPT (detection tensor stage only)

This is now real, positive evidence that:
- the reused model + `onnxruntime.dll` are mechanically viable from
  Rust `ort` (loads, runs, returns a correctly-shaped tensor);
- this repo's own earlier preprocessing assumptions (output name and
  resize direction) were wrong and are now corrected against a real,
  already-validated reference implementation, not guesswork;
- the earlier degenerate output was a double-sigmoid bug in this
  harness, empirically root-caused (not channel order) and confirmed
  fixed in both a Python cross-check and the Rust `ort` harness itself,
  producing a plausible, spatially-varying textness map on a real
  scanned-page fixture.

**ACCEPT is scoped to the raw detection tensor**: the model loads,
preprocesses, and runs correctly from Rust and its output is no longer
degenerate. Turning that tensor into actual text-region boxes still
needs the postprocessing step (contour extraction, box scoring, polygon
unclip) ported to Rust -- **not started yet**; see `README.md` in this
directory for the crate-selection decision for that step. Recognition
(`PP-OCRv6_rec_small.onnx`) and the text-orientation classifier
(`ch_ppocr_mobile_v2.0_cls_mobile.onnx`) have not been exercised at all
in this pass.
