//! Canonical SQLite persistence for the Library: schema migration and
//! fingerprint-identified book import.
//!
//! Per `ARCHITECTURE.md`: SQLite via `rusqlite` (`bundled` feature) is the
//! canonical persistence engine; a Book has one active BookFile binding.
//! Per `PRODUCT_SPEC.md` "Duplicate import": importing a file whose
//! fingerprint already exists in the Library must not create a second Book.

use crate::{compute_fingerprint, find_duplicate, LibraryEntry};
use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;
use std::path::Path;

/// Ownership mode for an imported BookFile.
/// Per `PRODUCT_SPEC.md` SS "Reference" / "Managed Copy".
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OwnershipMode {
    Reference,
    ManagedCopy,
}

impl OwnershipMode {
    fn as_str(self) -> &'static str {
        match self {
            OwnershipMode::Reference => "reference",
            OwnershipMode::ManagedCopy => "managed_copy",
        }
    }
}

/// Apply the current schema to `conn`, creating it if absent.
///
/// Uses `user_version` as a migration marker so future schema changes can
/// be applied incrementally rather than only "create if not exists"
/// (`ROADMAP.md` M1 Success Evidence: "migrations").
pub fn run_migrations(conn: &Connection) -> rusqlite::Result<()> {
    let current: i64 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;

    if current < 1 {
        conn.execute_batch(
            "
            CREATE TABLE book (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL
            );
            CREATE TABLE book_file (
                book_id TEXT NOT NULL REFERENCES book(id),
                path TEXT NOT NULL,
                fingerprint TEXT NOT NULL,
                format TEXT NOT NULL,
                ownership_mode TEXT NOT NULL
            );
            CREATE INDEX idx_book_file_fingerprint ON book_file(fingerprint);
            PRAGMA user_version = 1;
            ",
        )?;
    }

    if current < 2 {
        conn.execute_batch(
            "
            CREATE TABLE document_location (
                book_id TEXT PRIMARY KEY REFERENCES book(id),
                format TEXT NOT NULL,
                progression_hint REAL NOT NULL,
                primary_anchor TEXT NOT NULL,
                fallback_anchors TEXT NOT NULL,
                context_selector TEXT
            );
            PRAGMA user_version = 2;
            ",
        )?;
    }

    if current < 3 {
        conn.execute_batch(
            "
            CREATE TABLE reading_progress (
                book_id TEXT PRIMARY KEY REFERENCES book(id),
                completed_read_count INTEGER NOT NULL DEFAULT 0,
                active_read_in_progress INTEGER NOT NULL DEFAULT 1,
                active_pass_progress REAL NOT NULL DEFAULT 0
            );
            PRAGMA user_version = 3;
            ",
        )?;
    }

    if current < 4 {
        conn.execute_batch(
            "
            CREATE TABLE workload_config (
                book_id TEXT PRIMARY KEY REFERENCES book(id),
                quantity REAL NOT NULL,
                baseline_speed REAL NOT NULL,
                difficulty_coefficient REAL NOT NULL
            );
            CREATE TABLE actual_reading_time (
                book_id TEXT PRIMARY KEY REFERENCES book(id),
                total_seconds REAL NOT NULL DEFAULT 0
            );
            PRAGMA user_version = 4;
            ",
        )?;
    }

    if current < 5 {
        conn.execute_batch(
            "
            CREATE TABLE reading_asset (
                id TEXT PRIMARY KEY,
                book_id TEXT NOT NULL REFERENCES book(id),
                kind TEXT NOT NULL,
                text TEXT NOT NULL,
                anchor_json TEXT,
                orphaned INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX idx_reading_asset_book ON reading_asset(book_id);
            PRAGMA user_version = 5;
            ",
        )?;
    }

    if current < 6 {
        conn.execute_batch(
            "
            CREATE TABLE ocr_job (
                id TEXT PRIMARY KEY,
                book_id TEXT NOT NULL REFERENCES book(id),
                scope TEXT NOT NULL,
                status TEXT NOT NULL
            );
            CREATE INDEX idx_ocr_job_book ON ocr_job(book_id);
            CREATE TABLE ocr_page_result (
                book_id TEXT NOT NULL REFERENCES book(id),
                page_number INTEGER NOT NULL,
                text TEXT NOT NULL,
                PRIMARY KEY (book_id, page_number)
            );
            CREATE TABLE ocr_correction (
                book_id TEXT NOT NULL REFERENCES book(id),
                page_number INTEGER NOT NULL,
                corrected_text TEXT NOT NULL,
                PRIMARY KEY (book_id, page_number)
            );
            PRAGMA user_version = 6;
            ",
        )?;
    }

    if current < 7 {
        conn.execute_batch(
            "
            CREATE TABLE daily_reading_time (
                day TEXT PRIMARY KEY,
                seconds REAL NOT NULL DEFAULT 0
            );
            CREATE TABLE daily_goal_history (
                effective_day TEXT PRIMARY KEY,
                seconds REAL NOT NULL
            );
            PRAGMA user_version = 7;
            ",
        )?;
    }

    Ok(())
}

/// Import a Reference-mode book file into the Library.
///
/// If a Library entry with the same fingerprint already exists, returns
/// its existing `book_id` rather than creating a duplicate Book
/// (`PRODUCT_SPEC.md` "Duplicate import"). Otherwise inserts a new Book +
/// BookFile row, storing `file_path` as-is (`PRODUCT_SPEC.md` "Reference":
/// the source file stays where the user owns it) and returns the new
/// `book_id`.
pub fn import_book(
    conn: &Connection,
    file_path: &Path,
    title: &str,
    format: &str,
    ownership_mode: OwnershipMode,
) -> rusqlite::Result<String> {
    debug_assert_eq!(
        ownership_mode,
        OwnershipMode::Reference,
        "Managed Copy import must go through import_book_managed, which owns where the copy lives"
    );
    import_book_internal(conn, file_path, title, format, ownership_mode, None)
}

/// Import a book file into the Library under Managed-Copy ownership.
///
/// Per `PRODUCT_SPEC.md` "Managed Copy": the file is copied into
/// EbookReader-managed storage (`managed_dir`); the user's original source
/// file is left untouched. Duplicate-import detection is identical to
/// [`import_book`].
pub fn import_book_managed(
    conn: &Connection,
    file_path: &Path,
    title: &str,
    format: &str,
    ownership_mode: OwnershipMode,
    managed_dir: &Path,
) -> rusqlite::Result<String> {
    import_book_internal(conn, file_path, title, format, ownership_mode, Some(managed_dir))
}

fn import_book_internal(
    conn: &Connection,
    file_path: &Path,
    title: &str,
    format: &str,
    ownership_mode: OwnershipMode,
    managed_dir: Option<&Path>,
) -> rusqlite::Result<String> {
    let fingerprint = compute_fingerprint(file_path)
        .map_err(|e| rusqlite::Error::InvalidPath(format!("{e}").into()))?;

    let existing = existing_entries(conn)?;
    if let Some(dup) = find_duplicate(&existing, &fingerprint) {
        return Ok(dup.book_id.clone());
    }

    let stored_path: std::path::PathBuf = match (ownership_mode, managed_dir) {
        (OwnershipMode::ManagedCopy, Some(dir)) => {
            let file_name = file_path
                .file_name()
                .ok_or_else(|| rusqlite::Error::InvalidPath(file_path.to_path_buf()))?;
            let dest = dir.join(file_name);
            std::fs::copy(file_path, &dest)
                .map_err(|e| rusqlite::Error::InvalidPath(format!("{e}").into()))?;
            dest
        }
        (OwnershipMode::ManagedCopy, None) => {
            return Err(rusqlite::Error::InvalidPath(
                "Managed Copy import requires a managed storage directory".into(),
            ))
        }
        (OwnershipMode::Reference, _) => file_path.to_path_buf(),
    };

    let book_id = format!("{fingerprint}"); // fingerprint doubles as a stable id for this minimal slice
    conn.execute(
        "INSERT INTO book (id, title) VALUES (?1, ?2)",
        (&book_id, title),
    )?;
    conn.execute(
        "INSERT INTO book_file (book_id, path, fingerprint, format, ownership_mode) VALUES (?1, ?2, ?3, ?4, ?5)",
        (
            &book_id,
            stored_path.to_string_lossy().to_string(),
            &fingerprint,
            format,
            ownership_mode.as_str(),
        ),
    )?;

    Ok(book_id)
}

/// Outcome of attempting to relink a BookFile to a candidate path.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RelinkOutcome {
    /// The candidate's fingerprint matched the stored one; the BookFile's
    /// path has been updated. Book identity, progress, and reading assets
    /// are unaffected (`ARCHITECTURE.md` "Same fingerprint").
    Relinked,
    /// The candidate's fingerprint did not match the stored one. The path
    /// was *not* updated -- relink must not silently inherit a different
    /// file's identity (`ARCHITECTURE.md` "Changed fingerprint: Do not
    /// silently inherit"). Caller must route this to an explicit
    /// replacement/migration workflow instead.
    FingerprintMismatch,
}

