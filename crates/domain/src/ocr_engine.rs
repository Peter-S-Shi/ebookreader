//! Real ONNX inference engine: wraps the reused PP-OCRv6 detector and
//! recognizer models via the Rust `ort` crate, composing
//! [`crate::ocr_preprocess`], [`crate::ocr_detect`], and
//! [`crate::ocr_recognize`] into one page-level `detect -> crop -> recognize
//! -> decode` pipeline.
//!
//! Requires a local `onnxruntime.dll` and the model files at runtime (dev
//! convention: `<repo-root>/ocr-assets/`, gitignored -- see
//! `tooling/m5-evidence/README.md`); this module compiles and links without
//! them (the `ort` crate's `load-dynamic` feature defers loading the dylib
//! to [`OcrEngine::load`] at runtime), but every method here is
//! model-dependent and therefore not covered by CI, which has no model
//! assets. The `#[ignore]`d integration test below is meant to be run
//! locally against `ocr-assets/`.

use crate::ocr_detect::detect_boxes;
use crate::ocr_preprocess::{det_preprocess, rec_preprocess};
use crate::ocr_recognize::ctc_greedy_decode;
use image::{DynamicImage, GenericImageView};
use ort::session::Session;
use ort::value::Tensor;
use std::path::Path;
use std::sync::Once;

/// `ort::init_from(...).commit()` sets a process-global environment; a
/// second call panics/errors. Guarded once per process so `OcrEngine::load`
/// is safe to call more than once (e.g. from more than one test in this
/// binary, or a future engine-reload path).
static ORT_INIT: Once = Once::new();

/// One recognized text line: its detected box, detector confidence,
/// recognized text, and recognizer confidence.
#[derive(Debug, Clone, PartialEq)]
pub struct RecognizedLine {
    pub points: [(f64, f64); 4],
    pub det_score: f32,
    pub text: String,
    pub rec_confidence: f32,
}

#[derive(Debug)]
pub enum OcrEngineError {
    Ort(ort::Error),
    MissingCharacterMetadata,
    DylibLoadFailed(String),
}

impl std::fmt::Display for OcrEngineError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            OcrEngineError::Ort(e) => write!(f, "ONNX Runtime error: {e}"),
            OcrEngineError::MissingCharacterMetadata => {
                write!(f, "recognition model is missing its embedded 'character' metadata")
            }
            OcrEngineError::DylibLoadFailed(msg) => write!(f, "failed to load onnxruntime dylib: {msg}"),
        }
    }
}

impl std::error::Error for OcrEngineError {}

impl From<ort::Error> for OcrEngineError {
    fn from(e: ort::Error) -> Self {
        OcrEngineError::Ort(e)
    }
}

/// A loaded detector + recognizer pair, ready to process page images.
/// Construction (`load`) is the expensive step; hold one `OcrEngine` for the
/// lifetime of an OCR job (or the app), not one per page.
pub struct OcrEngine {
    det_session: Session,
    rec_session: Session,
    rec_dict: Vec<String>,
}

const REC_IMG_H: u32 = 48;
const REC_MAX_W: u32 = 4000;

impl OcrEngine {
    /// Loads the ONNX Runtime dylib (once per process) and the detector +
    /// recognizer model files. The recognizer's character dictionary is
    /// read from its own embedded ONNX metadata (`character` key) -- not
    /// hardcoded or downloaded separately; see
    /// `tooling/m5-evidence/m5c_recognition_spike.md` Finding 1.
    pub fn load(
        dylib_path: &Path,
        det_model_path: &Path,
        rec_model_path: &Path,
    ) -> Result<Self, OcrEngineError> {
        let mut init_error: Option<String> = None;
        ORT_INIT.call_once(|| match ort::init_from(dylib_path.to_string_lossy().to_string()) {
            Ok(builder) => {
                builder.commit();
            }
            Err(e) => init_error = Some(e.to_string()),
        });
        if let Some(msg) = init_error {
            return Err(OcrEngineError::DylibLoadFailed(msg));
        }

        let det_session = Session::builder()?.commit_from_file(det_model_path)?;
        let rec_session = Session::builder()?.commit_from_file(rec_model_path)?;

        let dict_str = rec_session
            .metadata()?
            .custom("character")
            .ok_or(OcrEngineError::MissingCharacterMetadata)?;
        let rec_dict: Vec<String> = dict_str.split('\n').map(|s| s.to_string()).collect();

        Ok(OcrEngine { det_session, rec_session, rec_dict })
    }

