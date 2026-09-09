//! CTC greedy decoding for PP-OCRv6 recognition output.
//!
//! Pure decode logic -- no ONNX/model dependency, so the tests here run in
//! CI without any model asset. The character dictionary is supplied by the
//! caller at runtime (loaded from the reused `PP-OCRv6_rec_small.onnx`'s
//! embedded `character` ONNX metadata key, confirmed present via a direct
//! `onnxruntime.InferenceSession.get_modelmeta()` check: 18,708 unique
//! newline-separated characters, matching the model's 18,710-class output
//! exactly under PaddleOCR's `['blank'] + dict_chars + [' ']` convention --
//! see `tooling/m5-evidence/README.md`). Not hardcoded here since the
//! dictionary is itself a runtime asset, like the model file.

/// Greedy CTC decode: for each timestep, take the argmax class; collapse
/// consecutive repeated indices; drop blank (index 0) predictions; map each
/// remaining index to a character via `dict[index - 1]` (index 0 is the CTC
/// blank, so dictionary entries start at index 1 -- PaddleOCR's
/// `['blank'] + dict_chars` convention).
///
/// `logits` is a row-major `[seq_len, num_classes]` tensor of **already
/// softmax-activated probabilities**, not raw logits: confirmed empirically
/// (`PP-OCRv6_rec_small.onnx`'s `fetch_name_0` output rows sum to ~1.0 with
/// all values in [0,1]) -- the same "already activated" pattern as the
/// detector's sigmoid output (see
/// `tooling/m5-evidence/m5a_det_medium_rust_ort_spike.md` Finding 4). An
/// earlier version of this function applied a redundant softmax on top,
/// which is mathematically well-behaved (never panics, argmax is invariant
/// under a monotonic transform, so decoded *text* was never wrong) but
/// silently produced near-zero confidence scores by re-normalizing an
/// already-normalized distribution over 18,710 classes. Confidence is now
/// just the selected class's probability directly.
///
/// Returns the decoded text and its average per-character confidence
/// (computed only over accepted, non-blank characters).
pub fn ctc_greedy_decode(
    logits: &[f32],
    seq_len: usize,
    num_classes: usize,
    dict: &[String],
) -> (String, f32) {
    assert_eq!(logits.len(), seq_len * num_classes, "logits size must equal seq_len * num_classes");

    let mut text = String::new();
    let mut confidences: Vec<f32> = Vec::new();
    let mut last_index: Option<usize> = None;

    for t in 0..seq_len {
        let row = &logits[t * num_classes..(t + 1) * num_classes];
        let (best_idx, best_val) = row
            .iter()
            .enumerate()
            .fold((0usize, f32::NEG_INFINITY), |acc, (i, &v)| if v > acc.1 { (i, v) } else { acc });

        if best_idx == 0 {
            last_index = Some(0);
            continue;
        }
        if last_index == Some(best_idx) {
            continue;
        }
        last_index = Some(best_idx);

        if let Some(ch) = dict.get(best_idx - 1) {
            text.push_str(ch);
            confidences.push(best_val);
        }
    }

    let avg_conf = if confidences.is_empty() {
        0.0
    } else {
        confidences.iter().sum::<f32>() / confidences.len() as f32
    };
    (text, avg_conf)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dict3() -> Vec<String> {
        vec!["a".to_string(), "b".to_string(), "c".to_string()]
    }

    // 4 classes: [blank, a, b, c]. One row per timestep -- already
    // softmax-shaped (sums to 1.0), matching the real model's output.
    fn row(num_classes: usize, hot_index: usize) -> Vec<f32> {
        let mut r = vec![0.0f32; num_classes];
        r[hot_index] = 0.97;
        let remainder = 0.03 / (num_classes - 1) as f32;
        for (i, v) in r.iter_mut().enumerate() {
            if i != hot_index {
                *v = remainder;
            }
        }
        r
    }

    fn build_logits(num_classes: usize, indices: &[usize]) -> Vec<f32> {
        indices.iter().flat_map(|&i| row(num_classes, i)).collect()
    }

    #[test]
    fn decodes_a_simple_sequence_with_repeats_and_blanks_collapsed() {
        // a a b c blank -> "abc" (repeat 'a' collapses to one)
        let indices = [1, 1, 2, 3, 0];
        let logits = build_logits(4, &indices);
        let (text, conf) = ctc_greedy_decode(&logits, indices.len(), 4, &dict3());
        assert_eq!(text, "abc");
        assert!(conf > 0.9, "confidence should be high for unambiguous hot rows, got {conf}");
    }

    #[test]
    fn a_blank_between_repeats_prevents_collapsing() {
        // a blank a -> "aa" (the blank separator means these are two distinct characters)
        let indices = [1, 0, 1];
        let logits = build_logits(4, &indices);
        let (text, _conf) = ctc_greedy_decode(&logits, indices.len(), 4, &dict3());
        assert_eq!(text, "aa");
    }

    #[test]
    fn all_blank_decodes_to_empty_string() {
        let indices = [0, 0, 0, 0];
        let logits = build_logits(4, &indices);
        let (text, conf) = ctc_greedy_decode(&logits, indices.len(), 4, &dict3());
        assert_eq!(text, "");
        assert_eq!(conf, 0.0);
    }

    #[test]
    fn consecutive_repeats_without_a_blank_separator_collapse_to_one_character() {
        let indices = [2, 2, 2, 2];
        let logits = build_logits(4, &indices);
        let (text, _conf) = ctc_greedy_decode(&logits, indices.len(), 4, &dict3());
        assert_eq!(text, "b");
    }

    #[test]
    fn an_index_beyond_the_dictionary_is_silently_skipped_rather_than_panicking() {
        // Simulates the append-space-character convention: index num_classes-1
        // maps one past the caller's dict slice if the caller only passed the
        // core dictionary without the trailing space -- must not panic.
        let indices = [3];
        let logits = build_logits(4, &indices);
        let short_dict = vec!["a".to_string()]; // only covers index 1
        let (text, _conf) = ctc_greedy_decode(&logits, indices.len(), 4, &short_dict);
        assert_eq!(text, "");
    }
}
