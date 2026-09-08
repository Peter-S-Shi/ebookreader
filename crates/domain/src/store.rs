//! Canonical SQLite persistence for the Library: schema migration and
//! fingerprint-identified book import.
//!
//! Per `ARCHITECTURE.md`: SQLite via `rusqlite` (`bundled` feature) is the
//! canonical persistence engine; a Book has one active BookFile binding.
//! Per `PRODUCT_SPEC.md` "Duplicate import": importing a file whose
//! fingerprint already exists in the Library must not create a second Book.

use crate::{compute_fingerprint, find_duplicate, LibraryEntry};
use rusqlite::Connection;
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

    Ok(())
}

/// Import a book file into the Library.
///
/// If a Library entry with the same fingerprint already exists, returns
/// its existing `book_id` rather than creating a duplicate Book
/// (`PRODUCT_SPEC.md` "Duplicate import"). Otherwise inserts a new Book +
/// BookFile row and returns the new `book_id`.
pub fn import_book(
    conn: &Connection,
    file_path: &Path,
    title: &str,
    format: &str,
    ownership_mode: OwnershipMode,
) -> rusqlite::Result<String> {
    let fingerprint = compute_fingerprint(file_path)
        .map_err(|e| rusqlite::Error::InvalidPath(format!("{e}").into()))?;

    let existing = existing_entries(conn)?;
    if let Some(dup) = find_duplicate(&existing, &fingerprint) {
        return Ok(dup.book_id.clone());
    }

    let book_id = format!("{fingerprint}"); // fingerprint doubles as a stable id for this minimal slice
    conn.execute(
        "INSERT INTO book (id, title) VALUES (?1, ?2)",
        (&book_id, title),
    )?;
    conn.execute(
        "INSERT INTO book_file (book_id, path, fingerprint, format, ownership_mode) VALUES (?1, ?2, ?3, ?4, ?5)",
        (
            &book_id,
            file_path.to_string_lossy().to_string(),
            &fingerprint,
            format,
            ownership_mode.as_str(),
        ),
    )?;

    Ok(book_id)
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
        assert_eq!(version, 1);
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
}
