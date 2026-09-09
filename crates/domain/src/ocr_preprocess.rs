//! DBNet detector and CTC recognizer image preprocessing.
//!
//! Pure functions over `image` crate types -- no ONNX/model dependency, so
//! these run in CI without any model asset. Parameters match the accepted
//! DBNet/PaddleOCR conventions recorded in `tooling/m5-evidence/README.md`
//! and `tooling/m5-evidence/m5c_recognition_spike.md`.

use image::{DynamicImage, RgbImage};

const DET_LIMIT_SIDE_LEN: f32 = 640.0;
const DET_MEAN: [f32; 3] = [0.485, 0.456, 0.406];
const DET_STD: [f32; 3] = [0.229, 0.224, 0.225];

/// Computes the detector's resize target dimensions per DBNet's
/// `limit_side_len` rule: if the *shorter* side is under 640px, scale up so
/// it hits exactly 640; otherwise leave scale at 1.0. Both dimensions are
/// then rounded to the nearest multiple of 32 (min 32). Returns
/// `(target_w, target_h, ratio)` -- `ratio` is needed to map detected box
/// coordinates back into the original image's coordinate space.
///
/// The `min(h, w)` condition (not `max`) was a real correction during M5-A
/// (see `tooling/m5-evidence/m5a_det_medium_rust_ort_spike.md` Finding 2) --
/// a first guess using the longer side was wrong.
pub fn det_resize_dims(w0: u32, h0: u32) -> (u32, u32, f32) {
    let shorter_side = w0.min(h0) as f32;
    let ratio = if shorter_side < DET_LIMIT_SIDE_LEN { DET_LIMIT_SIDE_LEN / shorter_side } else { 1.0 };
    let target_w = (((w0 as f32 * ratio) / 32.0).round() as u32 * 32).max(32);
    let target_h = (((h0 as f32 * ratio) / 32.0).round() as u32 * 32).max(32);
    (target_w, target_h, ratio)
}

/// ImageNet-style CHW normalization: `(pixel/255 - mean[c]) / std[c]`,
/// producing a row-major `[3, height, width]` `f32` array.
pub fn normalize_chw(img: &RgbImage, mean: [f32; 3], std: [f32; 3]) -> Vec<f32> {
    let (w, h) = img.dimensions();
    let mut out = vec![0.0f32; 3 * (h as usize) * (w as usize)];
    let plane = (h as usize) * (w as usize);
    for y in 0..h {
        for x in 0..w {
            let px = img.get_pixel(x, y);
            for c in 0..3 {
                let v = px[c] as f32 / 255.0;
                out[c * plane + (y as usize) * (w as usize) + x as usize] = (v - mean[c]) / std[c];
            }
        }
    }
    out
}

/// Full detector preprocessing: resize per [`det_resize_dims`] and
/// ImageNet-normalize. Returns `(chw_data, target_w, target_h, ratio)`
/// ready to feed as a `[1, 3, target_h, target_w]` model input.
pub fn det_preprocess(img: &DynamicImage) -> (Vec<f32>, u32, u32, f32) {
    let (w0, h0) = (img.width(), img.height());
    let (target_w, target_h, ratio) = det_resize_dims(w0, h0);
    let resized = img.resize_exact(target_w, target_h, image::imageops::FilterType::Triangle);
    let chw = normalize_chw(&resized.to_rgb8(), DET_MEAN, DET_STD);
    (chw, target_w, target_h, ratio)
}

/// Computes the recognizer's resized width for a cropped text-line image,
/// preserving aspect ratio at a fixed height (`img_h`, PaddleOCR's `imgH=48`
/// convention). Unlike PaddleOCR's own reference implementation -- which
/// caps width at a fixed `imgW` (320) because it batches multiple
/// same-width crops together -- this pipeline runs one crop at a time
/// (batch size 1) against a model with a dynamic width dimension, so no
/// batch-uniform cap is needed. `max_w` is only a generous safety bound
/// against pathological input, not the batching cap PaddleOCR uses; a wide
/// real text line (e.g. a full-width body-text line, routinely 500-600px in
/// M5-C's real fixture) keeps its actual resolution instead of being
/// destructively downsampled to 320px, which was identified as a likely
/// contributor to the recognition-accuracy gap in
/// `tooling/m5-evidence/m5c_recognition_spike.md` Finding 4.
pub fn rec_resize_width(crop_w: u32, crop_h: u32, img_h: u32, max_w: u32) -> u32 {
    if crop_h == 0 {
        return 1;
    }
    let ratio_wh = crop_w as f32 / crop_h as f32;
    ((img_h as f32 * ratio_wh).ceil() as u32).clamp(1, max_w)
}

