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

    if current < 8 {
        conn.execute_batch(
            "
            CREATE TABLE alignment_package (
                id TEXT PRIMARY KEY,
                book_id_a TEXT NOT NULL REFERENCES book(id),
                book_id_b TEXT NOT NULL REFERENCES book(id),
                lang_a TEXT NOT NULL,
                lang_b TEXT NOT NULL,
                mappings_json TEXT NOT NULL
            );
            CREATE INDEX idx_alignment_package_book_a ON alignment_package(book_id_a);
            CREATE INDEX idx_alignment_package_book_b ON alignment_package(book_id_b);
            PRAGMA user_version = 8;
            ",
        )?;
    }

    if current < 9 {
        conn.execute_batch(
            "
            CREATE TABLE app_setting (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            PRAGMA user_version = 9;
            ",
        )?;
    }

    if current < 10 {
        conn.execute_batch(
            "
            ALTER TABLE book ADD COLUMN library_status TEXT NOT NULL DEFAULT 'active';
            CREATE INDEX idx_book_library_status ON book(library_status);
            PRAGMA user_version = 10;
            ",
        )?;
    }

    if current < 11 {
        conn.execute_batch(
            "
            CREATE TABLE collection (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL
            );
            CREATE TABLE book_collection (
                book_id TEXT NOT NULL REFERENCES book(id),
                collection_id TEXT NOT NULL REFERENCES collection(id),
                PRIMARY KEY (book_id, collection_id)
            );
            CREATE TABLE tag (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE
            );
            CREATE TABLE book_tag (
                book_id TEXT NOT NULL REFERENCES book(id),
                tag_id TEXT NOT NULL REFERENCES tag(id),
                PRIMARY KEY (book_id, tag_id)
            );
            PRAGMA user_version = 11;
            ",
        )?;
    }

    if current < 12 {
        conn.execute_batch(
            "
            ALTER TABLE book ADD COLUMN title_user_edited INTEGER NOT NULL DEFAULT 0;
            PRAGMA user_version = 12;
            ",
        )?;
    }

    if current < 13 {
        conn.execute_batch(
            "
            CREATE TABLE workload_config_revision (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                book_id TEXT NOT NULL REFERENCES book(id),
                quantity REAL NOT NULL,
                baseline_speed REAL NOT NULL,
                difficulty_coefficient REAL NOT NULL,
                recorded_at TEXT NOT NULL
            );
            CREATE INDEX idx_workload_config_revision_book ON workload_config_revision(book_id);
            PRAGMA user_version = 13;
            ",
        )?;
    }

    if current < 14 {
        conn.execute_batch(
            "
            ALTER TABLE book ADD COLUMN last_opened_at TEXT;
            PRAGMA user_version = 14;
            ",
        )?;
    }

    if current < 15 {
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS reading_profiles (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                difficulty_multiplier REAL NOT NULL DEFAULT 1.0,
                description TEXT NOT NULL DEFAULT '',
                is_default INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            INSERT OR IGNORE INTO reading_profiles (id, name, difficulty_multiplier, description, is_default, created_at, updated_at)
            VALUES ('profile-default', 'Default', 1.0, 'Neutral default reading profile', 1, datetime('now'), datetime('now'));

            ALTER TABLE book ADD COLUMN profile_id TEXT REFERENCES reading_profiles(id);
            ALTER TABLE book ADD COLUMN workload_quantity REAL;
            ALTER TABLE book ADD COLUMN workload_unit TEXT;
            ALTER TABLE book ADD COLUMN workload_speed_override REAL;
            CREATE INDEX IF NOT EXISTS idx_book_profile ON book(profile_id);
            ",
        )?;

        let has_workload_config: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='workload_config'",
                [],
                |row| row.get::<_, i64>(0),
            )
            .map(|c| c > 0)
            .unwrap_or(false);

        if has_workload_config {
            let mut stmt = conn.prepare(
                "SELECT book_id, quantity, baseline_speed, difficulty_coefficient FROM workload_config",
            )?;
            let rows = stmt.query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, f64>(1)?,
                    row.get::<_, f64>(2)?,
                    row.get::<_, f64>(3)?,
                ))
            })?;

            let mut custom_profiles: std::collections::HashMap<String, String> =
                std::collections::HashMap::new();

            for item in rows {
                let (book_id, quantity, baseline_speed, difficulty) = item?;
                let profile_id = if (difficulty - 1.0).abs() < 1e-6 {
                    "profile-default".to_string()
                } else {
                    let diff_key = format!("{:.2}", difficulty);
                    if let Some(pid) = custom_profiles.get(&diff_key) {
                        pid.clone()
                    } else {
                        let pid = format!("profile-custom-{}", diff_key.replace('.', "_"));
                        let pname = format!("Custom ({:.1}x)", difficulty);
                        conn.execute(
                            "INSERT OR IGNORE INTO reading_profiles (id, name, difficulty_multiplier, description, is_default, created_at, updated_at)
                             VALUES (?1, ?2, ?3, 'Migrated custom difficulty profile', 0, datetime('now'), datetime('now'))",
                            (&pid, &pname, difficulty),
                        )?;
                        custom_profiles.insert(diff_key, pid.clone());
                        pid
                    }
                };

                conn.execute(
                    "UPDATE book SET profile_id = ?1, workload_quantity = ?2, workload_unit = 'legacy_untyped', workload_speed_override = ?3 WHERE id = ?4",
                    (&profile_id, quantity, baseline_speed, &book_id),
                )?;
            }
        }

        conn.execute_batch("PRAGMA user_version = 15;")?;
    }

    Ok(())
}

