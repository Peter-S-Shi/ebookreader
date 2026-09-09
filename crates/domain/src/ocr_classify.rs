//! Text-orientation (0° vs 180°) classification decision for
//! `ch_ppocr_mobile_v2.0_cls_mobile.onnx`.
//!
//! Pure decode logic -- no ONNX/model dependency, runs in CI. The model's
//! 2-class output (`[p_0deg, p_180deg]`) is already softmax-activated
//! (confirmed empirically: random-input probe sums to 1.0, same pattern as
//! the detector's sigmoid and recognizer's softmax outputs -- see
//! `tooling/m5-evidence/`), so no activation is applied here.

/// PaddleOCR's own convention: only trust a 180° flip when the model is
/// confident (probability >= 0.9); otherwise leave the crop as detected
/// rather than flipping on a weak signal.
pub const DEFAULT_CLS_THRESH: f32 = 0.9;

/// Given the classifier's raw `[p_0deg, p_180deg]` output, decides whether
/// the crop should be rotated 180° before recognition.
pub fn should_rotate_180(probs: [f32; 2], thresh: f32) -> bool {
    probs[1] > probs[0] && probs[1] >= thresh
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_confident_0_degree_prediction_does_not_rotate() {
        assert!(!should_rotate_180([0.9, 0.1], DEFAULT_CLS_THRESH));
    }

    #[test]
    fn a_confident_180_degree_prediction_rotates() {
        assert!(should_rotate_180([0.05, 0.95], DEFAULT_CLS_THRESH));
    }

    #[test]
    fn a_180_degree_leaning_but_unconfident_prediction_does_not_rotate() {
        // argmax favors 180 deg (0.55 > 0.45) but below the confidence
        // threshold -- PaddleOCR's own convention is to not act on this.
        assert!(!should_rotate_180([0.45, 0.55], DEFAULT_CLS_THRESH));
    }

    #[test]
    fn an_exact_threshold_probability_does_rotate() {
        assert!(should_rotate_180([0.1, 0.9], 0.9));
    }
}
