//! Reading Assets: Annotation / Note / Excerpt (`PRODUCT_SPEC.md` SS4.7-4.9,
//! SS11 "Notes, Excerpts, and Annotations"). Each asset is a distinct,
//! user-authored, canonical record -- unlike the derived `search` index
//! (`ROADMAP.md` M4 Exit Gate: "Search/indexing remains derived;
//! user-authored reading assets remain canonical.").
//!
//! Orphan preservation (SS11: "If an anchor becomes unrecoverable:
//! user-authored content is preserved; it may become Orphaned/Detached;
//! location failure must not delete the user's thought.") is modeled as an
//! `orphaned` flag rather than deletion -- `mark_orphaned` never removes a
//! row, only marks it so a Reader can degrade the jump-back affordance
//! without losing the asset's text.

use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

use crate::document_location::DocumentLocation;

/// Per `PRODUCT_SPEC.md` SS4.7-4.9: three distinct asset types that must
/// remain distinguishable (`ROADMAP.md` M4 Success Evidence: "asset types
/// remain distinct").
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AssetKind {
    /// A visual/source-bound marking or highlight (SS4.7).
    Annotation,
    /// A user-intentionally collected source passage (SS4.8).
    Excerpt,
    /// User-authored text; may be source-anchored or free-standing (SS4.9).
    Note,
}

impl AssetKind {
    fn as_str(self) -> &'static str {
        match self {
            AssetKind::Annotation => "annotation",
            AssetKind::Excerpt => "excerpt",
            AssetKind::Note => "note",
        }
    }

    fn parse(s: &str) -> Option<Self> {
        match s {
            "annotation" => Some(AssetKind::Annotation),
            "excerpt" => Some(AssetKind::Excerpt),
            "note" => Some(AssetKind::Note),
            _ => None,
        }
    }

    fn display_label(self) -> &'static str {
        match self {
            AssetKind::Annotation => "Annotation",
            AssetKind::Excerpt => "Excerpt",
            AssetKind::Note => "Note",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ReadingAsset {
    pub id: String,
    pub book_id: String,
    pub kind: AssetKind,
    pub text: String,
    /// `None` for a free-standing Note (SS4.9: "may be source-anchored or
    /// free-standing"); `Some` for a source-bound Annotation/Excerpt/Note.
    pub anchor: Option<DocumentLocation>,
    pub orphaned: bool,
}

/// Create a new reading asset. Per SS4.7-4.9, the caller supplies a
/// pre-generated `id` (asset ids are not reused/recycled across kinds).
pub fn create_asset(conn: &Connection, asset: &ReadingAsset) -> rusqlite::Result<()> {
    let anchor_json = match &asset.anchor {
        Some(anchor) => Some(
            serde_json::to_string(anchor).map_err(|e| rusqlite::Error::InvalidPath(format!("{e}").into()))?,
        ),
        None => None,
    };

    conn.execute(
        "INSERT INTO reading_asset (id, book_id, kind, text, anchor_json, orphaned)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        (&asset.id, &asset.book_id, asset.kind.as_str(), &asset.text, &anchor_json, asset.orphaned as i64),
    )?;
    Ok(())
}

fn row_to_asset(row: &rusqlite::Row) -> rusqlite::Result<ReadingAsset> {
    let kind_str: String = row.get(2)?;
    let anchor_json: Option<String> = row.get(4)?;
    let orphaned: i64 = row.get(5)?;

    Ok(ReadingAsset {
        id: row.get(0)?,
        book_id: row.get(1)?,
        kind: AssetKind::parse(&kind_str).unwrap_or(AssetKind::Note),
        text: row.get(3)?,
        anchor: anchor_json.and_then(|json| serde_json::from_str(&json).ok()),
        orphaned: orphaned != 0,
    })
}

const SELECT_COLUMNS: &str = "id, book_id, kind, text, anchor_json, orphaned";

/// A single asset by id.
pub fn get_asset(conn: &Connection, asset_id: &str) -> rusqlite::Result<Option<ReadingAsset>> {
    conn.query_row(
        &format!("SELECT {SELECT_COLUMNS} FROM reading_asset WHERE id = ?1"),
        [asset_id],
        row_to_asset,
    )
    .optional()
}

/// A Book's Notebook: all its Annotation/Note/Excerpt assets, most recently
/// created first (SS11: "Notebook aggregates Annotation / Note / Excerpt").
pub fn list_assets_for_book(conn: &Connection, book_id: &str) -> rusqlite::Result<Vec<ReadingAsset>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {SELECT_COLUMNS} FROM reading_asset WHERE book_id = ?1 ORDER BY rowid DESC"
    ))?;
    let rows = stmt.query_map([book_id], row_to_asset)?.collect();
    rows
}