/// Full recognizer preprocessing for one cropped text-line image: resize to
/// `(resized_w, img_h)` per [`rec_resize_width`] (no batch padding -- batch
/// size 1), normalize via `(pixel/255 - 0.5) / 0.5` (PaddleOCR's rec
/// normalization, distinct from the detector's ImageNet normalization).
/// Returns `(chw_data, resized_w)` ready to feed as a
/// `[1, 3, img_h, resized_w]` model input.
pub fn rec_preprocess(cropped: &RgbImage, img_h: u32, max_w: u32) -> (Vec<f32>, u32) {
    let (crop_w, crop_h) = cropped.dimensions();
    let resized_w = rec_resize_width(crop_w, crop_h, img_h, max_w);
    let resized = DynamicImage::ImageRgb8(cropped.clone())
        .resize_exact(resized_w, img_h, image::imageops::FilterType::Triangle)
        .to_rgb8();
    let chw = normalize_chw(&resized, [0.5, 0.5, 0.5], [0.5, 0.5, 0.5]);
    (chw, resized_w)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn det_resize_dims_matches_the_real_fixture_result_from_the_m5a_spike() {
        // Real, evidenced values from tooling/m5-evidence/m5a_det_medium_rust_ort_spike.md
        // Finding 3: a 1605x2500 scan (shorter side 1605 > 640, so ratio=1.0)
        // resizes to 1600x2496 (rounded to the nearest multiple of 32).
        let (w, h, ratio) = det_resize_dims(1605, 2500);
        assert_eq!((w, h), (1600, 2496));
        assert_eq!(ratio, 1.0);
    }

    #[test]
    fn det_resize_dims_scales_up_when_the_shorter_side_is_under_the_limit() {
        // A small synthetic fixture from the same spike: 900x200 (shorter
        // side 200 < 640) resizes to 2880x640.
        let (w, h, ratio) = det_resize_dims(900, 200);
        assert_eq!((w, h), (2880, 640));
        assert!((ratio - 3.2).abs() < 0.01);
    }

    #[test]
    fn det_resize_dims_conditions_on_the_shorter_side_not_the_longer() {
        // Regression case for the Finding 2 correction: a portrait image
        // whose *width* (400) is under the limit but whose height (2000)
        // is already well over it must still scale based on the shorter
        // side (400), not leave it untouched because the longer side
        // exceeds 640.
        let (w, _h, _ratio) = det_resize_dims(400, 2000);
        assert!(w >= 640, "shorter side (width) must be scaled up to at least 640, got {w}");
    }

    #[test]
    fn normalize_chw_centers_a_zero_pixel_at_negative_mean_over_std() {
        let img = RgbImage::from_pixel(2, 2, image::Rgb([0, 0, 0]));
        let out = normalize_chw(&img, DET_MEAN, DET_STD);
        // Channel 0, pixel (0,0): (0/255 - mean[0]) / std[0]
        let expected = (0.0 - DET_MEAN[0]) / DET_STD[0];
        assert!((out[0] - expected).abs() < 1e-6);
    }

    #[test]
    fn normalize_chw_maps_a_white_pixel_under_rec_normalization_to_positive_one() {
        let img = RgbImage::from_pixel(1, 1, image::Rgb([255, 255, 255]));
        let out = normalize_chw(&img, [0.5, 0.5, 0.5], [0.5, 0.5, 0.5]);
        for c in 0..3 {
            assert!((out[c] - 1.0).abs() < 1e-4, "channel {c} = {}", out[c]);
        }
    }

    #[test]
    fn normalize_chw_maps_a_black_pixel_under_rec_normalization_to_negative_one() {
        let img = RgbImage::from_pixel(1, 1, image::Rgb([0, 0, 0]));
        let out = normalize_chw(&img, [0.5, 0.5, 0.5], [0.5, 0.5, 0.5]);
        for c in 0..3 {
            assert!((out[c] - (-1.0)).abs() < 1e-4, "channel {c} = {}", out[c]);
        }
    }

    #[test]
    fn rec_resize_width_preserves_the_real_fixtures_observed_values() {
        // Real crop from m5c_recognition_spike.md box[0]: 588x34.
        // ratio_wh = 588/34 = 17.294..., width = ceil(48 * 17.294) = 831,
        // uncapped (unlike PaddleOCR's fixed-320 batching cap).
        let w = rec_resize_width(588, 34, 48, 4000);
        assert_eq!(w, 831);
    }

    #[test]
    fn rec_resize_width_is_clamped_by_the_safety_bound_not_a_fixed_320_cap() {
        let w = rec_resize_width(10000, 10, 48, 4000);
        assert_eq!(w, 4000, "must respect the generous safety cap, not silently exceed it");
    }

    #[test]
    fn rec_resize_width_never_returns_zero_for_a_degenerate_crop_height() {
        let w = rec_resize_width(100, 0, 48, 320);
        assert!(w >= 1);
    }

    #[test]
    fn rec_preprocess_produces_a_chw_array_sized_to_the_actual_resized_width() {
        let cropped = RgbImage::from_pixel(200, 20, image::Rgb([128, 128, 128]));
        let (chw, resized_w) = rec_preprocess(&cropped, 48, 4000);
        assert_eq!(chw.len(), 3 * 48 * resized_w as usize);
    }
}