/// Attempt to relink `book_id`'s BookFile to `candidate_path` (e.g. after
/// the user points EbookReader at a Reference file that moved).
///
/// Per `ARCHITECTURE.md` "Same fingerprint": a moved/renamed file with an
/// unchanged fingerprint relinks in place, preserving Book identity. A
/// changed fingerprint is reported, not silently applied.
pub fn relink_book_file(
    conn: &Connection,
    book_id: &str,
    candidate_path: &Path,
) -> rusqlite::Result<RelinkOutcome> {
    let stored_fingerprint: String = conn.query_row(
        "SELECT fingerprint FROM book_file WHERE book_id = ?1",
        [book_id],
        |row| row.get(0),
    )?;

    let candidate_fingerprint = compute_fingerprint(candidate_path)
        .map_err(|e| rusqlite::Error::InvalidPath(format!("{e}").into()))?;

    if candidate_fingerprint != stored_fingerprint {
        return Ok(RelinkOutcome::FingerprintMismatch);
    }

    conn.execute(
        "UPDATE book_file SET path = ?1 WHERE book_id = ?2",
        (candidate_path.to_string_lossy().to_string(), book_id),
    )?;

    Ok(RelinkOutcome::Relinked)
}

/// A Library entry as surfaced to callers (Tauri commands, UI) -- richer
/// than the internal [`LibraryEntry`] used for duplicate-import matching.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct BookSummary {
    pub book_id: String,
    pub title: String,
    pub path: String,
    pub format: String,
    pub ownership_mode: String,
    /// `false` when the stored path no longer exists on disk. Per
    /// `PRODUCT_SPEC.md` "Reference": "missing path enters Needs Relink" --
    /// this is that signal, surfaced to callers/UI rather than silently
    /// treated as available.
    pub available: bool,
}

