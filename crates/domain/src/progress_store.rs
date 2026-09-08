//! SQLite persistence for `ReadingProgress` (`PRODUCT_SPEC.md` SS8).

use crate::completion::ReadingProgress;
use rusqlite::{Connection, OptionalExtension};

/// Load a Book's reading progress. A Book with no saved row yet (never
/// opened) reads as a fresh `ReadingProgress::new()` -- not an error --
/// since "no row" and "brand new, never-started book" are the same thing.
pub fn load_progress(conn: &Connection, book_id: &str) -> rusqlite::Result<ReadingProgress> {
    let row = conn
        .query_row(
            "SELECT completed_read_count, active_read_in_progress, active_pass_progress
             FROM reading_progress WHERE book_id = ?1",
            [book_id],
            |row| {
                let completed_read_count: u32 = row.get(0)?;
                let active_read_in_progress: bool = row.get::<_, i64>(1)? != 0;
                let active_pass_progress: f64 = row.get(2)?;
                Ok((completed_read_count, active_read_in_progress, active_pass_progress))
            },
        )
        .optional()?;

    Ok(match row {
        Some((completed_read_count, active_read_in_progress, active_pass_progress)) => {
            reconstruct(completed_read_count, active_read_in_progress, active_pass_progress)
        }
        None => ReadingProgress::new(),
    })
}

/// Save (insert or update) a Book's reading progress.
pub fn save_progress(conn: &Connection, book_id: &str, progress: &ReadingProgress) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO reading_progress
             (book_id, completed_read_count, active_read_in_progress, active_pass_progress)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(book_id) DO UPDATE SET
             completed_read_count = excluded.completed_read_count,
             active_read_in_progress = excluded.active_read_in_progress,
             active_pass_progress = excluded.active_pass_progress",
        (
            book_id,
            progress.completed_read_count(),
            progress.active_read_in_progress(),
            progress.active_pass_progress(),
        ),
    )?;
    Ok(())
}

fn reconstruct(completed_read_count: u32, active_read_in_progress: bool, active_pass_progress: f64) -> ReadingProgress {
    let mut progress = ReadingProgress::new();
    if completed_read_count > 0 || !active_read_in_progress {
        // Bring a freshly-constructed ReadingProgress (completed=0, active=true)
        // to the exact stored state via its own public state transitions,
        // rather than exposing private fields -- keeps this module honest
        // about only ever reaching states the domain type itself allows.
        progress.manual_override(completed_read_count);
        if active_read_in_progress {
            progress.start_next_read();
        }
    }
    if active_read_in_progress {
        progress.advance_active_progress(active_pass_progress);
    }
    progress
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
    fn loading_an_unsaved_book_returns_a_fresh_reading_progress() {
        let conn = conn_with_book("book-1");
        let progress = load_progress(&conn, "book-1").unwrap();
        assert_eq!(progress, ReadingProgress::new());
    }

    #[test]
    fn save_then_load_round_trips_an_in_progress_active_read() {
        let conn = conn_with_book("book-1");
        let mut progress = ReadingProgress::new();
        progress.advance_active_progress(42.0);

        save_progress(&conn, "book-1", &progress).unwrap();
        let loaded = load_progress(&conn, "book-1").unwrap();

        assert_eq!(loaded, progress);
    }

    #[test]
    fn save_then_load_round_trips_a_completed_read_with_no_active_read() {
        let conn = conn_with_book("book-1");
        let mut progress = ReadingProgress::new();
        progress.advance_active_progress(100.0);
        progress.complete_current_read();

        save_progress(&conn, "book-1", &progress).unwrap();
        let loaded = load_progress(&conn, "book-1").unwrap();

        assert_eq!(loaded, progress);
        assert_eq!(loaded.cumulative_percent(), 100.0);
    }

    #[test]
    fn save_then_load_round_trips_a_second_read_in_progress() {
        let conn = conn_with_book("book-1");
        let mut progress = ReadingProgress::new();
        progress.advance_active_progress(100.0);
        progress.complete_current_read();
        progress.start_next_read();
        progress.advance_active_progress(30.0);

        save_progress(&conn, "book-1", &progress).unwrap();
        let loaded = load_progress(&conn, "book-1").unwrap();

        assert_eq!(loaded, progress);
        assert_eq!(loaded.cumulative_percent(), 130.0);
    }

    #[test]
    fn saving_again_updates_in_place() {
        let conn = conn_with_book("book-1");
        let mut progress = ReadingProgress::new();
        progress.advance_active_progress(10.0);
        save_progress(&conn, "book-1", &progress).unwrap();

        progress.advance_active_progress(90.0);
        save_progress(&conn, "book-1", &progress).unwrap();

        let loaded = load_progress(&conn, "book-1").unwrap();
        assert_eq!(loaded.active_pass_progress(), 90.0);

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM reading_progress WHERE book_id = 'book-1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }
}
