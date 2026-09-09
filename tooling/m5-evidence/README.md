# M5 Evidence — OCR Model Provenance

This directory holds **evidence and documentation only** — no model
binaries or runtime DLLs are committed here or anywhere in this
repository (`.gitignore` excludes `/ocr-assets/`, `/models/`, `*.onnx`).

## Decision record

Per `M0_ARCHITECTURE_DECISION.md` SS8, the accepted OCR backend is a
PP-OCR-class ONNX pipeline run via the Rust `ort` crate. Building and
evidencing that pipeline needs real model files and a real
`onnxruntime.dll` locally — a filesystem search of this repo/sandbox on
2026-09-09 confirmed neither existed here.

The user (session owner) explicitly declined to have new OCR binaries
downloaded into this public repository at this stage, and instead
directed reuse of already-license-cleared PP-OCRv6 model assets already
present on this machine from prior, unrelated local OCR work (a
separate private project on this same machine that ships the same
PP-OCRv6 model family in its own release, and had already conducted and
passed a formal redistribution/licensing audit on that exact asset
set).

## Reused assets

Copied into this repo's gitignored `ocr-assets/` directory on
2026-09-09:

| File | Bytes | SHA-256 |
|---|---|---|
| `PP-OCRv6_det_medium.onnx` (text detector) | 62,119,454 | `92078b7355007ccfffcd4c8cd441a3afd4538904d06881b29a155e1e679907c2` |
| `PP-OCRv6_rec_small.onnx` (text recognizer) | 21,234,383 | `6f327246b50388f3c176ae304bd95767ea6dc0c9ae92153ef8cbe210b3c14884` |
| `ch_ppocr_mobile_v2.0_cls_mobile.onnx` (text-orientation classifier) | 585,532 | `e47acedf663230f8863ff1ab0e64dd2d82b838fceb5957146dab185a89d6215c` |
| `onnxruntime.dll` | 21,111,832 | (copied alongside; not independently re-hashed against an upstream release here — see Residual below) |
| `onnxruntime_providers_shared.dll` | 21,576 | (copied alongside the above) |

Hashes above were computed directly against the files as copied into
this repo's `ocr-assets/`, and independently against the source
project's own copies — they match exactly. The source project's own
download cache is itself content-addressed by these same SHA-256
values, confirming its packaging pipeline had already content-verified
these downloads before this reuse.

## Licensing

The source project's own formal redistribution/licensing audit
(conducted 2026-09-06, on the identical asset set verified above by
matching SHA-256) recorded: "All OCR model assets
(`PP-OCRv6_det_medium.onnx`, `PP-OCRv6_rec_small.onnx`,
`ch_ppocr_mobile_v2.0_cls_mobile.onnx`, and 2 Paddle CPU inference
archives) resolved under Apache-2.0 via PaddlePaddle release
announcement and RapidOCR ModelScope publication." This is a prior,
already-conducted audit, not a fresh, unverified claim made for this
project.

## Detector pre/post-processing parameters

The detector (`PP-OCRv6_det_medium.onnx`) uses Paddle's DBNet pre/post-
processing with `limit_side_len=640`, `thresh=0.2`, `box_thresh=0.45`,
`unclip_ratio=1.4`, and ImageNet normalization (mean `[0.485, 0.456,
0.406]`, std `[0.229, 0.224, 0.225]` — the same normalization already
used in this repo's own M0-F spike, `tooling/m0-evidence/`). Sourced
from the reference implementation's own validated code (see
`m5a_det_medium_rust_ort_spike.md` for the specific resize-condition
finding this corrected). These parameters are load-bearing for a
correct Rust port and are recorded here so the production
implementation doesn't have to reverse-engineer them from scratch.

## Local dev convention

Real inference development against these assets expects them at
`<repo-root>/ocr-assets/` (gitignored). A machine without that
directory populated will not have real OCR inference available; the
pre-OCR degraded state (`PdfReader.tsx`, `PRODUCT_SPEC.md` SS13.2)
already covers that case honestly rather than crashing or pretending.

## Residuals / open questions (explicit, not silently dropped)

1. **Final release distribution strategy is not decided.** Per the
   user's direction, this stays open for later packaging/release
   evidence work rather than being resolved now by committing large
   binaries to this public source repo.
2. **`onnxruntime.dll` itself was not independently re-verified against
   an upstream ONNX Runtime release hash** in this pass (only copied
   and content-matched against the source project's own already-
   verified copy). A from-scratch upstream hash check is straightforward
   follow-up if ever needed.
3. `ort-sys` ships no prebuilt `x86_64-pc-windows-gnu` binary (only
   MSVC) — `M0_ARCHITECTURE_DECISION.md` §7 already recorded this;
   local dev on this sandbox's GNU toolchain will need
   `load-dynamic` (as the M0-F spike used) or an MSVC toolchain.
