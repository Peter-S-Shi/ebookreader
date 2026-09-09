//! CJK search adapter (`ARCHITECTURE.md`'s Architecture Amendment: SQLite
//! FTS5 needs a segmentation/bigram adapter in front of it). Production
//! Rust port of the algorithm M0's corrective-pass spike validated
//! (`tooling/m0-evidence/scripts/m0e_cjk_search_adapter.py`, same
//! docs/cases/assertions) -- this module is the port; the FTS5
//! integration itself lives in `search.rs`.
//!
//! Design: split text into runs of CJK vs non-CJK characters. Non-CJK
//! runs are indexed as-is (FTS5's `unicode61` tokenizer already handles
//! Latin words on whitespace/punctuation). CJK runs are expanded into
//! overlapping bigrams, space-joined, and indexed alongside the rest. At
//! query time, a query string is expanded the same way and issued as an
//! FTS5 *phrase* query (consecutive bigrams in exact adjacency), which
//! reconstructs exact substring matching from bigram tokens without false
//! positives from unrelated bigram co-occurrence -- this is what makes
//! 2-character CJK queries work, where stock `trigram` cannot.

/// CJK Unified Ideographs + Extension A, matching the validated spike's
/// character-class boundary exactly.
fn is_cjk(ch: char) -> bool {
    matches!(ch, '\u{4E00}'..='\u{9FFF}' | '\u{3400}'..='\u{4DBF}')
}

fn bigrams(run: &str) -> Vec<String> {
    let chars: Vec<char> = run.chars().collect();
    if chars.len() == 1 {
        return vec![chars[0].to_string()];
    }
    chars.windows(2).map(|pair| pair.iter().collect()).collect()
}

/// Split `text` into CJK / non-CJK runs; bigram-expand the CJK runs.
/// Returns the space-joined token string to store as FTS5's indexed
/// column (alongside the original, human-readable text in another
/// column).
pub fn expand_for_index(text: &str) -> String {
    let mut runs: Vec<(String, bool)> = Vec::new();
    let mut buf = String::new();
    let mut buf_is_cjk: Option<bool> = None;

    for ch in text.chars() {
        let ch_is_cjk = is_cjk(ch);
        match buf_is_cjk {
            Some(current) if current == ch_is_cjk => buf.push(ch),
            None => {
                buf.push(ch);
                buf_is_cjk = Some(ch_is_cjk);
            }
            Some(_) => {
                runs.push((std::mem::take(&mut buf), buf_is_cjk.unwrap()));
                buf.push(ch);
                buf_is_cjk = Some(ch_is_cjk);
            }
        }
    }
    if !buf.is_empty() {
        runs.push((buf, buf_is_cjk.unwrap_or(false)));
    }

    let mut out_parts: Vec<String> = Vec::new();
    for (run, cjk) in runs {
        if cjk {
            out_parts.extend(bigrams(&run));
        } else {
            out_parts.push(run);
        }
    }
    out_parts.join(" ")
}

/// Build an FTS5 phrase query from a user query string, using the same
/// bigram expansion used at index time, so CJK substrings of any length
/// (including 2 characters) resolve to an exact, adjacent bigram phrase.
pub fn build_phrase_query(query: &str) -> String {
    expand_for_index(query)
        .split(' ')
        .filter(|t| !t.is_empty())
        .map(|t| format!("\"{t}\""))
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn latin_text_is_indexed_unchanged() {
        assert_eq!(expand_for_index("mixed CJK/Latin"), "mixed CJK/Latin");
    }

    #[test]
    fn a_cjk_run_is_expanded_into_overlapping_bigrams() {
        // "中文" (2 chars) -> single bigram "中文"
        assert_eq!(expand_for_index("中文"), "中文");
        // "中文测试" (4 chars) -> 3 overlapping bigrams
        assert_eq!(expand_for_index("中文测试"), "中文 文测 测试");
    }

    #[test]
    fn a_single_cjk_character_run_is_its_own_token() {
        assert_eq!(expand_for_index("中"), "中");
    }

    #[test]
    fn mixed_cjk_and_latin_runs_are_each_handled_by_their_own_rule() {
        assert_eq!(expand_for_index("中文和English"), "中文 文和 English");
    }

    #[test]
    fn build_phrase_query_quotes_each_expanded_token() {
        assert_eq!(build_phrase_query("中文"), "\"中文\"");
        assert_eq!(build_phrase_query("测试文本"), "\"测试\" \"试文\" \"文本\"");
    }

    #[test]
    fn build_phrase_query_handles_a_plain_english_word() {
        assert_eq!(build_phrase_query("mixed"), "\"mixed\"");
    }
}
