//! Scanned PDF OCR: job scope/status, and the raw-cache-vs-canonical-
//! correction split (`ROADMAP.md` M5 Exit Gate: "Manual corrections
//! survive raw OCR/cache rebuild and restart").
//!
//! This module owns the OCR *data model* -- job lifecycle, per-page raw
//! results, and user corrections -- not the OCR engine itself. The actual
//! local ONNX inference (`M0_ARCHITECTURE_DECISION.md` SS8: a PP-OCR-class
//! model via the Rust `ort` crate) needs a sourced, redistributable model
//! file and a bundled/first-run-downloaded `onnxruntime.dll`; neither is
//! available in this repo/sandbox yet (confirmed: no `.onnx` or
//! `onnxruntime*.dll` present anywhere in this environment), so wiring
//! real inference is a distinct, still-open sub-problem tracked in
//! `PROJECT_STATUS.md`, not silently faked here. Nothing in this module
//! claims OCR text exists for a page unless a caller actually supplied it
//! via [`save_page_result`] -- `effective_text` returns `None`, not an
//! empty or placeholder string, when neither a correction nor a raw
//! result exists (`PRODUCT_SPEC.md` SS13.2's "do not pretend").

use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

/// `PRODUCT_SPEC.md` SS13.1: "user chooses Current Page, Selected Pages,
/// or Entire Book."
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum OcrScope {
    CurrentPage { page: u32 },
    SelectedPages { pages: Vec<u32> },
    EntireBook,
}

/// SS13.1: "jobs can pause/resume/cancel"; "successful completion has an
/// explicit semantic success state."
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OcrJobStatus {
    Pending,
    Running,
    Paused,
    Cancelled,
    Succeeded,
    Failed,
}

impl OcrJobStatus {
    fn as_str(self) -> &'static str {
        match self {
            OcrJobStatus::Pending => "pending",
            OcrJobStatus::Running => "running",
            OcrJobStatus::Paused => "paused",
            OcrJobStatus::Cancelled => "cancelled",
            OcrJobStatus::Succeeded => "succeeded",
            OcrJobStatus::Failed => "failed",
        }
    }

    fn parse(s: &str) -> Option<Self> {
        match s {
            "pending" => Some(OcrJobStatus::Pending),
            "running" => Some(OcrJobStatus::Running),
            "paused" => Some(OcrJobStatus::Paused),
            "cancelled" => Some(OcrJobStatus::Cancelled),
            "succeeded" => Some(OcrJobStatus::Succeeded),
            "failed" => Some(OcrJobStatus::Failed),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct OcrJob {
    pub id: String,
    pub book_id: String,
    pub scope: OcrScope,
    pub status: OcrJobStatus,
}

pub fn create_job(conn: &Connection, job: &OcrJob) -> rusqlite::Result<()> {
    let scope_json =
        serde_json::to_string(&job.scope).map_err(|e| rusqlite::Error::InvalidPath(format!("{e}").into()))?;
    conn.execute(
        "INSERT INTO ocr_job (id, book_id, scope, status) VALUES (?1, ?2, ?3, ?4)",
        (&job.id, &job.book_id, &scope_json, job.status.as_str()),
    )?;
    Ok(())
}

fn row_to_job(row: &rusqlite::Row) -> rusqlite::Result<OcrJob> {
    let scope_json: String = row.get(2)?;
    let status_str: String = row.get(3)?;
    Ok(OcrJob {
        id: row.get(0)?,
        book_id: row.get(1)?,
        scope: serde_json::from_str(&scope_json).unwrap_or(OcrScope::EntireBook),
        status: OcrJobStatus::parse(&status_str).unwrap_or(OcrJobStatus::Failed),
    })
}

pub fn get_job(conn: &Connection, job_id: &str) -> rusqlite::Result<Option<OcrJob>> {
    conn.query_row(
        "SELECT id, book_id, scope, status FROM ocr_job WHERE id = ?1",
        [job_id],
        row_to_job,
    )
    .optional()
}

/// Transition a job's status (pause/resume/cancel/complete/fail). Does not
/// validate the transition graph -- the caller (the actual OCR job runner,
/// a later checkpoint) owns which transitions are legal at which point.
pub fn set_job_status(conn: &Connection, job_id: &str, status: OcrJobStatus) -> rusqlite::Result<()> {
    conn.execute("UPDATE ocr_job SET status = ?1 WHERE id = ?2", (status.as_str(), job_id))?;
    Ok(())
}

/// Save (or overwrite) one page's raw OCR text -- the rebuildable cache
/// (SS13.1: "raw OCR/cache is rebuildable").
pub fn save_page_result(conn: &Connection, book_id: &str, page_number: u32, text: &str) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO ocr_page_result (book_id, page_number, text) VALUES (?1, ?2, ?3)
         ON CONFLICT(book_id, page_number) DO UPDATE SET text = excluded.text",
        (book_id, page_number, text),
    )?;
    Ok(())
}