/// Global Notes: cross-book listing, optionally filtered by asset type
/// (SS11: "Global Notes: cross-book search; filter by asset type").
pub fn list_all_assets(conn: &Connection, kind: Option<AssetKind>) -> rusqlite::Result<Vec<ReadingAsset>> {
    match kind {
        Some(k) => {
            let mut stmt = conn.prepare(&format!(
                "SELECT {SELECT_COLUMNS} FROM reading_asset WHERE kind = ?1 ORDER BY rowid DESC"
            ))?;
            let rows = stmt.query_map([k.as_str()], row_to_asset)?.collect();
            rows
        }
        None => {
            let mut stmt =
                conn.prepare(&format!("SELECT {SELECT_COLUMNS} FROM reading_asset ORDER BY rowid DESC"))?;
            let rows = stmt.query_map([], row_to_asset)?.collect();
            rows
        }
    }
}

/// Mark an asset Orphaned/Detached because its anchor became unrecoverable
/// (e.g. a relink whose new file no longer contains the anchored location).
/// Per SS11, this must never delete the asset's user-authored text.
pub fn mark_orphaned(conn: &Connection, asset_id: &str) -> rusqlite::Result<()> {
    conn.execute("UPDATE reading_asset SET orphaned = 1 WHERE id = ?1", [asset_id])?;
    Ok(())
}

