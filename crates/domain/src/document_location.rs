//! DocumentLocation: the unified cross-format reading-position envelope.
//!
//! Per `ARCHITECTURE.md` SS5 ("the highest-risk cross-format architecture
//! seam"): `{ book_file_id, format, progression_hint, primary_anchor,
//! fallback_anchors[], context_selector? }`. `book_id` stands in for
//! `book_file_id` here since a Book currently has exactly one active
//! BookFile binding (`ARCHITECTURE.md` SS "Book -> active BookFile
//! binding"). `primary_anchor` is an opaque, format-specific string (EPUB
//! CFI, PDF page+geometry, TXT char offset, ...); this module does not
//! interpret it, only persists it durably alongside its fallbacks.

use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DocumentLocation {
    pub book_id: String,
    pub format: String,
    pub progression_hint: f64,
    pub primary_anchor: String,
    pub fallback_anchors: Vec<String>,
    pub context_selector: Option<String>,
}

/// Save (insert or update) the current reading location for a Book.
///
/// A Book has exactly one current DocumentLocation, so a later save for
/// the same `book_id` replaces the earlier one rather than accumulating
/// history (reading history/Book Hours are a separate concern, M3 scope).
pub fn save_location(conn: &Connection, loc: &DocumentLocation) -> rusqlite::Result<()> {
    let fallback_json = serde_json::to_string(&loc.fallback_anchors)
        .map_err(|e| rusqlite::Error::InvalidPath(format!("{e}").into()))?;

    conn.execute(
        "INSERT INTO document_location
             (book_id, format, progression_hint, primary_anchor, fallback_anchors, context_selector)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(book_id) DO UPDATE SET
             format = excluded.format,
             progression_hint = excluded.progression_hint,
             primary_anchor = excluded.primary_anchor,
             fallback_anchors = excluded.fallback_anchors,
             context_selector = excluded.context_selector",
        (
            &loc.book_id,
            &loc.format,
            loc.progression_hint,
            &loc.primary_anchor,
            &fallback_json,
            &loc.context_selector,
        ),
    )?;

    Ok(())
}

/// Load the current DocumentLocation for a Book, if one has been saved.
pub fn load_location(conn: &Connection, book_id: &str) -> rusqlite::Result<Option<DocumentLocation>> {
    conn.query_row(
        "SELECT book_id, format, progression_hint, primary_anchor, fallback_anchors, context_selector
         FROM document_location WHERE book_id = ?1",
        [book_id],
        |row| {
            let fallback_json: String = row.get(4)?;
            let fallback_anchors: Vec<String> = serde_json::from_str(&fallback_json)
                .unwrap_or_default();
            Ok(DocumentLocation {
                book_id: row.get(0)?,
                format: row.get(1)?,
                progression_hint: row.get(2)?,
                primary_anchor: row.get(3)?,
                fallback_anchors,
                context_selector: row.get(5)?,
            })
        },
    )
    .optional()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::run_migrations;

    fn conn_with_book(book_id: &str) -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        conn.execute("INSERT INTO book (id, title) VALUES (?1, 'Test Book')", [book_id])
            .unwrap();
        conn
    }

    #[test]
    fn loading_an_unsaved_location_returns_none() {
        let conn = conn_with_book("book-1");
        assert_eq!(load_location(&conn, "book-1").unwrap(), None);
    }

    #[test]
    fn save_then_load_round_trips_exactly() {
        let conn = conn_with_book("book-1");
        let loc = DocumentLocation {
            book_id: "book-1".into(),
            format: "epub".into(),
            progression_hint: 0.42,
            primary_anchor: "epubcfi(/6/4!/4/2/1:0)".into(),
            fallback_anchors: vec!["dom-path:/body/section[2]".into(), "text-quote:the rabbit hole".into()],
            context_selector: Some("chapter 1, paragraph 3".into()),
        };

        save_location(&conn, &loc).unwrap();
        let loaded = load_location(&conn, "book-1").unwrap();

        assert_eq!(loaded, Some(loc));
    }

    #[test]
    fn saving_again_updates_in_place_rather_than_accumulating() {
        let conn = conn_with_book("book-1");
        save_location(
            &conn,
            &DocumentLocation {
                book_id: "book-1".into(),
                format: "epub".into(),
                progression_hint: 0.1,
                primary_anchor: "epubcfi(/6/4!/4/2/1:0)".into(),
                fallback_anchors: vec![],
                context_selector: None,
            },
        )
        .unwrap();

        save_location(
            &conn,
            &DocumentLocation {
                book_id: "book-1".into(),
                format: "epub".into(),
                progression_hint: 0.9,
                primary_anchor: "epubcfi(/6/12!/4/2/1:0)".into(),
                fallback_anchors: vec![],
                context_selector: None,
            },
        )
        .unwrap();

        let loaded = load_location(&conn, "book-1").unwrap().unwrap();
        assert_eq!(loaded.progression_hint, 0.9);
        assert_eq!(loaded.primary_anchor, "epubcfi(/6/12!/4/2/1:0)");

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM document_location WHERE book_id = 'book-1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1, "a second save must update the one row, not add another");
    }

    /// M3 Success Evidence: "location durability under layout/typography/
    /// reopen." Typography is entirely a frontend concern (`src/typography.ts`)
    /// with zero domain-layer representation, and ReadingProgress/Book
    /// Hours/Actual Reading Time are separate tables/modules with no code
    /// path that touches `document_location` -- this test is the
    /// domain-level proof of that isolation: saving a DocumentLocation,
    /// then performing unrelated progress/workload writes, must never
    /// perturb it. (The typography-specific EPUB reopen-stability case
    /// itself was already covered with real fixtures in M0's
    /// tooling/m0-evidence/ DocumentLocation spike; this closes the gap
    /// at the production persistence layer M3 owns.)
    #[test]
    fn location_survives_unrelated_progress_and_workload_writes_ss_m3_durability() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        conn.execute("INSERT INTO book (id, title) VALUES ('book-1', 'Test Book')", [])
            .unwrap();

        let location = DocumentLocation {
            book_id: "book-1".into(),
            format: "epub".into(),
            progression_hint: 0.42,
            primary_anchor: "epubcfi(/6/8!/4/2/1:0)".into(),
            fallback_anchors: vec!["text-quote:the rabbit hole".into()],
            context_selector: Some("chapter 1".into()),
        };
        save_location(&conn, &location).unwrap();

        // Unrelated writes: reading progress (SS8) and workload config (SS9).
        let mut progress = crate::completion::ReadingProgress::new();
        progress.advance_active_progress(75.0);
        crate::progress_store::save_progress(&conn, "book-1", &progress).unwrap();
        crate::book_hours::save_workload_config(
            &conn,
            "book-1",
            &crate::book_hours::WorkloadConfig { quantity: 1000.0, baseline_speed: 200.0, difficulty_coefficient: 1.0 },
        )
        .unwrap();

        let reloaded = load_location(&conn, "book-1").unwrap();
        assert_eq!(reloaded, Some(location), "DocumentLocation must be untouched by unrelated progress/workload writes");
    }
}