pub fn get_page_result(conn: &Connection, book_id: &str, page_number: u32) -> rusqlite::Result<Option<String>> {
    conn.query_row(
        "SELECT text FROM ocr_page_result WHERE book_id = ?1 AND page_number = ?2",
        (book_id, page_number),
        |row| row.get(0),
    )
    .optional()
}

/// Delete all raw OCR results for a Book -- simulating cache invalidation
/// or a rebuild. `ocr_correction` is a separate table and is untouched
/// (this is the Exit Gate condition: "Manual corrections survive raw
/// OCR/cache rebuild and restart").
pub fn clear_page_results(conn: &Connection, book_id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM ocr_page_result WHERE book_id = ?1", [book_id])?;
    Ok(())
}

/// Save a user's correction for one page's OCR text. Canonical user data
/// -- never touched by [`clear_page_results`].
pub fn save_correction(conn: &Connection, book_id: &str, page_number: u32, corrected_text: &str) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO ocr_correction (book_id, page_number, corrected_text) VALUES (?1, ?2, ?3)
         ON CONFLICT(book_id, page_number) DO UPDATE SET corrected_text = excluded.corrected_text",
        (book_id, page_number, corrected_text),
    )?;
    Ok(())
}

pub fn get_correction(conn: &Connection, book_id: &str, page_number: u32) -> rusqlite::Result<Option<String>> {
    conn.query_row(
        "SELECT corrected_text FROM ocr_correction WHERE book_id = ?1 AND page_number = ?2",
        (book_id, page_number),
        |row| row.get(0),
    )
    .optional()
}

