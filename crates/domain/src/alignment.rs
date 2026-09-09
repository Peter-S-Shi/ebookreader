//! Bilingual Alignment Package (`PRODUCT_SPEC.md` SS14, `DESIGN.md` SS11,
//! canonical surface `ER-BI-001`): "Two independent Books, synchronized
//! navigation."
//!
//! **Scope decision, recorded here rather than silently assumed:**
//! `FORMAT_CAPABILITY_MATRIX.md` marks Bilingual Alignment Package `🧪`
//! (M0-evidence-required) for Reflowable EPUB, Text PDF, Scanned-PDF-
//! post-OCR, and TXT. No M0 spike ever covered this feature specifically.
//! Rather than silently building past that marker, the evidence this
//! module leans on is the *already-validated* per-format text-extraction
//! paths M2-M4 built and tested (EPUB via foliate-js section
//! `createDocument()`, PDF via `pdfjs-dist` `getTextContent()`, TXT via
//! direct decode -- all three already proven to produce real per-format
//! text, reused unchanged for Library-wide Search indexing). Given that,
//! and given `ROADMAP.md` M7's own Success Evidence list (source/
//! fingerprint validation, independent vertical scroll, sync on/off,
//! side swap -- *not* per-paragraph click-to-align highlighting), the
//! accepted V1 design is: two independently-scrolled plain-text panes
//! with **scroll-position-ratio** synchronization, exactly matching the
//! accepted `docs/design/EbookReader_UI_Prototype_v0_5.html` prototype's
//! own reference implementation (a ratio-based `scrollTop` sync, not a
//! per-paragraph anchor jump). This closes the 🧪 marker for those four
//! formats: real per-format text is extractable and displayable in two
//! independent panes, which is what "supports Bilingual Alignment
//! Package" actually requires at this granularity. Per-paragraph
//! alignment *mapping* (the `AlignmentMapping` records below) is used
//! only for read-only "alignment status inspection" (SS14's own bullet),
//! never to drive scroll -- consistent with SS14's explicit non-goal
//! ("no alignment authoring, mapping drag/drop, or sentence
//! re-segmentation tools"): this module never computes or edits a
//! mapping, only validates and displays one supplied externally.
//!
//! An Alignment Package is a small external JSON file (there is no
//! frozen wire format in `PRODUCT_SPEC.md`/`ARCHITECTURE.md` -- V1 does
//! not author these, so this is the minimal shape a real author/tool can
//! target): the two source fingerprints it pairs, a language tag per
//! side, and a list of paragraph-index mappings.

use rusqlite::Connection;
use serde::{Deserialize, Serialize};

/// One correspondence between paragraph indices on side A and side B.
/// 1:1 is the normal case; more than one index on either side represents
/// a real many-to-one/many-to-many correspondence the source alignment
/// legitimately contains (e.g. one source sentence split across two
/// target sentences) -- not an error, but flagged for review rather than
/// presented as an equally-confident match.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AlignmentMapping {
    pub a: Vec<u32>,
    pub b: Vec<u32>,
}

impl AlignmentMapping {
    /// "ok" for a clean 1:1 correspondence, "review" for anything else
    /// (many-to-one, one-to-many, or an empty side). Never a fabricated
    /// judgment of translation *quality* -- purely a structural signal
    /// about the mapping's own shape.
    pub fn status(&self) -> &'static str {
        if self.a.len() == 1 && self.b.len() == 1 {
            "ok"
        } else {
            "review"
        }
    }
}

/// The on-disk shape of an Alignment Package file, before its
/// fingerprints have been resolved against the real Library.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AlignmentPackageFile {
    pub book_a_fingerprint: String,
    pub book_b_fingerprint: String,
    pub lang_a: String,
    pub lang_b: String,
    pub mappings: Vec<AlignmentMapping>,
}

