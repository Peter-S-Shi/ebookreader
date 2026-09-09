//! Library-wide text search (`ROADMAP.md` M4 Success Evidence: "global
//! search covers required sources", "CJK behavior meets accepted M0
//! architecture"). SQLite FTS5, fed through the `cjk_search` bigram
//! adapter so 2-character Chinese queries resolve correctly (which stock
//! `unicode61`/`trigram` tokenizers cannot -- M0-E's original finding).
//!
//! This module indexes/searches arbitrary (book_id, kind, content) text
//! entries -- it does not itself extract text from EPUB/PDF/TXT. Full
//! whole-book indexing needs a text-extraction pipeline (the renderers
//! already parse EPUB/PDF in the frontend; wiring their extracted text
//! back through an index command is a follow-up checkpoint), but Notes/
//! Excerpts/Annotations (M4's other named asset types) are naturally
//! backend-authored text and can be indexed directly through this API
//! once those asset types exist.

use rusqlite::Connection;
use serde::Serialize;

use crate::cjk_search::{build_phrase_query, expand_for_index};

/// Idempotent: creates the FTS5 virtual table if it doesn't already
/// exist. Kept separate from `store::run_migrations` since FTS5 virtual
/// tables don't roundtrip through the same `CREATE TABLE` DDL shape as
/// ordinary tables (no `IF NOT EXISTS`-driven `user_version` bump is
/// needed here -- FTS5 `CREATE VIRTUAL TABLE IF NOT EXISTS` handles its
/// own idempotency).
pub fn ensure_search_schema(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "CREATE VIRTUAL TABLE IF NOT EXISTS search_index
             USING fts5(book_id UNINDEXED, kind UNINDEXED, content, indexed_text)",
    )
}