/// Outcome of attempting to import a book file.
///
/// `PRODUCT_SPEC.md` "Duplicate import": a fingerprint that already
/// belongs to an active Library entry must not be silently imported (as a
/// second Book, or as a silent metadata overwrite of the first) -- the
/// caller must offer the user Open Existing / Relink Existing Book /
/// Cancel. Re-importing a fingerprint whose Book was previously *removed*
/// from the Library (`remove_from_library`) is a different, legitimate
/// case -- restoring a Library entry the user chose to bring back -- and
/// still resolves straight to `Imported`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ImportOutcome {
    /// A new Book was created, or a previously-removed Book was restored
    /// to the Library.
    Imported(String),
    /// This fingerprint already belongs to an *active* Library entry.
    /// Nothing was mutated; the caller must ask the user how to proceed.
    DuplicateFound { book_id: String, title: String },
}

impl ImportOutcome {
    /// The `book_id` this outcome refers to, regardless of variant.
    pub fn book_id(&self) -> &str {
        match self {
            ImportOutcome::Imported(id) => id,
            ImportOutcome::DuplicateFound { book_id, .. } => book_id,
        }
    }
}

/// Import a Reference-mode book file into the Library.
///
/// If a Library entry with the same fingerprint already exists and is
/// active, returns [`ImportOutcome::DuplicateFound`] without mutating
/// anything (`PRODUCT_SPEC.md` "Duplicate import"). Otherwise inserts a
/// new Book + BookFile row, storing `file_path` as-is (`PRODUCT_SPEC.md`
/// "Reference": the source file stays where the user owns it) and returns
/// [`ImportOutcome::Imported`].
pub fn import_book(
    conn: &Connection,
    file_path: &Path,
    title: &str,
    format: &str,
    ownership_mode: OwnershipMode,
) -> rusqlite::Result<ImportOutcome> {
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
) -> rusqlite::Result<ImportOutcome> {
    import_book_internal(conn, file_path, title, format, ownership_mode, Some(managed_dir))
}