/// Renders a Book's Notebook (`assets`, already filtered to that Book) as
/// reader-friendly Markdown (`PRODUCT_SPEC.md` SS11: "Notebook export
/// should support reader-friendly Markdown at minimum ... source
/// Book/location included as designed"). Pure/no I/O so it can be tested
/// directly; the caller owns writing the result to disk.
pub fn export_notebook_markdown(book_title: &str, assets: &[ReadingAsset]) -> String {
    let mut out = format!("# Notebook — {book_title}\n");
    if assets.is_empty() {
        out.push_str("\n_No Annotations, Excerpts, or Notes yet._\n");
        return out;
    }
    for asset in assets {
        out.push_str(&format!("\n## {}\n\n{}\n", asset.kind.display_label(), asset.text));
        if let Some(anchor) = &asset.anchor {
            out.push_str(&format!("\n_Location: {}_\n", anchor.primary_anchor));
        }
        if asset.orphaned {
            out.push_str("\n_(Orphaned — original location no longer resolvable)_\n");
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::run_migrations;

    fn conn_with_book(book_id: &str) -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        conn.execute("INSERT INTO book (id, title) VALUES (?1, 'Test Book')", [book_id]).unwrap();
        conn
    }

    fn sample_anchor(book_id: &str) -> DocumentLocation {
        DocumentLocation {
            book_id: book_id.into(),
            format: "epub".into(),
            progression_hint: 0.3,
            primary_anchor: "epubcfi(/6/4!/4/2/1:0)".into(),
            fallback_anchors: vec!["text-quote:the rabbit hole".into()],
            context_selector: Some("chapter 1".into()),
        }
    }

    #[test]
    fn create_and_get_round_trips_a_source_anchored_note() {
        let conn = conn_with_book("book-1");
        let asset = ReadingAsset {
            id: "asset-1".into(),
            book_id: "book-1".into(),
            kind: AssetKind::Note,
            text: "Interesting turn of phrase here.".into(),
            anchor: Some(sample_anchor("book-1")),
            orphaned: false,
        };
        create_asset(&conn, &asset).unwrap();

        let loaded = get_asset(&conn, "asset-1").unwrap();
        assert_eq!(loaded, Some(asset));
    }

    #[test]
    fn a_free_standing_note_has_no_anchor() {
        let conn = conn_with_book("book-1");
        let asset = ReadingAsset {
            id: "asset-1".into(),
            book_id: "book-1".into(),
            kind: AssetKind::Note,
            text: "A thought about the book overall, not tied to one page.".into(),
            anchor: None,
            orphaned: false,
        };
        create_asset(&conn, &asset).unwrap();

        let loaded = get_asset(&conn, "asset-1").unwrap().unwrap();
        assert_eq!(loaded.anchor, None);
    }

    #[test]
    fn asset_kinds_remain_distinct() {
        let conn = conn_with_book("book-1");
        create_asset(
            &conn,
            &ReadingAsset { id: "a1".into(), book_id: "book-1".into(), kind: AssetKind::Annotation, text: "highlighted text".into(), anchor: Some(sample_anchor("book-1")), orphaned: false },
        )
        .unwrap();
        create_asset(
            &conn,
            &ReadingAsset { id: "a2".into(), book_id: "book-1".into(), kind: AssetKind::Excerpt, text: "a collected passage".into(), anchor: Some(sample_anchor("book-1")), orphaned: false },
        )
        .unwrap();
        create_asset(
            &conn,
            &ReadingAsset { id: "a3".into(), book_id: "book-1".into(), kind: AssetKind::Note, text: "my thought".into(), anchor: None, orphaned: false },
        )
        .unwrap();

        let all = list_assets_for_book(&conn, "book-1").unwrap();
        assert_eq!(all.len(), 3);
        assert_eq!(get_asset(&conn, "a1").unwrap().unwrap().kind, AssetKind::Annotation);
        assert_eq!(get_asset(&conn, "a2").unwrap().unwrap().kind, AssetKind::Excerpt);
        assert_eq!(get_asset(&conn, "a3").unwrap().unwrap().kind, AssetKind::Note);
    }

    #[test]
    fn list_assets_for_book_orders_most_recently_created_first() {
        let conn = conn_with_book("book-1");
        create_asset(&conn, &ReadingAsset { id: "a1".into(), book_id: "book-1".into(), kind: AssetKind::Note, text: "first".into(), anchor: None, orphaned: false }).unwrap();
        create_asset(&conn, &ReadingAsset { id: "a2".into(), book_id: "book-1".into(), kind: AssetKind::Note, text: "second".into(), anchor: None, orphaned: false }).unwrap();

        let assets = list_assets_for_book(&conn, "book-1").unwrap();
        assert_eq!(assets.iter().map(|a| a.id.as_str()).collect::<Vec<_>>(), vec!["a2", "a1"]);
    }

    #[test]
    fn list_assets_for_book_does_not_include_another_books_assets() {
        let conn = conn_with_book("book-1");
        conn.execute("INSERT INTO book (id, title) VALUES ('book-2', 'Other Book')", []).unwrap();
        create_asset(&conn, &ReadingAsset { id: "a1".into(), book_id: "book-1".into(), kind: AssetKind::Note, text: "mine".into(), anchor: None, orphaned: false }).unwrap();
        create_asset(&conn, &ReadingAsset { id: "a2".into(), book_id: "book-2".into(), kind: AssetKind::Note, text: "not mine".into(), anchor: None, orphaned: false }).unwrap();

        let assets = list_assets_for_book(&conn, "book-1").unwrap();
        assert_eq!(assets.len(), 1);
        assert_eq!(assets[0].id, "a1");
    }

    #[test]
    fn global_notes_lists_across_books() {
        let conn = conn_with_book("book-1");
        conn.execute("INSERT INTO book (id, title) VALUES ('book-2', 'Other Book')", []).unwrap();
        create_asset(&conn, &ReadingAsset { id: "a1".into(), book_id: "book-1".into(), kind: AssetKind::Note, text: "in book 1".into(), anchor: None, orphaned: false }).unwrap();
        create_asset(&conn, &ReadingAsset { id: "a2".into(), book_id: "book-2".into(), kind: AssetKind::Excerpt, text: "in book 2".into(), anchor: None, orphaned: false }).unwrap();

        let all = list_all_assets(&conn, None).unwrap();
        assert_eq!(all.len(), 2);
    }

    #[test]
    fn global_notes_filters_by_asset_type() {
        let conn = conn_with_book("book-1");
        create_asset(&conn, &ReadingAsset { id: "a1".into(), book_id: "book-1".into(), kind: AssetKind::Note, text: "a note".into(), anchor: None, orphaned: false }).unwrap();
        create_asset(&conn, &ReadingAsset { id: "a2".into(), book_id: "book-1".into(), kind: AssetKind::Excerpt, text: "an excerpt".into(), anchor: None, orphaned: false }).unwrap();

        let notes = list_all_assets(&conn, Some(AssetKind::Note)).unwrap();
        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].kind, AssetKind::Note);
    }

    /// SS11: "If an anchor becomes unrecoverable: user-authored content is
    /// preserved; it may become Orphaned/Detached; location failure must
    /// not delete the user's thought."
    #[test]
    fn marking_orphaned_preserves_the_text_and_does_not_delete_the_asset() {
        let conn = conn_with_book("book-1");
        let asset = ReadingAsset {
            id: "a1".into(),
            book_id: "book-1".into(),
            kind: AssetKind::Annotation,
            text: "a highlight whose source location later became unrecoverable".into(),
            anchor: Some(sample_anchor("book-1")),
            orphaned: false,
        };
        create_asset(&conn, &asset).unwrap();

        mark_orphaned(&conn, "a1").unwrap();

        let loaded = get_asset(&conn, "a1").unwrap().unwrap();
        assert!(loaded.orphaned);
        assert_eq!(loaded.text, asset.text, "orphaning must never touch the user's authored text");
        assert_eq!(loaded.anchor, asset.anchor, "the stale anchor itself is preserved, not stripped");
    }

    #[test]
    fn getting_an_unknown_asset_returns_none() {
        let conn = conn_with_book("book-1");
        assert_eq!(get_asset(&conn, "does-not-exist").unwrap(), None);
    }

    #[test]
    fn markdown_export_of_an_empty_notebook_says_so_rather_than_rendering_nothing() {
        let markdown = export_notebook_markdown("Empty Book", &[]);
        assert!(markdown.contains("# Notebook — Empty Book"));
        assert!(markdown.contains("No Annotations, Excerpts, or Notes yet"));
    }

    #[test]
    fn markdown_export_includes_kind_text_and_source_location() {
        let asset = ReadingAsset {
            id: "a1".into(),
            book_id: "book-1".into(),
            kind: AssetKind::Excerpt,
            text: "a collected passage worth remembering".into(),
            anchor: Some(sample_anchor("book-1")),
            orphaned: false,
        };

        let markdown = export_notebook_markdown("Alice in Wonderland", &[asset]);

        assert!(markdown.contains("# Notebook — Alice in Wonderland"));
        assert!(markdown.contains("## Excerpt"));
        assert!(markdown.contains("a collected passage worth remembering"));
        assert!(
            markdown.contains("epubcfi(/6/4!/4/2/1:0)"),
            "PRODUCT_SPEC.md SS11: export must include the source location, not just the text"
        );
    }

    #[test]
    fn markdown_export_marks_orphaned_assets_and_omits_location_for_free_standing_notes() {
        let orphaned = ReadingAsset {
            id: "a1".into(),
            book_id: "book-1".into(),
            kind: AssetKind::Annotation,
            text: "a highlight whose location is gone".into(),
            anchor: Some(sample_anchor("book-1")),
            orphaned: true,
        };
        let free_standing = ReadingAsset {
            id: "a2".into(),
            book_id: "book-1".into(),
            kind: AssetKind::Note,
            text: "a free-standing thought".into(),
            anchor: None,
            orphaned: false,
        };

        let markdown = export_notebook_markdown("A Book", &[orphaned, free_standing]);

        assert!(markdown.contains("Orphaned"));
        assert!(markdown.contains("a free-standing thought"));
        let free_standing_section = markdown.split("## Note").nth(1).unwrap();
        assert!(
            !free_standing_section.contains("_Location:"),
            "a free-standing Note has no source location to report"
        );
    }
}
