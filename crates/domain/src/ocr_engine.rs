//! Real ONNX inference engine: wraps the reused PP-OCRv6 detector,
//! recognizer, and text-orientation classifier models via the Rust `ort`
//! crate, composing [`crate::ocr_preprocess`], [`crate::ocr_detect`],
//! [`crate::ocr_classify`], and [`crate::ocr_recognize`] into one
//! page-level `detect -> crop -> classify orientation -> recognize ->
//! decode` pipeline.
//!
//! Requires a local `onnxruntime.dll` and the model files at runtime (dev
//! convention: `<repo-root>/ocr-assets/`, gitignored -- see
//! `tooling/m5-evidence/README.md`); this module compiles and links without
//! them (the `ort` crate's `load-dynamic` feature defers loading the dylib
//! to [`OcrEngine::load`] at runtime), but every method here is
//! model-dependent and therefore not covered by CI, which has no model
//! assets. The `#[ignore]`d integration test below is meant to be run
//! locally against `ocr-assets/`.

use crate::ocr_classify::{should_rotate_180, DEFAULT_CLS_THRESH};
use crate::ocr_detect::detect_boxes;
use crate::ocr_preprocess::{det_preprocess, rec_preprocess};
use crate::ocr_recognize::ctc_greedy_decode;
use image::{DynamicImage, GenericImageView, RgbImage};
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
/// recognized text, recognizer confidence, and whether the classifier
/// judged (and this pipeline acted on) a 180° rotation before recognition.
#[derive(Debug, Clone, PartialEq)]
pub struct RecognizedLine {
    pub points: [(f64, f64); 4],
    pub det_score: f32,
    pub text: String,
    pub rec_confidence: f32,
    pub rotated_180: bool,
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
    cls_session: Session,
    rec_session: Session,
    rec_dict: Vec<String>,
}

const REC_IMG_H: u32 = 48;
const REC_MAX_W: u32 = 4000;
const CLS_IMG_H: u32 = 48;
const CLS_MAX_W: u32 = 192;

impl OcrEngine {
    /// Loads the ONNX Runtime dylib (once per process) and the detector,
    /// classifier, and recognizer model files. The recognizer's character
    /// dictionary is read from its own embedded ONNX metadata (`character`
    /// key) -- not hardcoded or downloaded separately; see
    /// `tooling/m5-evidence/m5c_recognition_spike.md` Finding 1.
    pub fn load(
        dylib_path: &Path,
        det_model_path: &Path,
        cls_model_path: &Path,
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
        let cls_session = Session::builder()?.commit_from_file(cls_model_path)?;
        let rec_session = Session::builder()?.commit_from_file(rec_model_path)?;

        let dict_str = rec_session
            .metadata()?
            .custom("character")
            .ok_or(OcrEngineError::MissingCharacterMetadata)?;
        let rec_dict: Vec<String> = dict_str.split('\n').map(|s| s.to_string()).collect();

        Ok(OcrEngine { det_session, cls_session, rec_session, rec_dict })
    }