fn import_book_internal(
    conn: &Connection,
    file_path: &Path,
    title: &str,
    format: &str,
    ownership_mode: OwnershipMode,
    managed_dir: Option<&Path>,
) -> rusqlite::Result<ImportOutcome> {
    let fingerprint = compute_fingerprint(file_path)
        .map_err(|e| rusqlite::Error::InvalidPath(format!("{e}").into()))?;

    let existing_book = conn
        .query_row(
            "SELECT book.id, book.library_status, book.title, book.title_user_edited
             FROM book JOIN book_file ON book_file.book_id = book.id
             WHERE book_file.fingerprint = ?1",
            [&fingerprint],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, bool>(3)?,
                ))
            },
        )
        .optional()?;

    if let Some((book_id, library_status, existing_title, _)) = &existing_book {
        if library_status == "active" {
            return Ok(ImportOutcome::DuplicateFound {
                book_id: book_id.clone(),
                title: existing_title.clone(),
            });
        }
    }
    let existing_book = existing_book.map(|(book_id, _, _, title_user_edited)| (book_id, title_user_edited));

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

    if let Some((book_id, title_user_edited)) = existing_book {
        // `PRODUCT_SPEC.md` SS3.4 "user-corrected metadata wins": restoring a
        // removed Book must not silently reintroduce the freshly-detected
        // filename-derived title over one the user already corrected.
        if title_user_edited {
            conn.execute("UPDATE book SET library_status = 'active' WHERE id = ?1", [&book_id])?;
        } else {
            conn.execute("UPDATE book SET library_status = 'active', title = ?1 WHERE id = ?2", (title, &book_id))?;
        }
        conn.execute(
            "UPDATE book_file SET path = ?1, format = ?2, ownership_mode = ?3 WHERE book_id = ?4",
            (
                stored_path.to_string_lossy().to_string(),
                format,
                ownership_mode.as_str(),
                &book_id,
            ),
        )?;
        return Ok(ImportOutcome::Imported(book_id));
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
            stored_path.to_string_lossy().to_string(),
            &fingerprint,
            format,
            ownership_mode.as_str(),
        ),
    )?;

    Ok(ImportOutcome::Imported(book_id))
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
    /// When this Book's Reader was last opened, if ever (FC-A11 /
    /// `DESIGN.md` SS4 "Continue Reading" needs real recency, not import
    /// order). `None` for a Book that has never been opened.
    pub last_opened_at: Option<String>,
}

/// List every Book currently in the Library, most recently imported first.
pub fn list_books(conn: &Connection) -> rusqlite::Result<Vec<BookSummary>> {
    let mut stmt = conn.prepare(
        "SELECT book.id, book.title, book_file.path, book_file.format, book_file.ownership_mode, book.last_opened_at
         FROM book JOIN book_file ON book_file.book_id = book.id
         WHERE book.library_status = 'active'
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
            last_opened_at: row.get(5)?,
        })
    })?;
    rows.collect()
}

/// Records that `book_id`'s Reader was just opened, for "Continue
/// Reading" recency (FC-A11). Idempotent -- always overwrites with the
/// latest timestamp, since only the most recent open matters.
pub fn record_book_opened(conn: &Connection, book_id: &str, opened_at: &str) -> rusqlite::Result<()> {
    conn.execute("UPDATE book SET last_opened_at = ?1 WHERE id = ?2", (opened_at, book_id))?;
    Ok(())
}

/// Remove a Book from the visible Library.
///
/// Per `PRODUCT_SPEC.md` SS5, Managed-Copy file deletion and reading-data
/// deletion are separate explicit operations. This action hides the Book
/// from the Library while preserving its source binding and canonical
/// reading data for a later explicit user decision.
pub fn remove_from_library(conn: &Connection, book_id: &str) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE book SET library_status = 'removed' WHERE id = ?1",
        [book_id],
    )?;
    Ok(())
}

/// Backward-compatible domain entry point for older command callers.
pub fn remove_book(conn: &Connection, book_id: &str) -> rusqlite::Result<()> {
    remove_from_library(conn, book_id)
}

