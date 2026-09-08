//! Actual Reading Time (`PRODUCT_SPEC.md` SS10): factual elapsed reading
//! time, structurally independent of Book Hours (SS3.6 -- "Expected
//! workload is not factual historical duration"). This module only ever
//! *adds* real elapsed durations; nothing here estimates or fabricates.
//!
//! Per SS10, "OS lock/sleep always pauses" is the one exclusion V1 wires
//! through end-to-end (`reading_session_hook`'s excluded-time tracking).
//! The other three Settings policies SS10 names (Pause When App Is in
//! Background, Auto-pause After 5 Minutes Inactivity, Count Note-taking
//! as Reading Time) need window-focus and user-input-idle detection this
//! checkpoint does not yet build -- an explicit residual, not a silent
//! gap: V1 currently *undercounts pauses* (time is attributed as active
//! reading more often than the full policy set would allow) rather than
//! ever fabricating time, which is the direction SS10's "never fabricate"
//! principle actually constrains.

use std::time::Duration;

/// Given the wall-clock time a Book's Reader was open and the amount of
/// that same interval the app's ReadingSession was paused (OS lock/
/// sleep), returns the actual active reading duration to record. Never
/// negative even if `excluded` is (defensively) larger than `elapsed`.
pub fn active_duration(elapsed: Duration, excluded_during_interval: Duration) -> Duration {
    elapsed.saturating_sub(excluded_during_interval)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, serde::Serialize)]
pub struct ActualReadingTime {
    pub total: Duration,
}

impl ActualReadingTime {
    pub fn new(total: Duration) -> Self {
        Self { total }
    }

    /// Record a real elapsed reading interval, net of any OS lock/sleep
    /// exclusion during it. Never subtracts below zero for the interval
    /// itself, and only ever accumulates (SS10 facts are never rewound).
    pub fn record(&mut self, elapsed: Duration, excluded_during_interval: Duration) {
        self.total += active_duration(elapsed, excluded_during_interval);
    }
}

/// Load a Book's accumulated Actual Reading Time (zero if never recorded).
pub fn load_actual_reading_time(
    conn: &rusqlite::Connection,
    book_id: &str,
) -> rusqlite::Result<ActualReadingTime> {
    use rusqlite::OptionalExtension;
    let seconds: Option<f64> = conn
        .query_row(
            "SELECT total_seconds FROM actual_reading_time WHERE book_id = ?1",
            [book_id],
            |row| row.get(0),
        )
        .optional()?;
    Ok(ActualReadingTime::new(Duration::from_secs_f64(seconds.unwrap_or(0.0).max(0.0))))
}

/// Persist a Book's accumulated Actual Reading Time. Always a monotonic
/// increase from the caller's perspective (SS10 facts are never
/// rewound) -- this function itself just stores whatever total it's
/// given, since enforcing "only ever grows" is `ActualReadingTime::record`'s
/// job, not the persistence layer's.
pub fn save_actual_reading_time(
    conn: &rusqlite::Connection,
    book_id: &str,
    art: &ActualReadingTime,
) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO actual_reading_time (book_id, total_seconds) VALUES (?1, ?2)
         ON CONFLICT(book_id) DO UPDATE SET total_seconds = excluded.total_seconds",
        (book_id, art.total.as_secs_f64()),
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn conn_with_book(book_id: &str) -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        crate::store::run_migrations(&conn).unwrap();
        conn.execute("INSERT INTO book (id, title) VALUES (?1, 'Test Book')", [book_id]).unwrap();
        conn
    }

    #[test]
    fn loading_a_book_with_no_recorded_time_returns_zero() {
        let conn = conn_with_book("book-1");
        assert_eq!(load_actual_reading_time(&conn, "book-1").unwrap(), ActualReadingTime::default());
    }

    #[test]
    fn save_then_load_round_trips() {
        let conn = conn_with_book("book-1");
        let art = ActualReadingTime::new(Duration::from_secs(3725));
        save_actual_reading_time(&conn, "book-1", &art).unwrap();
        assert_eq!(load_actual_reading_time(&conn, "book-1").unwrap(), art);
    }

    #[test]
    fn saving_again_updates_in_place_and_can_only_grow_via_record() {
        let conn = conn_with_book("book-1");
        let mut art = load_actual_reading_time(&conn, "book-1").unwrap();
        art.record(Duration::from_secs(60), Duration::ZERO);
        save_actual_reading_time(&conn, "book-1", &art).unwrap();

        let mut art = load_actual_reading_time(&conn, "book-1").unwrap();
        art.record(Duration::from_secs(120), Duration::from_secs(10));
        save_actual_reading_time(&conn, "book-1", &art).unwrap();

        let loaded = load_actual_reading_time(&conn, "book-1").unwrap();
        assert_eq!(loaded.total, Duration::from_secs(60 + 110));

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM actual_reading_time WHERE book_id = 'book-1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn active_duration_subtracts_the_excluded_time() {
        let active = active_duration(Duration::from_secs(60), Duration::from_secs(15));
        assert_eq!(active, Duration::from_secs(45));
    }

    #[test]
    fn active_duration_never_goes_negative() {
        let active = active_duration(Duration::from_secs(10), Duration::from_secs(30));
        assert_eq!(active, Duration::ZERO);
    }

    #[test]
    fn recording_accumulates_across_multiple_intervals() {
        let mut art = ActualReadingTime::default();
        art.record(Duration::from_secs(60), Duration::from_secs(0));
        art.record(Duration::from_secs(120), Duration::from_secs(20));

        assert_eq!(art.total, Duration::from_secs(60 + 100));
    }

    #[test]
    fn a_fully_excluded_interval_adds_nothing() {
        let mut art = ActualReadingTime::default();
        art.record(Duration::from_secs(300), Duration::from_secs(300));
        assert_eq!(art.total, Duration::ZERO);
    }
}