/// List every Book currently in the Library, most recently imported first.
pub fn list_books(conn: &Connection) -> rusqlite::Result<Vec<BookSummary>> {
    let mut stmt = conn.prepare(
        "SELECT book.id, book.title, book_file.path, book_file.format, book_file.ownership_mode
         FROM book JOIN book_file ON book_file.book_id = book.id
         ORDER BY book.rowid DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        let path: String = row.get(2)?;
        let available = Path::new(&path).exists();
        Ok(BookSummary {
            book_id: row.get(0)?,
            title: row.get(1)?,
            path,
            format: row.get(3)?,
            ownership_mode: row.get(4)?,
            available,
        })
    })?;
    rows.collect()
}

/// Remove a Book from the Library.
///
/// Per `PRODUCT_SPEC.md`: a Managed-Copy BookFile's app-managed copy is
/// deleted (it exists only because EbookReader made it); a Reference
/// BookFile's source is the user's own file and is never touched.
pub fn remove_book(conn: &Connection, book_id: &str) -> rusqlite::Result<()> {
    let (path, ownership_mode): (String, String) = conn.query_row(
        "SELECT path, ownership_mode FROM book_file WHERE book_id = ?1",
        [book_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;

    if ownership_mode == OwnershipMode::ManagedCopy.as_str() {
        // Best-effort: an already-missing managed copy is not an error --
        // the Book row is still removed either way.
        std::fs::remove_file(&path).ok();
    }

    conn.execute("DELETE FROM book_file WHERE book_id = ?1", [book_id])?;
    conn.execute("DELETE FROM book WHERE id = ?1", [book_id])?;

    Ok(())
}

/// Look up a single Book by id, if it exists.
pub fn get_book(conn: &Connection, book_id: &str) -> rusqlite::Result<Option<BookSummary>> {
    conn.query_row(
        "SELECT book.id, book.title, book_file.path, book_file.format, book_file.ownership_mode
         FROM book JOIN book_file ON book_file.book_id = book.id
         WHERE book.id = ?1",
        [book_id],
        |row| {
            let path: String = row.get(2)?;
            let available = Path::new(&path).exists();
            Ok(BookSummary {
                book_id: row.get(0)?,
                title: row.get(1)?,
                path,
                format: row.get(3)?,
                ownership_mode: row.get(4)?,
                available,
            })
        },
    )
    .optional()
}

fn existing_entries(conn: &Connection) -> rusqlite::Result<Vec<LibraryEntry>> {
    let mut stmt = conn.prepare(
        "SELECT book.id, book.title, book_file.fingerprint FROM book JOIN book_file ON book_file.book_id = book.id",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(LibraryEntry {
            book_id: row.get(0)?,
            title: row.get(1)?,
            fingerprint: row.get(2)?,
        })
    })?;
    rows.collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn temp_file(name: &str, contents: &[u8]) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("ebookreader-store-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(name);
        std::fs::File::create(&path).unwrap().write_all(contents).unwrap();
        path
    }

    #[test]
    fn migrations_are_idempotent() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        run_migrations(&conn).unwrap(); // must not error on a second run

        let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(version, 7);
    }

    #[test]
    fn import_persists_a_new_book() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        let path = temp_file("book.epub", b"unique book contents");

        let book_id = import_book(&conn, &path, "A Test Book", "epub", OwnershipMode::Reference).unwrap();

        let title: String = conn
            .query_row("SELECT title FROM book WHERE id = ?1", [&book_id], |r| r.get(0))
            .unwrap();
        assert_eq!(title, "A Test Book");
    }

    #[test]
    fn reimporting_the_same_fingerprint_does_not_create_a_second_book() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        let path = temp_file("book2.epub", b"another unique book");

        let first = import_book(&conn, &path, "First Import", "epub", OwnershipMode::Reference).unwrap();
        let second = import_book(&conn, &path, "First Import", "epub", OwnershipMode::Reference).unwrap();

        assert_eq!(first, second);

        let count: i64 = conn.query_row("SELECT COUNT(*) FROM book", [], |r| r.get(0)).unwrap();
        assert_eq!(count, 1, "duplicate import by fingerprint must not create a second Book row");
    }

    #[test]
    fn reference_import_keeps_the_original_path_and_does_not_copy_bytes() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        let source = temp_file("ref.epub", b"reference-mode book contents");

        let book_id = import_book(&conn, &source, "Ref Book", "epub", OwnershipMode::Reference).unwrap();

        let stored_path: String = conn
            .query_row(
                "SELECT path FROM book_file WHERE book_id = ?1",
                [&book_id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(stored_path, source.to_string_lossy());
    }

    #[test]
    fn managed_copy_import_copies_bytes_into_managed_storage_and_leaves_the_source_untouched() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        let source = temp_file("managed.epub", b"managed-copy book contents");
        let managed_dir = std::env::temp_dir().join(format!("ebookreader-managed-{}", std::process::id()));
        std::fs::create_dir_all(&managed_dir).unwrap();

        let book_id = import_book_managed(
            &conn,
            &source,
            "Managed Book",
            "epub",
            OwnershipMode::ManagedCopy,
            &managed_dir,
        )
        .unwrap();

        let stored_path: String = conn
            .query_row(
                "SELECT path FROM book_file WHERE book_id = ?1",
                [&book_id],
                |r| r.get(0),
            )
            .unwrap();
        let stored_path = std::path::PathBuf::from(stored_path);

        assert!(
            stored_path.starts_with(&managed_dir),
            "Managed Copy must store its own copy under managed storage, not the original path"
        );
        assert_eq!(std::fs::read(&stored_path).unwrap(), b"managed-copy book contents");
        assert_eq!(
            std::fs::read(&source).unwrap(),
            b"managed-copy book contents",
            "the user's original source file must be left untouched by a Managed Copy import"
        );

        std::fs::remove_dir_all(&managed_dir).ok();
    }

    #[test]
    fn relink_updates_path_when_the_moved_files_fingerprint_still_matches() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        let original = temp_file("moved.epub", b"a book that gets moved");
        let book_id = import_book(&conn, &original, "Moved Book", "epub", OwnershipMode::Reference).unwrap();

        // Simulate the user moving the file: same bytes, new location.
        let new_location = temp_file("moved-elsewhere.epub", b"a book that gets moved");

        let outcome = relink_book_file(&conn, &book_id, &new_location).unwrap();
        assert_eq!(outcome, RelinkOutcome::Relinked);

        let stored_path: String = conn
            .query_row("SELECT path FROM book_file WHERE book_id = ?1", [&book_id], |r| r.get(0))
            .unwrap();
        assert_eq!(stored_path, new_location.to_string_lossy());
    }

    #[test]
    fn relink_refuses_and_does_not_update_path_when_fingerprint_differs() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        let original = temp_file("orig.epub", b"the original book contents");
        let book_id = import_book(&conn, &original, "Original Book", "epub", OwnershipMode::Reference).unwrap();

        // A different file happens to occupy the path the user pointed at.
        let different_file = temp_file("different.epub", b"completely different contents");

        let outcome = relink_book_file(&conn, &book_id, &different_file).unwrap();
        assert_eq!(outcome, RelinkOutcome::FingerprintMismatch);

        let stored_path: String = conn
            .query_row("SELECT path FROM book_file WHERE book_id = ?1", [&book_id], |r| r.get(0))
            .unwrap();
        assert_eq!(
            stored_path,
            original.to_string_lossy(),
            "a fingerprint mismatch must not silently overwrite the stored path"
        );
    }

    #[test]
    fn list_books_returns_imported_books_most_recent_first() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        let first = temp_file("first.epub", b"first book contents");
        let second = temp_file("second.epub", b"second book contents");

        import_book(&conn, &first, "First Book", "epub", OwnershipMode::Reference).unwrap();
        import_book(&conn, &second, "Second Book", "epub", OwnershipMode::Reference).unwrap();

        let books = list_books(&conn).unwrap();
        let titles: Vec<&str> = books.iter().map(|b| b.title.as_str()).collect();
        assert_eq!(titles, vec!["Second Book", "First Book"]);
    }

    #[test]
    fn get_book_finds_an_imported_book_by_id_and_none_for_an_unknown_id() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        let path = temp_file("lookup.epub", b"a book to look up");
        let book_id = import_book(&conn, &path, "Lookup Book", "epub", OwnershipMode::Reference).unwrap();

        let found = get_book(&conn, &book_id).unwrap();
        assert_eq!(found.map(|b| b.title), Some("Lookup Book".to_string()));

        assert_eq!(get_book(&conn, "no-such-book").unwrap(), None);
    }

    #[test]
    fn list_books_reports_needs_relink_when_the_reference_path_no_longer_exists() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        let path = temp_file("will-move.epub", b"a reference book");
        import_book(&conn, &path, "Will Move", "epub", OwnershipMode::Reference).unwrap();

        // Simulate the user's file moving/disappearing out from under the Reference.
        std::fs::remove_file(&path).unwrap();

        let books = list_books(&conn).unwrap();
        assert_eq!(books.len(), 1);
        assert!(
            !books[0].available,
            "PRODUCT_SPEC.md: a missing Reference path must enter Needs Relink, not read as available"
        );
    }

    #[test]
    fn list_books_reports_available_when_the_path_exists() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        let path = temp_file("still-there.epub", b"a present book");
        import_book(&conn, &path, "Still There", "epub", OwnershipMode::Reference).unwrap();

        let books = list_books(&conn).unwrap();
        assert!(books[0].available);
    }

    #[test]
    fn remove_book_deletes_the_managed_copy_but_never_touches_a_reference_source() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        // Managed Copy: removing the Book must delete the app-managed copy.
        let managed_source = temp_file("to-remove-managed.epub", b"managed book contents");
        let managed_dir = std::env::temp_dir().join(format!("ebookreader-remove-test-{}", std::process::id()));
        std::fs::create_dir_all(&managed_dir).unwrap();
        let managed_book_id = import_book_managed(
            &conn,
            &managed_source,
            "Managed To Remove",
            "epub",
            OwnershipMode::ManagedCopy,
            &managed_dir,
        )
        .unwrap();
        let managed_stored_path: String = conn
            .query_row("SELECT path FROM book_file WHERE book_id = ?1", [&managed_book_id], |r| r.get(0))
            .unwrap();

        remove_book(&conn, &managed_book_id).unwrap();

        assert!(
            !std::path::Path::new(&managed_stored_path).exists(),
            "removing a Managed-Copy Book must delete its app-managed copy"
        );
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM book WHERE id = ?1", [&managed_book_id], |r| r.get(0)).unwrap();
        assert_eq!(count, 0);

        // Reference: removing the Book must NOT touch the user's source file.
        let reference_source = temp_file("to-remove-reference.epub", b"reference book contents");
        let reference_book_id =
            import_book(&conn, &reference_source, "Reference To Remove", "epub", OwnershipMode::Reference).unwrap();

        remove_book(&conn, &reference_book_id).unwrap();

        assert!(
            reference_source.exists(),
            "removing a Reference Book must never delete the user's own source file"
        );
        assert_eq!(
            std::fs::read(&reference_source).unwrap(),
            b"reference book contents"
        );

        std::fs::remove_dir_all(&managed_dir).ok();
    }
}