    /// Runs the orientation classifier on one already-cropped text-line
    /// image and returns its raw `[p_0deg, p_180deg]` output.
    fn classify(&mut self, cropped: &RgbImage) -> Result<[f32; 2], OcrEngineError> {
        let (cls_chw, resized_w) = rec_preprocess(cropped, CLS_IMG_H, CLS_MAX_W);
        let cls_shape = vec![1i64, 3, CLS_IMG_H as i64, resized_w as i64];
        let cls_input = Tensor::from_array((cls_shape, cls_chw))?;
        let cls_outputs = self.cls_session.run(ort::inputs!["x" => cls_input])?;
        let (_shape, raw) = cls_outputs["save_infer_model/scale_0.tmp_1"].try_extract_tensor::<f32>()?;
        Ok([raw[0], raw[1]])
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
        let (pred, pred_w, pred_h) = {
            let det_outputs = self.det_session.run(ort::inputs!["x" => det_input])?;
            let (det_out_shape, det_raw) = det_outputs["fetch_name_0"].try_extract_tensor::<f32>()?;
            let pred_h = det_out_shape[2] as usize;
            let pred_w = det_out_shape[3] as usize;
            (det_raw.to_vec(), pred_w, pred_h)
        };

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

            let cls_probs = self.classify(&cropped)?;
            let rotated_180 = should_rotate_180(cls_probs, DEFAULT_CLS_THRESH);
            let rec_source = if rotated_180 {
                image::imageops::rotate180(&cropped)
            } else {
                cropped
            };

            let (rec_chw, resized_w) = rec_preprocess(&rec_source, REC_IMG_H, REC_MAX_W);
            let rec_shape = vec![1i64, 3, REC_IMG_H as i64, resized_w as i64];
            let rec_input = Tensor::from_array((rec_shape, rec_chw))?;
            let (rec_logits, seq_len, num_classes) = {
                let rec_outputs = self.rec_session.run(ort::inputs!["x" => rec_input])?;
                let (rec_out_shape, rec_raw) = rec_outputs["fetch_name_0"].try_extract_tensor::<f32>()?;
                let seq_len = rec_out_shape[1] as usize;
                let num_classes = rec_out_shape[2] as usize;
                (rec_raw.to_vec(), seq_len, num_classes)
            };
            let (text, conf) = ctc_greedy_decode(&rec_logits, seq_len, num_classes, &self.rec_dict);

            results.push(RecognizedLine {
                points: b.points,
                det_score: b.score,
                text,
                rec_confidence: conf,
                rotated_180,
            });
        }

        Ok(results)
    }
}

struct Positioned {
    index: usize,
    y_center: f64,
    x_center: f64,
    x_min: f64,
    height: f64,
}

fn positioned_lines(lines: &[RecognizedLine]) -> Vec<Positioned> {
    lines
        .iter()
        .enumerate()
        .map(|(index, l)| {
            let ys: Vec<f64> = l.points.iter().map(|p| p.1).collect();
            let xs: Vec<f64> = l.points.iter().map(|p| p.0).collect();
            let y_min = ys.iter().cloned().fold(f64::INFINITY, f64::min);
            let y_max = ys.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
            let x_min = xs.iter().cloned().fold(f64::INFINITY, f64::min);
            let x_max = xs.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
            Positioned {
                index,
                y_center: (y_min + y_max) / 2.0,
                x_center: (x_min + x_max) / 2.0,
                x_min,
                height: (y_max - y_min).max(1.0),
            }
        })
        .collect()
}

fn median_height(positioned: &[Positioned]) -> f64 {
    let mut heights: Vec<f64> = positioned.iter().map(|p| p.height).collect();
    heights.sort_by(|a, b| a.total_cmp(b));
    heights[heights.len() / 2].max(1.0)
}

/// Assigns each line a column index (0 = leftmost) by looking for gaps in
/// the sorted sequence of line horizontal centers wider than `gap_threshold`
/// -- a real column gutter reliably produces a much bigger jump than the
/// spacing between ordinary lines or paragraph indents within one column.
/// Unlike clustering by extending each column's x-range (bounding-box
/// envelope), a stray full-width line (a header, footer, or page number)
/// only affects its own position in this sorted-center ordering -- it
/// cannot merge two real columns into one by "swallowing" the gap between
/// them, which a naive envelope-based approach is vulnerable to.
fn assign_columns(positioned: &[Positioned], gap_threshold: f64) -> Vec<usize> {
    let mut order: Vec<usize> = (0..positioned.len()).collect();
    order.sort_by(|&a, &b| positioned[a].x_center.total_cmp(&positioned[b].x_center));

    let mut column_of = vec![0usize; positioned.len()];
    let mut current_column = 0usize;
    for w in 1..order.len() {
        let gap = positioned[order[w]].x_center - positioned[order[w - 1]].x_center;
        if gap > gap_threshold {
            current_column += 1;
        }
        column_of[order[w]] = current_column;
    }
    column_of
}

