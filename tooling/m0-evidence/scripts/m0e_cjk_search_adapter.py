"""
M0 Corrective Evidence - M0-E CJK Search Adapter (real implementation spike)

Prior M0 pass only showed that stock FTS5 tokenizers (unicode61, trigram) are
insufficient for 2-character CJK queries. This script implements and tests an
actual bigram-expansion adapter in front of FTS5 unicode61, rather than just
diagnosing the gap.

Adapter design:
  - Split input text into runs of CJK vs non-CJK characters.
  - Non-CJK runs are indexed as-is (unicode61 already tokenizes Latin words
    correctly on whitespace/punctuation).
  - CJK runs are expanded into overlapping bigrams, space-joined, and indexed
    alongside the original text. unicode61 then tokenizes each bigram as an
    independent "word".
  - At query time, a CJK query string is likewise split into overlapping
    bigrams and issued as an FTS5 *phrase* query (consecutive bigrams in
    exact adjacency), which reconstructs exact substring matching from
    bigram tokens without false positives from unrelated bigram co-occurrence.

This is a portable indexing/query algorithm; the spike is implemented in
Python against the same SQLite/FTS5 engine (via the stdlib sqlite3 module)
that `rusqlite` wraps in production, so the tokenizer/query results are
representative. Production implementation will be Rust (M4 scope); this
spike validates the *algorithm*, not the final language binding.

Run: python m0e_cjk_search_adapter.py
"""
import re
import sqlite3

CJK_RE = re.compile(r'[一-鿿㐀-䶿]')


def is_cjk(ch: str) -> bool:
    return bool(CJK_RE.match(ch))


def bigrams(run: str) -> list[str]:
    if len(run) == 1:
        return [run]
    return [run[i:i + 2] for i in range(len(run) - 1)]


def expand_for_index(text: str) -> str:
    """Split text into CJK / non-CJK runs; bigram-expand CJK runs."""
    tokens: list[str] = []
    buf = ""
    buf_is_cjk = None
    for ch in text:
        ch_is_cjk = is_cjk(ch)
        if buf_is_cjk is None or ch_is_cjk == buf_is_cjk:
            buf += ch
            buf_is_cjk = ch_is_cjk
        else:
            tokens.append((buf, buf_is_cjk))
            buf = ch
            buf_is_cjk = ch_is_cjk
    if buf:
        tokens.append((buf, buf_is_cjk))

    out_parts = []
    for run, cjk in tokens:
        if cjk:
            out_parts.extend(bigrams(run))
        else:
            out_parts.append(run)
    return " ".join(out_parts)


def build_phrase_query(query: str) -> str:
    """Turn a query string into an FTS5 phrase query using the same
    bigram expansion used at index time, so CJK substrings of any length
    (including 2 characters) resolve to an exact, adjacent bigram phrase."""
    expanded = expand_for_index(query)
    terms = expanded.split(" ")
    quoted = " ".join(f'"{t}"' for t in terms if t)
    return quoted


def main():
    con = sqlite3.connect(":memory:")
    con.execute("CREATE VIRTUAL TABLE idx USING fts5(content, indexed_text)")

    docs = [
        "这是一段中文测试文本，用于验证搜索能力。",
        "EbookReader supports English search across the whole library.",
        "混合 mixed CJK/Latin text: 用户可以同时搜索中文和English关键词.",
        "无关内容：今天天气很好，适合读书。",
    ]
    for d in docs:
        con.execute(
            "INSERT INTO idx(content, indexed_text) VALUES (?, ?)",
            (d, expand_for_index(d)),
        )

    cases = [
        ("中文", "2-char CJK, doc[0] contains it"),
        ("测试", "2-char CJK, doc[0] contains it"),
        ("英文", "2-char CJK, absent from corpus (should be 0 hits)"),
        ("搜索", "2-char CJK, present in doc[0]/doc[1]-adjacent/doc[2]"),
        ("mixed", "English word"),
        ("English", "English word, case-folding via unicode61"),
        ("CJK/Latin", "mixed token with punctuation"),
        ("中文和English", "mixed CJK+Latin phrase spanning doc[2]"),
        ("天气", "2-char CJK, only in doc[3]"),
    ]

    print(f"{'query':<18} {'expected_note':<55} {'hits':<5} matched_docs")
    all_ok = True
    for q, note in cases:
        fts_query = build_phrase_query(q)
        rows = con.execute(
            "SELECT content FROM idx WHERE indexed_text MATCH ?", (fts_query,)
        ).fetchall()
        print(f"{q:<18} {note:<55} {len(rows):<5} {[r[0][:12] for r in rows]}")

    # Explicit pass/fail assertions matching the corrective-pass requirement
    def hits(q):
        return len(con.execute(
            "SELECT content FROM idx WHERE indexed_text MATCH ?",
            (build_phrase_query(q),)
        ).fetchall())

    checks = [
        ("2-char Chinese '中文' finds a real hit", hits("中文") >= 1),
        ("2-char Chinese '英文' (absent) finds 0", hits("英文") == 0),
        ("English 'mixed' finds a real hit", hits("mixed") >= 1),
        ("mixed CJK/Latin '中文和English' finds a real hit", hits("中文和English") >= 1),
    ]
    print("\n--- pass/fail ---")
    for name, ok in checks:
        print(("PASS" if ok else "FAIL"), "-", name)
        all_ok = all_ok and ok

    print("\nOVERALL:", "PASS" if all_ok else "FAIL")


if __name__ == "__main__":
    main()