/// Applies a user-authored title correction to `book_id` and marks it as
/// user-edited so it is never again silently overwritten by
/// automatically-detected metadata (`PRODUCT_SPEC.md` SS3.4
/// "user-corrected metadata wins").
pub fn update_book_title(conn: &Connection, book_id: &str, title: &str) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE book SET title = ?1, title_user_edited = 1 WHERE id = ?2",
        (title, book_id),
    )?;
    Ok(())
}

/// Delete user reading data for a Book without removing the Book's Library
/// entry or touching any Reference/Managed-Copy file bytes.
pub fn delete_reading_data(conn: &Connection, book_id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM document_location WHERE book_id = ?1", [book_id])?;
    conn.execute("DELETE FROM reading_progress WHERE book_id = ?1", [book_id])?;
    conn.execute("DELETE FROM workload_config WHERE book_id = ?1", [book_id])?;
    conn.execute("DELETE FROM workload_config_revision WHERE book_id = ?1", [book_id])?;
    conn.execute("DELETE FROM actual_reading_time WHERE book_id = ?1", [book_id])?;
    conn.execute("DELETE FROM reading_asset WHERE book_id = ?1", [book_id])?;
    conn.execute("DELETE FROM ocr_job WHERE book_id = ?1", [book_id])?;
    conn.execute("DELETE FROM ocr_page_result WHERE book_id = ?1", [book_id])?;
    conn.execute("DELETE FROM ocr_correction WHERE book_id = ?1", [book_id])?;
    conn.execute(
        "DELETE FROM alignment_package WHERE book_id_a = ?1 OR book_id_b = ?1",
        [book_id],
    )?;
    conn.execute(
        "UPDATE book SET profile_id = NULL, workload_quantity = NULL, workload_unit = NULL, workload_speed_override = NULL WHERE id = ?1",
        [book_id],
    )?;
    Ok(())
}

/// Delete the app-managed file bytes for a Managed-Copy Book. Reference
/// sources are user-owned files and are rejected by this operation.
pub fn delete_managed_copy_file(conn: &Connection, book_id: &str) -> rusqlite::Result<()> {
    let (path, ownership_mode): (String, String) = conn.query_row(
        "SELECT path, ownership_mode FROM book_file WHERE book_id = ?1",
        [book_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;

    if ownership_mode != OwnershipMode::ManagedCopy.as_str() {
        return Err(rusqlite::Error::InvalidParameterName(
            "Delete Managed-Copy File is only valid for Managed-Copy books".to_string(),
        ));
    }

    // Best-effort: an already-missing managed copy is not an error.
    std::fs::remove_file(&path).ok();
    Ok(())
}

/// Look up a single Book by id, if it exists.
pub fn get_book(conn: &Connection, book_id: &str) -> rusqlite::Result<Option<BookSummary>> {
    conn.query_row(
        "SELECT book.id, book.title, book_file.path, book_file.format, book_file.ownership_mode, book.last_opened_at
         FROM book JOIN book_file ON book_file.book_id = book.id
         WHERE book.id = ?1 AND book.library_status = 'active'",
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
                last_opened_at: row.get(5)?,
            })
        },
    )
    .optional()
}

/// Resolve a real Library `book_id` from a file fingerprint, or `None` if
/// no imported Book has that fingerprint. Used by `[[alignment]]` to
/// validate an Alignment Package's referenced sources against the
/// actual Library rather than trusting the package's own book-id claims
/// (`PRODUCT_SPEC.md` SS14 "source/fingerprint validation").
pub fn find_book_id_by_fingerprint(conn: &Connection, fingerprint: &str) -> rusqlite::Result<Option<String>> {
    let existing = existing_entries(conn)?;
    Ok(find_duplicate(&existing, fingerprint).map(|entry| entry.book_id.clone()))
}