    /// Runs the full pipeline on one page image: detect text-region boxes,
    /// crop each (axis-aligned bounding box of its rotated rect), recognize,
    /// and CTC-decode. Boxes are returned in the original image's
    /// coordinate space (already un-scaled from the detector's resized
    /// input space).
    pub fn process_page(&mut self, img: &DynamicImage) -> Result<Vec<RecognizedLine>, OcrEngineError> {
        let (w0, h0) = img.dimensions();
        let (det_chw, target_w, target_h, ratio) = det_preprocess(img);
        let det_shape = vec![1i64, 3, target_h as i64, target_w as i64];
        let det_input = Tensor::from_array((det_shape, det_chw))?;
        let det_outputs = self.det_session.run(ort::inputs!["x" => det_input])?;
        let (det_out_shape, det_raw) = det_outputs["fetch_name_0"].try_extract_tensor::<f32>()?;
        let pred_h = det_out_shape[2] as usize;
        let pred_w = det_out_shape[3] as usize;
        let pred: Vec<f32> = det_raw.to_vec();

        let mut boxes = detect_boxes(&pred, pred_w, pred_h);
        for b in &mut boxes {
            for p in &mut b.points {
                p.0 /= ratio as f64;
                p.1 /= ratio as f64;
            }
        }

        let rgb_full = img.to_rgb8();
        let mut results = Vec::with_capacity(boxes.len());

        for b in &boxes {
            let xmin = b.points.iter().map(|p| p.0).fold(f64::INFINITY, f64::min).floor().max(0.0) as u32;
            let xmax = (b.points.iter().map(|p| p.0).fold(f64::NEG_INFINITY, f64::max).ceil() as u32).min(w0.saturating_sub(1));
            let ymin = b.points.iter().map(|p| p.1).fold(f64::INFINITY, f64::min).floor().max(0.0) as u32;
            let ymax = (b.points.iter().map(|p| p.1).fold(f64::NEG_INFINITY, f64::max).ceil() as u32).min(h0.saturating_sub(1));
            if xmax <= xmin || ymax <= ymin {
                continue;
            }
            let crop_w = xmax - xmin;
            let crop_h = ymax - ymin;
            let cropped = image::imageops::crop_imm(&rgb_full, xmin, ymin, crop_w, crop_h).to_image();

            let (rec_chw, resized_w) = rec_preprocess(&cropped, REC_IMG_H, REC_MAX_W);
            let rec_shape = vec![1i64, 3, REC_IMG_H as i64, resized_w as i64];
            let rec_input = Tensor::from_array((rec_shape, rec_chw))?;
            let rec_outputs = self.rec_session.run(ort::inputs!["x" => rec_input])?;
            let (rec_out_shape, rec_raw) = rec_outputs["fetch_name_0"].try_extract_tensor::<f32>()?;
            let seq_len = rec_out_shape[1] as usize;
            let num_classes = rec_out_shape[2] as usize;
            let rec_logits: Vec<f32> = rec_raw.to_vec();
            let (text, conf) = ctc_greedy_decode(&rec_logits, seq_len, num_classes, &self.rec_dict);

            results.push(RecognizedLine { points: b.points, det_score: b.score, text, rec_confidence: conf });
        }

        Ok(results)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Local-only, requires `ocr-assets/{onnxruntime.dll,
    /// PP-OCRv6_det_medium.onnx, PP-OCRv6_rec_small.onnx}` at the repo root
    /// -- not present in CI. Run explicitly with:
    /// `cargo test -p ebookreader-domain -- --ignored processes_a_real_scanned_page_end_to_end`
    /// after populating `ocr-assets/` per `tooling/m5-evidence/README.md`.
    #[test]
    #[ignore]
    fn processes_a_real_scanned_page_end_to_end() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../ocr-assets");
        let fixture = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tooling/m0-evidence/fixtures/ocr_real/ia_100.jpg");

        let mut engine = OcrEngine::load(
            &root.join("onnxruntime.dll"),
            &root.join("PP-OCRv6_det_medium.onnx"),
            &root.join("PP-OCRv6_rec_small.onnx"),
        )
        .expect("failed to load OCR engine -- populate ocr-assets/ per tooling/m5-evidence/README.md");

        let img = image::open(&fixture).expect("failed to open fixture image");
        let lines = engine.process_page(&img).expect("process_page failed");

        assert!(!lines.is_empty(), "expected at least one detected/recognized line on a real scanned page");
        for line in &lines {
            assert!(line.det_score > 0.0);
        }
    }
}