/// Index (or re-index) one searchable text entry for a Book -- e.g. an
/// Excerpt's text, a Note's body, or (once a text-extraction pipeline
/// exists) a section of a Book's own content. `entry_id` distinguishes
/// multiple entries of the same `kind` for the same Book (e.g. multiple
/// Notes) so re-indexing one doesn't duplicate or orphan others.
pub fn index_text(conn: &Connection, book_id: &str, kind: &str, entry_id: &str, content: &str) -> rusqlite::Result<()> {
    // FTS5 has no natural primary key to upsert against; delete-then-
    // insert by (book_id, kind:entry_id) is the simplest correct re-index
    // -- deliberately *not* filtered by content too, so re-indexing the
    // same entry with *changed* content replaces it rather than leaving
    // the old text stuck alongside the new.
    let namespaced_kind = format!("{kind}:{entry_id}");
    conn.execute(
        "DELETE FROM search_index WHERE book_id = ?1 AND kind = ?2",
        (book_id, &namespaced_kind),
    )?;
    conn.execute(
        "INSERT INTO search_index (book_id, kind, content, indexed_text) VALUES (?1, ?2, ?3, ?4)",
        (book_id, &namespaced_kind, content, expand_for_index(content)),
    )?;
    Ok(())
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct SearchHit {
    pub book_id: String,
    /// `"<kind>:<entry_id>"` as passed to `index_text`.
    pub kind: String,
    pub content: String,
}

/// Library-wide search across all indexed entries.
pub fn search(conn: &Connection, query: &str) -> rusqlite::Result<Vec<SearchHit>> {
    search_scoped(conn, query, None)
}

/// In-book search: the same query, restricted to one Book's entries.
pub fn search_in_book(conn: &Connection, query: &str, book_id: &str) -> rusqlite::Result<Vec<SearchHit>> {
    search_scoped(conn, query, Some(book_id))
}

fn search_scoped(conn: &Connection, query: &str, book_id: Option<&str>) -> rusqlite::Result<Vec<SearchHit>> {
    let phrase = build_phrase_query(query);
    if phrase.is_empty() {
        return Ok(Vec::new());
    }

    let sql = match book_id {
        Some(_) => "SELECT book_id, kind, content FROM search_index WHERE indexed_text MATCH ?1 AND book_id = ?2",
        None => "SELECT book_id, kind, content FROM search_index WHERE indexed_text MATCH ?1",
    };
    let mut stmt = conn.prepare(sql)?;

    let map_row = |row: &rusqlite::Row| {
        Ok(SearchHit {
            book_id: row.get(0)?,
            kind: row.get(1)?,
            content: row.get(2)?,
        })
    };

    let rows = match book_id {
        Some(id) => stmt.query_map((phrase, id), map_row)?.collect::<Result<Vec<_>, _>>()?,
        None => stmt.query_map([phrase], map_row)?.collect::<Result<Vec<_>, _>>()?,
    };
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn conn_with_schema() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        ensure_search_schema(&conn).unwrap();
        conn
    }

    fn seed_corpus(conn: &Connection) {
        // The same corpus (docs/queries/assertions) as the validated M0
        // spike (tooling/m0-evidence/scripts/m0e_cjk_search_adapter.py),
        // ported to this production API.
        index_text(conn, "book-1", "excerpt", "1", "这是一段中文测试文本，用于验证搜索能力。").unwrap();
        index_text(conn, "book-2", "excerpt", "1", "EbookReader supports English search across the whole library.").unwrap();
        index_text(conn, "book-3", "excerpt", "1", "混合 mixed CJK/Latin text: 用户可以同时搜索中文和English关键词.").unwrap();
        index_text(conn, "book-4", "excerpt", "1", "无关内容：今天天气很好，适合读书。").unwrap();
    }

    #[test]
    fn two_character_chinese_query_finds_a_real_hit() {
        let conn = conn_with_schema();
        seed_corpus(&conn);
        let hits = search(&conn, "中文").unwrap();
        assert!(!hits.is_empty(), "'中文' must match at least one indexed document");
        assert!(hits.iter().any(|h| h.book_id == "book-1"));
    }

    #[test]
    fn two_character_chinese_query_absent_from_corpus_finds_nothing() {
        let conn = conn_with_schema();
        seed_corpus(&conn);
        assert_eq!(search(&conn, "英文").unwrap(), Vec::new());
    }

    #[test]
    fn english_query_finds_a_real_hit() {
        let conn = conn_with_schema();
        seed_corpus(&conn);
        let hits = search(&conn, "mixed").unwrap();
        assert!(hits.iter().any(|h| h.book_id == "book-3"));
    }

    #[test]
    fn mixed_cjk_latin_phrase_finds_a_real_hit() {
        let conn = conn_with_schema();
        seed_corpus(&conn);
        let hits = search(&conn, "中文和English").unwrap();
        assert!(hits.iter().any(|h| h.book_id == "book-3"));
    }

    #[test]
    fn search_in_book_restricts_to_the_named_book() {
        let conn = conn_with_schema();
        seed_corpus(&conn);
        index_text(&conn, "book-1", "excerpt", "2", "另一段提到天气的文字。").unwrap();

        let hits = search_in_book(&conn, "天气", "book-1").unwrap();
        assert_eq!(hits.len(), 1);
        assert!(hits.iter().all(|h| h.book_id == "book-1"));

        // The same query across the whole library also matches book-4.
        let library_hits = search(&conn, "天气").unwrap();
        assert!(library_hits.iter().any(|h| h.book_id == "book-4"));
        assert!(library_hits.len() >= 2);
    }

    #[test]
    fn re_indexing_the_same_entry_does_not_duplicate_it() {
        let conn = conn_with_schema();
        index_text(&conn, "book-1", "note", "1", "第一次索引").unwrap();
        index_text(&conn, "book-1", "note", "1", "第一次索引").unwrap();

        let count: i64 = conn.query_row("SELECT COUNT(*) FROM search_index", [], |r| r.get(0)).unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn re_indexing_the_same_entry_with_changed_content_replaces_it_not_duplicates() {
        let conn = conn_with_schema();
        index_text(&conn, "book-1", "note", "1", "旧内容").unwrap();
        index_text(&conn, "book-1", "note", "1", "新内容").unwrap();

        let count: i64 = conn.query_row("SELECT COUNT(*) FROM search_index", [], |r| r.get(0)).unwrap();
        assert_eq!(count, 1, "changed content for the same entry must replace, not accumulate");

        assert!(search(&conn, "新内容").unwrap().len() == 1);
        assert!(search(&conn, "旧内容").unwrap().is_empty(), "stale content must not still be searchable");
    }
}
