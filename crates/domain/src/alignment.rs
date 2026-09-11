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
/// A persisted, Library-validated Alignment Package: both fingerprints
/// have been resolved to real `book_id`s already in the Library.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AlignmentPackage {
    pub id: String,
    pub book_id_a: String,
    pub book_id_b: String,
    pub lang_a: String,
    pub lang_b: String,
    pub mappings: Vec<AlignmentMapping>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AlignmentPackageSummary {
    pub id: String,
    pub book_id_a: String,
    pub book_title_a: String,
    pub lang_a: String,
    pub book_id_b: String,
    pub book_title_b: String,
    pub lang_b: String,
    pub total_mappings: usize,
    pub clean_mappings: usize,
    pub review_mappings: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AlignmentStatistics {
    pub total_packages: usize,
    pub total_paired_books: usize,
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

/// Lists all Alignment Packages involving `book_id` on either side A or side B.
pub fn list_packages_for_book(conn: &Connection, book_id: &str) -> rusqlite::Result<Vec<AlignmentPackage>> {
    let mut stmt = conn.prepare(
        "SELECT id, book_id_a, book_id_b, lang_a, lang_b, mappings_json FROM alignment_package
         WHERE book_id_a = ?1 OR book_id_b = ?1
         ORDER BY rowid ASC",
    )?;
    let rows = stmt.query_map([book_id], |row| {
        let id: String = row.get(0)?;
        let book_id_a: String = row.get(1)?;
        let book_id_b: String = row.get(2)?;
        let lang_a: String = row.get(3)?;
        let lang_b: String = row.get(4)?;
        let mappings_json: String = row.get(5)?;
        let mappings: Vec<AlignmentMapping> = serde_json::from_str(&mappings_json).unwrap_or_default();
        Ok(AlignmentPackage {
            id,
            book_id_a,
            book_id_b,
            lang_a,
            lang_b,
            mappings,
        })
    })?;

    let mut pkgs = Vec::new();
    for r in rows {
        pkgs.push(r?);
    }
    Ok(pkgs)
}

/// The Alignment Package with specific `package_id`.
pub fn get_package(conn: &Connection, package_id: &str) -> rusqlite::Result<Option<AlignmentPackage>> {
    let mut stmt = conn.prepare(
        "SELECT id, book_id_a, book_id_b, lang_a, lang_b, mappings_json
         FROM alignment_package
         WHERE id = ?1",
    )?;

    let mut rows = stmt.query_map([package_id], |row| {
        let id: String = row.get(0)?;
        let book_id_a: String = row.get(1)?;
        let book_id_b: String = row.get(2)?;
        let lang_a: String = row.get(3)?;
        let lang_b: String = row.get(4)?;
        let mappings_json: String = row.get(5)?;
        let mappings: Vec<AlignmentMapping> = serde_json::from_str(&mappings_json).unwrap_or_default();
        Ok(AlignmentPackage {
            id,
            book_id_a,
            book_id_b,
            lang_a,
            lang_b,
            mappings,
        })
    })?;

    if let Some(r) = rows.next() {
        Ok(Some(r?))
    } else {
        Ok(None)
    }
}

/// The Alignment Package pairing `book_id` with another Book if exactly one
/// exists. If multiple packages exist, returns an error requiring explicit selection.
pub fn find_package_for_book(conn: &Connection, book_id: &str) -> rusqlite::Result<Option<AlignmentPackage>> {
    let mut pkgs = list_packages_for_book(conn, book_id)?;
    if pkgs.is_empty() {
        Ok(None)
    } else if pkgs.len() == 1 {
        Ok(Some(pkgs.remove(0)))
    } else {
        Err(rusqlite::Error::FromSqlConversionFailure(
            pkgs.len(),
            rusqlite::types::Type::Text,
            Box::new(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("multiple alignment packages ({}) found for book {book_id}", pkgs.len()),
            )),
        ))
    }
}

/// Lists all Alignment Packages with resolved book titles and structural mapping counts.
pub fn list_all_alignment_packages(conn: &Connection) -> rusqlite::Result<Vec<AlignmentPackageSummary>> {
    let mut stmt = conn.prepare(
        "SELECT ap.id, ap.book_id_a, b1.title, ap.lang_a, ap.book_id_b, b2.title, ap.lang_b, ap.mappings_json
         FROM alignment_package ap
         LEFT JOIN book b1 ON b1.id = ap.book_id_a
         LEFT JOIN book b2 ON b2.id = ap.book_id_b
         ORDER BY ap.rowid DESC",
    )?;

    let rows = stmt.query_map([], |row| {
        let id: String = row.get(0)?;
        let book_id_a: String = row.get(1)?;
        let book_title_a: String = row.get::<_, Option<String>>(2)?.unwrap_or_else(|| book_id_a.clone());
        let lang_a: String = row.get(3)?;
        let book_id_b: String = row.get(4)?;
        let book_title_b: String = row.get::<_, Option<String>>(5)?.unwrap_or_else(|| book_id_b.clone());
        let lang_b: String = row.get(6)?;
        let mappings_json: String = row.get(7)?;

        let mappings: Vec<AlignmentMapping> = serde_json::from_str(&mappings_json).unwrap_or_default();
        let total_mappings = mappings.len();
        let clean_mappings = mappings.iter().filter(|m| m.status() == "ok").count();
        let review_mappings = total_mappings.saturating_sub(clean_mappings);

        Ok(AlignmentPackageSummary {
            id,
            book_id_a,
            book_title_a,
            lang_a,
            book_id_b,
            book_title_b,
            lang_b,
            total_mappings,
            clean_mappings,
            review_mappings,
        })
    })?;

    let mut result = Vec::new();
    for r in rows {
        result.push(r?);
    }
    Ok(result)
}

/// Returns library-wide alignment statistics (total packages, unique paired books count).
pub fn get_alignment_statistics(conn: &Connection) -> rusqlite::Result<AlignmentStatistics> {
    let packages = list_all_alignment_packages(conn)?;
    let total_packages = packages.len();
    let mut unique_books = std::collections::HashSet::new();
    for p in &packages {
        unique_books.insert(p.book_id_a.clone());
        unique_books.insert(p.book_id_b.clone());
    }
    Ok(AlignmentStatistics {
        total_packages,
        total_paired_books: unique_books.len(),
    })
}

/// Deletes an alignment package by id. Removes only the package pairing, never the Books or reading data.
pub fn delete_alignment_package(conn: &Connection, package_id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM alignment_package WHERE id = ?1", [package_id])?;
    Ok(())
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

    #[test]
    fn list_all_alignment_packages_and_statistics_round_trip() {
        let conn = conn_with_two_books();
        import_package(&conn, "pkg-1", &sample_file()).unwrap();

        let list = list_all_alignment_packages(&conn).unwrap();
        assert_eq!(list.len(), 1);
        let pkg = &list[0];
        assert_eq!(pkg.id, "pkg-1");
        assert_eq!(pkg.book_title_a, "English Edition");
        assert_eq!(pkg.book_title_b, "Chinese Edition");
        assert_eq!(pkg.total_mappings, 2);
        assert_eq!(pkg.clean_mappings, 1);
        assert_eq!(pkg.review_mappings, 1);

        let stats = get_alignment_statistics(&conn).unwrap();
        assert_eq!(stats.total_packages, 1);
        assert_eq!(stats.total_paired_books, 2);

        delete_alignment_package(&conn, "pkg-1").unwrap();
        assert_eq!(list_all_alignment_packages(&conn).unwrap().len(), 0);
        assert_eq!(get_alignment_statistics(&conn).unwrap().total_packages, 0);

        // Verify book records were never deleted
        assert!(find_package_for_book(&conn, "book-a").unwrap().is_none());
    }

    #[test]
    fn list_packages_for_book_returns_all_pairings_and_find_package_rejects_ambiguous_plural() {
        let conn = conn_with_two_books();
        // Add a third book
        conn.execute("INSERT INTO book (id, title) VALUES ('book-c', 'French Edition')", []).unwrap();
        conn.execute(
            "INSERT INTO book_file (book_id, path, fingerprint, format, ownership_mode)
             VALUES ('book-c', 'c.txt', 'fp-c', 'txt', 'reference')",
            [],
        )
        .unwrap();

        import_package(&conn, "pkg-1", &sample_file()).unwrap();

        let file_2 = AlignmentPackageFile {
            book_a_fingerprint: "fp-a".into(),
            book_b_fingerprint: "fp-c".into(),
            lang_a: "en".into(),
            lang_b: "fr".into(),
            mappings: vec![],
        };
        import_package(&conn, "pkg-2", &file_2).unwrap();

        let book_a_pkgs = list_packages_for_book(&conn, "book-a").unwrap();
        assert_eq!(book_a_pkgs.len(), 2);

        // find_package_for_book truthfully rejects when multiple packages exist rather than guessing with LIMIT 1
        assert!(find_package_for_book(&conn, "book-a").is_err());

        // But single-pairing book-c resolves cleanly
        let book_c_pkg = find_package_for_book(&conn, "book-c").unwrap();
        assert!(book_c_pkg.is_some());
        assert_eq!(book_c_pkg.unwrap().id, "pkg-2");
    }
}