/// Assembles recognized lines into page text using a reading order that
/// detects side-by-side columns (via [`assign_columns`]) and reads each
/// column to completion, top to bottom, before moving to the next column
/// left to right; within a column, lines at nearly the same height (small
/// detection jitter) are treated as one row.
///
/// This closes the multi-column splicing failure mode confirmed in
/// `tooling/m5-evidence/m5e_multi_column_cjk_evidence.md` Finding 2 (two
/// side-by-side columns' lines interleaving row-by-row instead of each
/// column being read to completion). It does **not** solve vertical-CJK
/// reading order (columns are still read top-to-bottom left-to-right,
/// which is wrong for a script read top-to-bottom right-to-left) -- that
/// remains an open M0-carried residual owned by M5
/// (`PROJECT_STATUS.md` "M0's carried-forward OCR residuals";
/// `m5e_multi_column_cjk_evidence.md` Finding 3).
pub fn reading_order_text(lines: &[RecognizedLine]) -> String {
    if lines.is_empty() {
        return String::new();
    }

    let positioned = positioned_lines(lines);
    let median_height = median_height(&positioned);
    // A real column gutter is reliably wider than a paragraph's own line
    // height (comparable to several character widths); ordinary
    // within-column horizontal jitter (indents, ragged margins) is not.
    let column_of = assign_columns(&positioned, median_height * 3.0);

    let mut order: Vec<usize> = (0..positioned.len()).collect();
    order.sort_by(|&a, &b| {
        column_of[a].cmp(&column_of[b]).then_with(|| {
            let row_a = (positioned[a].y_center / median_height).round() as i64;
            let row_b = (positioned[b].y_center / median_height).round() as i64;
            row_a.cmp(&row_b).then_with(|| positioned[a].x_min.total_cmp(&positioned[b].x_min))
        })
    });

    order.iter().map(|&i| lines[positioned[i].index].text.as_str()).collect::<Vec<_>>().join("\n")
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
            &root.join("ch_ppocr_mobile_v2.0_cls_mobile.onnx"),
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

    /// M0-carried residual evidence gathering: runs the real pipeline
    /// against `ia_200.jpg` (see `tooling/m0-evidence/fixtures/ocr_real/SOURCE.md`)
    /// -- a real, degraded, public-domain page with vertical classical
    /// Chinese columns above an English translation and two-column English
    /// commentary. Prints the assembled text with `--nocapture` for manual
    /// inspection; the reading-order limits this documents are recorded in
    /// `tooling/m5-evidence/m5e_multi_column_cjk_evidence.md`, not asserted
    /// here (this test's job is to produce real output to look at, not to
    /// assert a correctness bar `reading_order_text` doesn't claim to meet).
    /// As of the column-clustering fix, the two-column English commentary
    /// on this fixture reads as two coherent continuous paragraphs; the
    /// vertical-CJK block still reads in the wrong order (see the synthetic
    /// `column_clustering_separates_two_side_by_side_columns` test below
    /// for a fast, CI-covered regression case of the part that's fixed).
    #[test]
    #[ignore]
    fn processes_a_real_multi_column_cjk_page_and_surfaces_its_text() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../ocr-assets");
        let fixture = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tooling/m0-evidence/fixtures/ocr_real/ia_200.jpg");

        let mut engine = OcrEngine::load(
            &root.join("onnxruntime.dll"),
            &root.join("PP-OCRv6_det_medium.onnx"),
            &root.join("ch_ppocr_mobile_v2.0_cls_mobile.onnx"),
            &root.join("PP-OCRv6_rec_small.onnx"),
        )
        .expect("failed to load OCR engine -- populate ocr-assets/ per tooling/m5-evidence/README.md");

        let img = image::open(&fixture).expect("failed to open fixture image");
        let lines = engine.process_page(&img).expect("process_page failed");
        assert!(!lines.is_empty(), "expected at least one detected/recognized line on a real scanned page");

        let text = reading_order_text(&lines);
        println!("--- ia_200.jpg: {} lines detected ---", lines.len());
        println!("{text}");

        println!("--- box geometry for lines whose text contains CJK characters ---");
        for l in &lines {
            let is_cjk = l.text.chars().any(|c| ('\u{4e00}'..='\u{9fff}').contains(&c));
            if is_cjk {
                let xs: Vec<f64> = l.points.iter().map(|p| p.0).collect();
                let ys: Vec<f64> = l.points.iter().map(|p| p.1).collect();
                let x_min = xs.iter().cloned().fold(f64::INFINITY, f64::min);
                let x_max = xs.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
                let y_min = ys.iter().cloned().fold(f64::INFINITY, f64::min);
                let y_max = ys.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
                println!(
                    "x=[{x_min:.0},{x_max:.0}] y=[{y_min:.0},{y_max:.0}] w={:.0} h={:.0} text={:?}",
                    x_max - x_min,
                    y_max - y_min,
                    l.text
                );
            }
        }
    }

    fn line_at(text: &str, x_min: f64, y_min: f64, w: f64, h: f64) -> RecognizedLine {
        RecognizedLine {
            points: [(x_min, y_min), (x_min + w, y_min), (x_min + w, y_min + h), (x_min, y_min + h)],
            det_score: 0.9,
            text: text.to_string(),
            rec_confidence: 0.9,
            rotated_180: false,
        }
    }

    #[test]
    fn reading_order_text_orders_rows_top_to_bottom() {
        let lines = vec![
            line_at("second", 0.0, 100.0, 200.0, 20.0),
            line_at("first", 0.0, 0.0, 200.0, 20.0),
            line_at("third", 0.0, 200.0, 200.0, 20.0),
        ];
        assert_eq!(reading_order_text(&lines), "first\nsecond\nthird");
    }

    #[test]
    fn reading_order_text_orders_same_row_left_to_right() {
        let lines = vec![
            line_at("right", 300.0, 0.0, 100.0, 20.0),
            line_at("left", 0.0, 0.0, 100.0, 20.0),
        ];
        assert_eq!(reading_order_text(&lines), "left\nright");
    }

    #[test]
    fn reading_order_text_tolerates_small_y_jitter_within_the_same_line() {
        // Real detector output rarely produces exactly-equal y-centers for
        // two boxes on the same printed line; a few pixels of jitter must
        // still be treated as the same row.
        let lines = vec![
            line_at("right", 300.0, 2.0, 100.0, 20.0),
            line_at("left", 0.0, 0.0, 100.0, 20.0),
        ];
        assert_eq!(reading_order_text(&lines), "left\nright");
    }

    #[test]
    fn reading_order_text_of_an_empty_page_is_empty() {
        assert_eq!(reading_order_text(&[]), "");
    }

    /// Regression case for the multi-column splicing fix (see
    /// `tooling/m5-evidence/m5e_multi_column_cjk_evidence.md` Finding 2,
    /// confirmed fixed against the real fixture there): two side-by-side
    /// columns, each three lines, at matching heights -- a naive
    /// row-bucket-then-left-to-right ordering would interleave them
    /// (left1, right1, left2, right2, left3, right3); column-aware
    /// ordering must read the left column to completion, then the right.
    #[test]
    fn column_clustering_separates_two_side_by_side_columns() {
        let lines = vec![
            line_at("L1", 0.0, 0.0, 150.0, 20.0),
            line_at("R1", 400.0, 0.0, 150.0, 20.0),
            line_at("L2", 0.0, 25.0, 150.0, 20.0),
            line_at("R2", 400.0, 25.0, 150.0, 20.0),
            line_at("L3", 0.0, 50.0, 150.0, 20.0),
            line_at("R3", 400.0, 50.0, 150.0, 20.0),
        ];
        assert_eq!(reading_order_text(&lines), "L1\nL2\nL3\nR1\nR2\nR3");
    }

    /// A stray full-width line (a header/footer/page number spanning most
    /// of the page) must not merge two real columns into one by
    /// "swallowing" the gap between them -- the risk a naive
    /// envelope-extension column-detection approach has, and specifically
    /// why `assign_columns` clusters by sorted-center gaps instead.
    #[test]
    fn a_full_width_header_does_not_merge_two_real_columns() {
        let lines = vec![
            line_at("HEADER SPANNING BOTH COLUMNS", 0.0, -40.0, 550.0, 20.0),
            line_at("L1", 0.0, 0.0, 150.0, 20.0),
            line_at("R1", 400.0, 0.0, 150.0, 20.0),
            line_at("L2", 0.0, 25.0, 150.0, 20.0),
            line_at("R2", 400.0, 25.0, 150.0, 20.0),
        ];
        let text = reading_order_text(&lines);
        let l1_pos = text.find("L1").unwrap();
        let l2_pos = text.find("L2").unwrap();
        let r1_pos = text.find("R1").unwrap();
        assert!(l1_pos < r1_pos, "left column's first line must still precede the right column, got: {text:?}");
        assert!(l1_pos < l2_pos, "left column's own lines must still be in order, got: {text:?}");
    }
}