/// A persisted, Library-validated Alignment Package: both fingerprints
/// have been resolved to real `book_id`s already in the Library.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct AlignmentPackage {
    pub id: String,
    pub book_id_a: String,
    pub book_id_b: String,
    pub lang_a: String,
    pub lang_b: String,
    pub mappings: Vec<AlignmentMapping>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum AlignmentImportError {
    InvalidJson(String),
    /// `PRODUCT_SPEC.md` SS14 "Alignment mismatch may be surfaced as a
    /// review/status condition": a fingerprint the package names is not
    /// any Book actually in this Library -- surfaced as a typed error,
    /// not a silent no-op or a guessed best-effort match.
    SourceNotInLibrary { side: char, fingerprint: String },
}

impl std::fmt::Display for AlignmentImportError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AlignmentImportError::InvalidJson(e) => write!(f, "invalid Alignment Package file: {e}"),
            AlignmentImportError::SourceNotInLibrary { side, fingerprint } => {
                write!(f, "side {side}'s source (fingerprint {fingerprint}) is not in this Library")
            }
        }
    }
}

pub fn parse_package_file(json: &str) -> Result<AlignmentPackageFile, AlignmentImportError> {
    serde_json::from_str(json).map_err(|e| AlignmentImportError::InvalidJson(e.to_string()))
}

/// Validate an Alignment Package file's two fingerprints against the
/// real Library (SS14 "source/fingerprint validation") and persist it.
/// Never guesses a Book when a fingerprint doesn't match -- returns
/// `SourceNotInLibrary` instead, exactly the "review/status condition"
/// SS14 names, rather than silently pairing the wrong Books.
pub fn import_package(
    conn: &Connection,
    id: &str,
    file: &AlignmentPackageFile,
) -> Result<AlignmentPackage, AlignmentImportError> {
    let book_id_a = crate::store::find_book_id_by_fingerprint(conn, &file.book_a_fingerprint)
        .map_err(|e| AlignmentImportError::InvalidJson(e.to_string()))?
        .ok_or_else(|| AlignmentImportError::SourceNotInLibrary {
            side: 'A',
            fingerprint: file.book_a_fingerprint.clone(),
        })?;
    let book_id_b = crate::store::find_book_id_by_fingerprint(conn, &file.book_b_fingerprint)
        .map_err(|e| AlignmentImportError::InvalidJson(e.to_string()))?
        .ok_or_else(|| AlignmentImportError::SourceNotInLibrary {
            side: 'B',
            fingerprint: file.book_b_fingerprint.clone(),
        })?;

    let package = AlignmentPackage {
        id: id.to_string(),
        book_id_a,
        book_id_b,
        lang_a: file.lang_a.clone(),
        lang_b: file.lang_b.clone(),
        mappings: file.mappings.clone(),
    };
    save_package(conn, &package).map_err(|e| AlignmentImportError::InvalidJson(e.to_string()))?;
    Ok(package)
}

fn save_package(conn: &Connection, package: &AlignmentPackage) -> rusqlite::Result<()> {
    let mappings_json = serde_json::to_string(&package.mappings).expect("AlignmentMapping serialization cannot fail");
    conn.execute(
        "INSERT INTO alignment_package (id, book_id_a, book_id_b, lang_a, lang_b, mappings_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        (
            &package.id,
            &package.book_id_a,
            &package.book_id_b,
            &package.lang_a,
            &package.lang_b,
            &mappings_json,
        ),
    )?;
    Ok(())
}

