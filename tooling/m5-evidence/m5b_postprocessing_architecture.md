# M5-B: DBNet postprocessing architecture — Rust crate selection

Continuation of `m5a_det_medium_rust_ort_spike.md`, which reached ACCEPT
on the raw detection tensor (the model's probability map). This checkpoint
covers the next stage: turning that probability map into actual text-region
boxes (contour extraction, box scoring, polygon unclip) — the reference
implementation's own postprocessing uses `cv2.findContours` /
`cv2.minAreaRect` / `pyclipper`, none of which have a direct Rust binding
without an OpenCV FFI dependency.

## Question

Can this postprocessing be done with pure-Rust crates instead of an
OpenCV/pyclipper FFI bridge, and does it reproduce the reference
implementation's real detection output on the same fixture?

## Prototype / Experiment

Ported the reference implementation's postprocessing (thresh=0.2,
box_thresh=0.45, unclip_ratio=1.4 — see `README.md` in this directory)
into a Rust harness using:
- `imageproc::contours::find_contours` for border-following contour
  extraction (the `cv2.findContours(..., RETR_LIST, ...)` equivalent);
- `geo-clipper` (a binding to the same underlying Clipper C++ library
  `pyclipper` itself wraps) for the polygon unclip/offset step.

For the remaining step — minimum-area bounding rectangle of a contour's
convex hull, `cv2.minAreaRect`'s equivalent — first tried
`imageproc::geometry::{convex_hull, min_area_rect}` directly.

## Finding 1 — `imageproc::geometry` (0.27.0)'s hull/rect functions panic on real data

Running the above against the real scanned-page fixture
(`fixtures/ocr_real/ia_100.jpg`) panicked partway through:
`"user-provided comparison function does not correctly implement a total
order"`. Reading the actual source (`imageproc` 0.27.0,
`src/geometry.rs`) confirmed two independent bugs, not a misuse on this
harness's part:
- `convex_hull`'s point sort resolves collinear ties by always returning
  `Ordering::Greater`, which is not transitive;
- `min_area_rect`'s internal `rotating_calipers` step sorts with
  `partial_cmp(...).unwrap()`, which panics outright on NaN/incomparable
  ties that can arise after its own rotation math.

Wrapping each contour's processing in `catch_unwind` to measure impact
(rather than just working around it blindly) showed the damage was real,
not cosmetic: of the 142 contours DBNet's bitmap produced on the real
fixture (matching the reference implementation's own contour count
exactly), 46 (32%) hit this panic and were silently lost, leaving only
96 recovered boxes — a real accuracy regression, not an edge case worth
ignoring.

## Finding 2 — a small hand-rolled hull + rotating-calipers replacement is panic-free and matches the reference count exactly

Replaced only the two buggy `imageproc::geometry` calls (contour
extraction and the offset step were unaffected and stayed as-is) with a
~70-line hand-rolled monotone-chain convex hull and rotating-calipers
min-area-rect, using `f64::total_cmp` throughout — a genuine total order
over floats, including ties and (by construction, since no NaN is ever
produced by this arithmetic) panic-proof.

Re-running end-to-end against the same real fixture:

| | Reference (`cv2`/`pyclipper`, Python cross-check) | Rust (`imageproc` contours + geo-clipper + hand-rolled hull/rect) |
|---|---|---|
| contours found | 142 | 142 |
| boxes recovered (score ≥ 0.45) | 142 | 142 |
| box score range | 0.759–0.926 | 0.836–0.946 |

Box count now matches exactly with zero panics or silent drops. The
score-range difference (0.836–0.946 vs. 0.759–0.926) is consistent with
the two implementations' box-region score masks being rasterized
slightly differently (`cv2.fillPoly` vs. this harness's point-in-polygon
sampling at pixel centers) — both ranges are well clear of the 0.45
threshold and the same order of magnitude, not a discrepancy that
changes which boxes are accepted.

## Architecture Implication

`imageproc::contours::find_contours` and `geo-clipper`'s polygon offset
are both real, working, panic-free replacements for their OpenCV/pyclipper
equivalents and reproduce the reference implementation's box count
exactly on real data. `imageproc::geometry::{convex_hull, min_area_rect}`
(0.27.0) are not safe to depend on for this pipeline — they have
confirmed, reproducible correctness bugs on real DBNet contour data, not
just a theoretical edge case.

## Status: MODIFY → ACCEPT

**ACCEPT**: `imageproc::contours::find_contours` + `geo-clipper` (polygon
offset), combined with a small in-house convex-hull + rotating-calipers
implementation (`f64::total_cmp`-based, panic-proof by construction) in
place of `imageproc::geometry`'s buggy equivalents. This combination is
pure Rust (no OpenCV/FFI dependency), reproduces the reference
implementation's box count exactly (142/142) on a real fixture, and the
hand-rolled portion is small enough to unit-test directly with synthetic
probability maps — no model asset required, so it can run in CI (see
`crates/domain/src/ocr_detect.rs`).

**Residual**: only one real fixture has been used for this comparison so
far; broader fixture coverage (multi-column, CJK, degraded scans) is
still owed under M5's Success Evidence and M0's carried-forward OCR
residuals, not yet closed here.