/// The text a Reader/search should actually use for a page: the user's
/// correction if one exists, else the raw OCR result, else `None`
/// (SS13.2: before OCR, "do not pretend that: search text exists").
pub fn effective_text(conn: &Connection, book_id: &str, page_number: u32) -> rusqlite::Result<Option<String>> {
    if let Some(corrected) = get_correction(conn, book_id, page_number)? {
        return Ok(Some(corrected));
    }
    get_page_result(conn, book_id, page_number)
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

    #[test]
    fn create_and_get_job_round_trips_each_scope_variant() {
        let conn = conn_with_book("book-1");

        let cases = [
            OcrScope::CurrentPage { page: 3 },
            OcrScope::SelectedPages { pages: vec![1, 4, 7] },
            OcrScope::EntireBook,
        ];
        for (i, scope) in cases.into_iter().enumerate() {
            let job = OcrJob { id: format!("job-{i}"), book_id: "book-1".into(), scope, status: OcrJobStatus::Pending };
            create_job(&conn, &job).unwrap();
            assert_eq!(get_job(&conn, &job.id).unwrap(), Some(job));
        }
    }

    #[test]
    fn job_status_transitions_pause_resume_cancel() {
        let conn = conn_with_book("book-1");
        let job = OcrJob { id: "job-1".into(), book_id: "book-1".into(), scope: OcrScope::EntireBook, status: OcrJobStatus::Pending };
        create_job(&conn, &job).unwrap();

        set_job_status(&conn, "job-1", OcrJobStatus::Running).unwrap();
        assert_eq!(get_job(&conn, "job-1").unwrap().unwrap().status, OcrJobStatus::Running);

        set_job_status(&conn, "job-1", OcrJobStatus::Paused).unwrap();
        assert_eq!(get_job(&conn, "job-1").unwrap().unwrap().status, OcrJobStatus::Paused);

        set_job_status(&conn, "job-1", OcrJobStatus::Running).unwrap();
        assert_eq!(get_job(&conn, "job-1").unwrap().unwrap().status, OcrJobStatus::Running);

        set_job_status(&conn, "job-1", OcrJobStatus::Cancelled).unwrap();
        assert_eq!(get_job(&conn, "job-1").unwrap().unwrap().status, OcrJobStatus::Cancelled);
    }

    #[test]
    fn a_completed_job_has_an_explicit_succeeded_or_failed_state() {
        let conn = conn_with_book("book-1");
        create_job(&conn, &OcrJob { id: "ok".into(), book_id: "book-1".into(), scope: OcrScope::EntireBook, status: OcrJobStatus::Running }).unwrap();
        create_job(&conn, &OcrJob { id: "bad".into(), book_id: "book-1".into(), scope: OcrScope::EntireBook, status: OcrJobStatus::Running }).unwrap();

        set_job_status(&conn, "ok", OcrJobStatus::Succeeded).unwrap();
        set_job_status(&conn, "bad", OcrJobStatus::Failed).unwrap();

        assert_eq!(get_job(&conn, "ok").unwrap().unwrap().status, OcrJobStatus::Succeeded);
        assert_eq!(get_job(&conn, "bad").unwrap().unwrap().status, OcrJobStatus::Failed);
    }

    #[test]
    fn page_result_round_trips_and_overwrites_in_place() {
        let conn = conn_with_book("book-1");
        assert_eq!(get_page_result(&conn, "book-1", 1).unwrap(), None);

        save_page_result(&conn, "book-1", 1, "raw ocr text v1").unwrap();
        assert_eq!(get_page_result(&conn, "book-1", 1).unwrap(), Some("raw ocr text v1".into()));

        save_page_result(&conn, "book-1", 1, "raw ocr text v2 (re-ran)").unwrap();
        assert_eq!(get_page_result(&conn, "book-1", 1).unwrap(), Some("raw ocr text v2 (re-ran)".into()));
    }

    #[test]
    fn effective_text_is_none_before_any_ocr_has_run_ss13_2_no_pretending() {
        let conn = conn_with_book("book-1");
        assert_eq!(effective_text(&conn, "book-1", 1).unwrap(), None);
    }

    #[test]
    fn effective_text_uses_the_raw_result_when_no_correction_exists() {
        let conn = conn_with_book("book-1");
        save_page_result(&conn, "book-1", 1, "raw ocr text").unwrap();
        assert_eq!(effective_text(&conn, "book-1", 1).unwrap(), Some("raw ocr text".into()));
    }

    #[test]
    fn effective_text_prefers_the_users_correction_over_the_raw_result() {
        let conn = conn_with_book("book-1");
        save_page_result(&conn, "book-1", 1, "raw ocr text with an error").unwrap();
        save_correction(&conn, "book-1", 1, "corrected text").unwrap();
        assert_eq!(effective_text(&conn, "book-1", 1).unwrap(), Some("corrected text".into()));
    }

    /// ROADMAP.md M5 Exit Gate: "Manual corrections survive raw OCR/cache
    /// rebuild and restart." This proves the `rebuild` half; the `restart`
    /// half is proven separately by
    /// `a_correction_survives_closing_and_reopening_the_database_file` --
    /// not assumed here.
    #[test]
    fn a_correction_survives_clearing_the_raw_ocr_cache() {
        let conn = conn_with_book("book-1");
        save_page_result(&conn, "book-1", 1, "raw ocr text with an error").unwrap();
        save_correction(&conn, "book-1", 1, "corrected text").unwrap();

        clear_page_results(&conn, "book-1").unwrap();

        assert_eq!(get_page_result(&conn, "book-1", 1).unwrap(), None, "raw cache must actually be cleared");
        assert_eq!(get_correction(&conn, "book-1", 1).unwrap(), Some("corrected text".into()), "the correction must survive");
        assert_eq!(
            effective_text(&conn, "book-1", 1).unwrap(),
            Some("corrected text".into()),
            "effective text must still resolve to the surviving correction after a cache rebuild"
        );
    }

    /// The `restart` half of the M5 Exit Gate, proven directly against a
    /// real file-backed SQLite database rather than assumed: every other
    /// test in this module uses `Connection::open_in_memory()`, which
    /// cannot actually demonstrate restart survival (an in-memory database
    /// is destroyed the moment its connection is dropped -- the exact
    /// opposite of what this Exit Gate condition claims). This test opens
    /// a real file, saves a correction, closes that connection entirely
    /// (dropping it, the same lifecycle event a process exit produces),
    /// opens a brand new connection to the same file path (the same
    /// lifecycle event a process restart produces), and confirms the
    /// correction is still there through the new connection.
    #[test]
    fn a_correction_survives_closing_and_reopening_the_database_file() {
        let db_path = std::env::temp_dir().join(format!("ebookreader-ocr-restart-test-{}.sqlite3", std::process::id()));
        let _ = std::fs::remove_file(&db_path);

        {
            let conn = Connection::open(&db_path).unwrap();
            run_migrations(&conn).unwrap();
            conn.execute("INSERT INTO book (id, title) VALUES ('book-1', 'Test Book')", []).unwrap();
            save_page_result(&conn, "book-1", 1, "raw ocr text with an error").unwrap();
            save_correction(&conn, "book-1", 1, "corrected text").unwrap();
            assert_eq!(effective_text(&conn, "book-1", 1).unwrap(), Some("corrected text".into()));
        } // conn dropped here -- the same lifecycle event a process exit produces

        {
            let conn = Connection::open(&db_path).unwrap(); // a fresh connection -- the same lifecycle event a process restart produces
            assert_eq!(
                effective_text(&conn, "book-1", 1).unwrap(),
                Some("corrected text".into()),
                "the correction must survive closing and reopening the database file, not just staying alive within one connection"
            );
        }

        std::fs::remove_file(&db_path).ok();
    }

    #[test]
    fn clearing_one_books_cache_does_not_touch_another_books_results_or_corrections() {
        let conn = conn_with_book("book-1");
        conn.execute("INSERT INTO book (id, title) VALUES ('book-2', 'Other Book')", []).unwrap();
        save_page_result(&conn, "book-1", 1, "book 1 raw text").unwrap();
        save_page_result(&conn, "book-2", 1, "book 2 raw text").unwrap();
        save_correction(&conn, "book-2", 1, "book 2 correction").unwrap();

        clear_page_results(&conn, "book-1").unwrap();

        assert_eq!(get_page_result(&conn, "book-1", 1).unwrap(), None);
        assert_eq!(get_page_result(&conn, "book-2", 1).unwrap(), Some("book 2 raw text".into()));
        assert_eq!(get_correction(&conn, "book-2", 1).unwrap(), Some("book 2 correction".into()));
    }
}