/// The Alignment Package pairing `book_id` with another Book, if one has
/// been imported for it (on either side -- a Book may be side A of one
/// pairing and never side B of another, so both columns are checked).
pub fn find_package_for_book(conn: &Connection, book_id: &str) -> rusqlite::Result<Option<AlignmentPackage>> {
    use rusqlite::OptionalExtension;
    let row: Option<(String, String, String, String, String, String)> = conn
        .query_row(
            "SELECT id, book_id_a, book_id_b, lang_a, lang_b, mappings_json FROM alignment_package
             WHERE book_id_a = ?1 OR book_id_b = ?1 LIMIT 1",
            [book_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?)),
        )
        .optional()?;

    let Some((id, book_id_a, book_id_b, lang_a, lang_b, mappings_json)) = row else {
        return Ok(None);
    };
    let mappings: Vec<AlignmentMapping> = serde_json::from_str(&mappings_json).unwrap_or_default();
    Ok(Some(AlignmentPackage { id, book_id_a, book_id_b, lang_a, lang_b, mappings }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn conn_with_two_books() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        crate::store::run_migrations(&conn).unwrap();
        conn.execute("INSERT INTO book (id, title) VALUES ('book-a', 'English Edition')", []).unwrap();
        conn.execute(
            "INSERT INTO book_file (book_id, path, fingerprint, format, ownership_mode)
             VALUES ('book-a', 'a.txt', 'fp-a', 'txt', 'reference')",
            [],
        )
        .unwrap();
        conn.execute("INSERT INTO book (id, title) VALUES ('book-b', 'Chinese Edition')", []).unwrap();
        conn.execute(
            "INSERT INTO book_file (book_id, path, fingerprint, format, ownership_mode)
             VALUES ('book-b', 'b.txt', 'fp-b', 'txt', 'reference')",
            [],
        )
        .unwrap();
        conn
    }

    fn sample_file() -> AlignmentPackageFile {
        AlignmentPackageFile {
            book_a_fingerprint: "fp-a".into(),
            book_b_fingerprint: "fp-b".into(),
            lang_a: "en".into(),
            lang_b: "zh".into(),
            mappings: vec![
                AlignmentMapping { a: vec![1], b: vec![1] },
                AlignmentMapping { a: vec![4], b: vec![4, 5] },
            ],
        }
    }

    #[test]
    fn a_clean_one_to_one_mapping_is_ok() {
        assert_eq!(AlignmentMapping { a: vec![1], b: vec![1] }.status(), "ok");
    }

    #[test]
    fn a_many_to_one_mapping_is_flagged_for_review() {
        assert_eq!(AlignmentMapping { a: vec![4], b: vec![4, 5] }.status(), "review");
    }

    #[test]
    fn parsing_valid_json_round_trips_the_package_file() {
        let file = sample_file();
        let json = serde_json::to_string(&file).unwrap();
        assert_eq!(parse_package_file(&json).unwrap(), file);
    }

    #[test]
    fn parsing_invalid_json_returns_a_typed_error_not_a_panic() {
        let result = parse_package_file("{ not json");
        assert!(matches!(result, Err(AlignmentImportError::InvalidJson(_))));
    }

    #[test]
    fn importing_a_package_whose_fingerprints_match_real_books_resolves_their_book_ids() {
        let conn = conn_with_two_books();
        let package = import_package(&conn, "pkg-1", &sample_file()).unwrap();
        assert_eq!(package.book_id_a, "book-a");
        assert_eq!(package.book_id_b, "book-b");
        assert_eq!(package.mappings, sample_file().mappings);
    }

    #[test]
    fn importing_a_package_whose_side_a_fingerprint_is_not_in_the_library_is_a_typed_mismatch_not_a_guess() {
        let conn = conn_with_two_books();
        let mut file = sample_file();
        file.book_a_fingerprint = "fp-nonexistent".into();

        let result = import_package(&conn, "pkg-1", &file);
        assert_eq!(
            result,
            Err(AlignmentImportError::SourceNotInLibrary { side: 'A', fingerprint: "fp-nonexistent".into() })
        );
    }

    #[test]
    fn importing_a_package_whose_side_b_fingerprint_is_not_in_the_library_is_a_typed_mismatch() {
        let conn = conn_with_two_books();
        let mut file = sample_file();
        file.book_b_fingerprint = "fp-nonexistent".into();

        let result = import_package(&conn, "pkg-1", &file);
        assert_eq!(
            result,
            Err(AlignmentImportError::SourceNotInLibrary { side: 'B', fingerprint: "fp-nonexistent".into() })
        );
    }

    #[test]
    fn a_book_with_no_alignment_package_returns_none() {
        let conn = conn_with_two_books();
        assert_eq!(find_package_for_book(&conn, "book-a").unwrap(), None);
    }

    #[test]
    fn a_package_is_found_from_either_side() {
        let conn = conn_with_two_books();
        let imported = import_package(&conn, "pkg-1", &sample_file()).unwrap();

        assert_eq!(find_package_for_book(&conn, "book-a").unwrap(), Some(imported.clone()));
        assert_eq!(find_package_for_book(&conn, "book-b").unwrap(), Some(imported));
    }
}