fn existing_entries(conn: &Connection) -> rusqlite::Result<Vec<LibraryEntry>> {
    let mut stmt = conn.prepare(
        "SELECT book.id, book.title, book_file.fingerprint
         FROM book JOIN book_file ON book_file.book_id = book.id
         WHERE book.library_status = 'active'",
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
        assert_eq!(version, 15);
    }

    #[test]
    fn import_persists_a_new_book() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        let path = temp_file("book.epub", b"unique book contents");

        let book_id = import_book(&conn, &path, "A Test Book", "epub", OwnershipMode::Reference).unwrap().book_id().to_string();

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

        assert_eq!(
            second,
            ImportOutcome::DuplicateFound { book_id: first.book_id().to_string(), title: "First Import".to_string() },
            "PRODUCT_SPEC.md 'Duplicate import': re-importing a fingerprint already active in the Library \
             must report the duplicate, not silently resolve to a book_id"
        );

        let count: i64 = conn.query_row("SELECT COUNT(*) FROM book", [], |r| r.get(0)).unwrap();
        assert_eq!(count, 1, "duplicate import by fingerprint must not create a second Book row");
    }

    #[test]
    fn reimporting_the_same_fingerprint_while_active_does_not_mutate_the_existing_book() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        let path = temp_file("book2b.epub", b"yet another unique book");

        let first = import_book(&conn, &path, "Original Title", "epub", OwnershipMode::Reference).unwrap();
        import_book(&conn, &path, "A Different Title Offered On Reimport", "epub", OwnershipMode::Reference).unwrap();

        let title: String = conn
            .query_row("SELECT title FROM book WHERE id = ?1", [first.book_id()], |r| r.get(0))
            .unwrap();
        assert_eq!(
            title, "Original Title",
            "a duplicate import must not silently overwrite the existing Book's title before the user chooses"
        );
    }

    #[test]
    fn reference_import_keeps_the_original_path_and_does_not_copy_bytes() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        let source = temp_file("ref.epub", b"reference-mode book contents");

        let book_id = import_book(&conn, &source, "Ref Book", "epub", OwnershipMode::Reference).unwrap().book_id().to_string();

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
        .unwrap()
        .book_id()
        .to_string();

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
        let book_id = import_book(&conn, &original, "Moved Book", "epub", OwnershipMode::Reference).unwrap().book_id().to_string();

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
        let book_id = import_book(&conn, &original, "Original Book", "epub", OwnershipMode::Reference).unwrap().book_id().to_string();

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
        let book_id = import_book(&conn, &path, "Lookup Book", "epub", OwnershipMode::Reference).unwrap().book_id().to_string();

        let found = get_book(&conn, &book_id).unwrap();
        assert_eq!(found.map(|b| b.title), Some("Lookup Book".to_string()));

        assert_eq!(get_book(&conn, "no-such-book").unwrap(), None);
    }

    #[test]
    fn a_never_opened_book_has_no_last_opened_at() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        let path = temp_file("never-opened.epub", b"a book never opened");
        let book_id = import_book(&conn, &path, "Never Opened", "epub", OwnershipMode::Reference).unwrap().book_id().to_string();

        let found = get_book(&conn, &book_id).unwrap().unwrap();
        assert_eq!(found.last_opened_at, None);
    }

    #[test]
    fn record_book_opened_persists_and_re_recording_updates_in_place() {
        // FC-A11 (`DESIGN.md` SS4 "Continue Reading"): recency for the
        // Continue Reading list is a real recorded timestamp, not import
        // order or another heuristic.
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        let path = temp_file("reopened.epub", b"a book opened more than once");
        let book_id = import_book(&conn, &path, "Reopened Book", "epub", OwnershipMode::Reference).unwrap().book_id().to_string();

        record_book_opened(&conn, &book_id, "2026-09-09T00:00:00Z").unwrap();
        assert_eq!(get_book(&conn, &book_id).unwrap().unwrap().last_opened_at, Some("2026-09-09T00:00:00Z".to_string()));

        record_book_opened(&conn, &book_id, "2026-09-09T01:00:00Z").unwrap();
        assert_eq!(get_book(&conn, &book_id).unwrap().unwrap().last_opened_at, Some("2026-09-09T01:00:00Z".to_string()));
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
    fn destructive_library_operations_are_separated_by_domain_consequence() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let reference_source = temp_file("separated-reference.epub", b"reference book contents");
        let reference_book_id =
            import_book(&conn, &reference_source, "Reference To Keep", "epub", OwnershipMode::Reference).unwrap().book_id().to_string();
        conn.execute(
            "INSERT INTO reading_asset (id, book_id, kind, text, anchor_json, orphaned) VALUES ('asset-1', ?1, 'note', 'kept note', NULL, 0)",
            [&reference_book_id],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO reading_progress (book_id, completed_read_count, active_read_in_progress, active_pass_progress) VALUES (?1, 2, 1, 0.5)",
            [&reference_book_id],
        )
        .unwrap();

        remove_from_library(&conn, &reference_book_id).unwrap();

        assert!(reference_source.exists(), "Reference source bytes must never be deleted by Remove from Library");
        assert!(
            list_books(&conn).unwrap().iter().all(|book| book.book_id != reference_book_id),
            "Remove from Library removes the Book from the visible Library"
        );
        let asset_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM reading_asset WHERE book_id = ?1", [&reference_book_id], |r| r.get(0))
            .unwrap();
        assert_eq!(asset_count, 1, "Remove from Library is not Delete Reading Data");
        let progress_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM reading_progress WHERE book_id = ?1", [&reference_book_id], |r| r.get(0))
            .unwrap();
        assert_eq!(progress_count, 1, "Remove from Library preserves reading state for a later explicit data decision");

        let managed_source = temp_file("separated-managed.epub", b"managed book contents");
        let managed_dir = std::env::temp_dir().join(format!("ebookreader-delete-managed-test-{}", std::process::id()));
        std::fs::create_dir_all(&managed_dir).unwrap();
        let managed_book_id = import_book_managed(
            &conn,
            &managed_source,
            "Managed To Delete",
            "epub",
            OwnershipMode::ManagedCopy,
            &managed_dir,
        )
        .unwrap()
        .book_id()
        .to_string();
        let managed_stored_path: String = conn
            .query_row("SELECT path FROM book_file WHERE book_id = ?1", [&managed_book_id], |r| r.get(0))
            .unwrap();

        delete_reading_data(&conn, &managed_book_id).unwrap();

        assert!(
            std::path::Path::new(&managed_stored_path).exists(),
            "Delete Reading Data must not delete the Managed-Copy file"
        );
        assert!(
            get_book(&conn, &managed_book_id).unwrap().is_some(),
            "Delete Reading Data keeps the Book in the Library"
        );

        delete_managed_copy_file(&conn, &managed_book_id).unwrap();
        assert!(
            !std::path::Path::new(&managed_stored_path).exists(),
            "Delete Managed-Copy File deletes only the app-managed copy"
        );

        let err = delete_managed_copy_file(&conn, &reference_book_id).unwrap_err();
        assert!(err
            .to_string()
            .contains("Delete Managed-Copy File is only valid for Managed-Copy books"));

        std::fs::remove_dir_all(&managed_dir).ok();
    }

    #[test]
    fn reimporting_a_removed_book_restores_the_existing_library_entry() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        let source = temp_file("removed-then-reimported.epub", b"same fingerprint");
        let book_id = import_book(&conn, &source, "Original Title", "epub", OwnershipMode::Reference).unwrap().book_id().to_string();
        conn.execute(
            "INSERT INTO reading_asset (id, book_id, kind, text, anchor_json, orphaned) VALUES ('asset-reimport', ?1, 'note', 'still here', NULL, 0)",
            [&book_id],
        )
        .unwrap();

        remove_from_library(&conn, &book_id).unwrap();
        assert!(list_books(&conn).unwrap().is_empty());

        let restored = import_book(&conn, &source, "Restored Title", "epub", OwnershipMode::Reference).unwrap();

        assert_eq!(
            restored,
            ImportOutcome::Imported(book_id.clone()),
            "re-importing a fingerprint whose Book was removed from the Library restores it directly; \
             it is not the 'already active' duplicate case FC-A03 governs"
        );
        let books = list_books(&conn).unwrap();
        assert_eq!(books.len(), 1);
        assert_eq!(books[0].title, "Restored Title");
        let asset_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM reading_asset WHERE book_id = ?1", [&book_id], |r| r.get(0))
            .unwrap();
        assert_eq!(asset_count, 1, "Remove from Library preserves data that a later re-import can recover");
    }

    #[test]
    fn update_book_title_persists_the_users_correction() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        let path = temp_file("edit-title.epub", b"a book whose title gets corrected");
        let book_id = import_book(&conn, &path, "Detected Title", "epub", OwnershipMode::Reference).unwrap().book_id().to_string();

        update_book_title(&conn, &book_id, "Corrected Title").unwrap();

        let title: String = conn.query_row("SELECT title FROM book WHERE id = ?1", [&book_id], |r| r.get(0)).unwrap();
        assert_eq!(title, "Corrected Title");
    }

    #[test]
    fn a_user_corrected_title_survives_remove_and_reimport() {
        // PRODUCT_SPEC.md SS3.4 "user-corrected metadata wins": the
        // remove-from-library/reimport restore path (see
        // `reimporting_a_removed_book_restores_the_existing_library_entry`)
        // unconditionally re-wrote title from the freshly-detected
        // filename-derived value before FC-A02 -- the one place a user
        // correction could actually have been silently overwritten.
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        let source = temp_file("corrected-then-reimported.epub", b"same fingerprint, corrected title");
        let book_id = import_book(&conn, &source, "Detected Title", "epub", OwnershipMode::Reference).unwrap().book_id().to_string();
        update_book_title(&conn, &book_id, "My Corrected Title").unwrap();

        remove_from_library(&conn, &book_id).unwrap();
        import_book(&conn, &source, "Detected Title Again", "epub", OwnershipMode::Reference).unwrap();

        let title: String = conn.query_row("SELECT title FROM book WHERE id = ?1", [&book_id], |r| r.get(0)).unwrap();
        assert_eq!(
            title, "My Corrected Title",
            "a user-corrected title must survive a remove-then-reimport cycle, not be silently \
             overwritten by the freshly-detected filename-derived title"
        );
    }

    #[test]
    fn a_book_without_a_user_correction_still_picks_up_the_freshly_detected_title_on_reimport() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        let source = temp_file("uncorrected-then-reimported.epub", b"same fingerprint, no correction");
        let book_id = import_book(&conn, &source, "First Detected Title", "epub", OwnershipMode::Reference).unwrap().book_id().to_string();

        remove_from_library(&conn, &book_id).unwrap();
        import_book(&conn, &source, "Second Detected Title", "epub", OwnershipMode::Reference).unwrap();

        let title: String = conn.query_row("SELECT title FROM book WHERE id = ?1", [&book_id], |r| r.get(0)).unwrap();
        assert_eq!(title, "Second Detected Title");
    }

    #[test]
    fn migration_15_migrates_legacy_workload_config_and_creates_profiles() {
        let conn = Connection::open_in_memory().unwrap();
        // Setup schema up to migration 14
        conn.execute_batch(
            "
            CREATE TABLE book (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                library_status TEXT NOT NULL DEFAULT 'active',
                title_user_edited INTEGER NOT NULL DEFAULT 0,
                last_opened_at TEXT
            );
            CREATE TABLE workload_config (
                book_id TEXT PRIMARY KEY REFERENCES book(id),
                quantity REAL NOT NULL,
                baseline_speed REAL NOT NULL,
                difficulty_coefficient REAL NOT NULL
            );
            CREATE TABLE workload_config_revision (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                book_id TEXT NOT NULL REFERENCES book(id),
                quantity REAL NOT NULL,
                baseline_speed REAL NOT NULL,
                difficulty_coefficient REAL NOT NULL,
                recorded_at TEXT NOT NULL
            );
            PRAGMA user_version = 14;
            ",
        ).unwrap();

        // Insert legacy books & workload_configs
        conn.execute("INSERT INTO book (id, title) VALUES ('b1', 'Book 1')", []).unwrap();
        conn.execute("INSERT INTO book (id, title) VALUES ('b2', 'Book 2')", []).unwrap();
        conn.execute(
            "INSERT INTO workload_config (book_id, quantity, baseline_speed, difficulty_coefficient) VALUES ('b1', 1000.0, 250.0, 1.0)",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO workload_config (book_id, quantity, baseline_speed, difficulty_coefficient) VALUES ('b2', 2000.0, 300.0, 1.25)",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO workload_config_revision (book_id, quantity, baseline_speed, difficulty_coefficient, recorded_at) VALUES ('b1', 1000.0, 250.0, 1.0, '2026-09-01T00:00:00Z')",
            [],
        ).unwrap();

        // Run migration to v15
        run_migrations(&conn).unwrap();

        let v: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(v, 15);

        // Verify book 1 (difficulty 1.0 -> profile-default)
        let (p1, q1, u1, s1): (String, f64, String, f64) = conn.query_row(
            "SELECT profile_id, workload_quantity, workload_unit, workload_speed_override FROM book WHERE id = 'b1'",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        ).unwrap();
        assert_eq!(p1, "profile-default");
        assert_eq!(q1, 1000.0);
        assert_eq!(u1, "legacy_untyped");
        assert_eq!(s1, 250.0);

        // Verify book 2 (difficulty 1.25 -> custom profile created)
        let (p2, q2, u2, s2): (String, f64, String, f64) = conn.query_row(
            "SELECT profile_id, workload_quantity, workload_unit, workload_speed_override FROM book WHERE id = 'b2'",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        ).unwrap();
        assert!(p2.starts_with("profile-custom-"));
        assert_eq!(q2, 2000.0);
        assert_eq!(u2, "legacy_untyped");
        assert_eq!(s2, 300.0);

        // Verify custom profile metadata
        let (p2_name, p2_diff, p2_default): (String, f64, i32) = conn.query_row(
            "SELECT name, difficulty_multiplier, is_default FROM reading_profiles WHERE id = ?1",
            [&p2],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        ).unwrap();
        assert_eq!(p2_name, "Custom (1.2x)");
        assert_eq!(p2_diff, 1.25);
        assert_eq!(p2_default, 0);

        // Verify revisions preserved
        let rev_count: i64 = conn.query_row("SELECT COUNT(*) FROM workload_config_revision", [], |r| r.get(0)).unwrap();
        assert_eq!(rev_count, 1);

        // Verify delete_reading_data clears book workload columns on full schema
        let full_conn = Connection::open_in_memory().unwrap();
        run_migrations(&full_conn).unwrap();
        full_conn.execute("INSERT INTO book (id, title, profile_id, workload_quantity) VALUES ('b-del', 'Book Del', 'profile-default', 500.0)", []).unwrap();
        delete_reading_data(&full_conn, "b-del").unwrap();
        let (p_del, q_del): (Option<String>, Option<f64>) = full_conn.query_row(
            "SELECT profile_id, workload_quantity FROM book WHERE id = 'b-del'",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        ).unwrap();
        assert_eq!(p_del, None);
        assert_eq!(q_del, None);
    }
}
