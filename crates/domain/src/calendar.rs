//! Calendar (`PRODUCT_SPEC.md` SS15, `DESIGN.md` SS13, canonical surface
//! `ER-CAL-001`): "What did I plan, and what reading actually happened?"
//!
//! Two structurally separate ledgers, matching the same fact/estimate
//! split `[[actual_reading_time]]`/`[[book_hours]]` already established:
//!
//! - `daily_reading_time`: a day-keyed *aggregate* of real elapsed active
//!   reading seconds across all Books, accumulated by the same
//!   `active_duration` computation the per-book Actual Reading Time
//!   ledger uses (never a second, divergent source of truth for what
//!   counts as active time -- only a different grouping of it: by day
//!   instead of by book). This module never estimates or fabricates a
//!   day's total; it only ever adds real elapsed durations, exactly like
//!   `actual_reading_time::ActualReadingTime::record`.
//! - `daily_goal_history`: the lightweight reading goal (ROADMAP.md M6
//!   "lightweight goals" / PRODUCT_SPEC.md SS15 "Planned Book Hours" on
//!   the Calendar day-view -- V1 keeps this to one number, a daily
//!   reading-time target, not a per-book due-date/pacing engine, which
//!   nothing in frozen PRODUCT_SPEC defines). Append-only, keyed by the
//!   day a value became effective, so a past day's "planned" figure is
//!   whatever goal was in effect *on that day* -- not silently
//!   recomputed with today's current goal. This is what keeps historical
//!   reporting explainable (ROADMAP.md M6 Success Evidence) without
//!   building a full versioned-estimate system SS9.3 describes for Book
//!   Hours specifically.
//!
//! Days are plain `YYYY-MM-DD` strings, supplied by the caller (the
//! Reader's heartbeat, which knows the user's local wall-clock date) --
//! this module has no timezone opinion of its own, deliberately: a
//! desktop app's "today" is whatever the OS says it is, not a
//! server-computed UTC day that could silently disagree with the user's
//! own calendar.

use std::time::Duration;

/// Add a real elapsed active-reading duration to `day`'s aggregate total.
/// Never subtracts, never estimates -- mirrors
/// `[[actual_reading_time]]`'s own accumulate-only discipline for the
/// same underlying fact, just grouped by day instead of by Book.
pub fn record_daily_reading_time(conn: &rusqlite::Connection, day: &str, active: Duration) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO daily_reading_time (day, seconds) VALUES (?1, ?2)
         ON CONFLICT(day) DO UPDATE SET seconds = seconds + excluded.seconds",
        (day, active.as_secs_f64()),
    )?;
    Ok(())
}

/// A single day's actual reading total, in seconds. Zero for a day with
/// no recorded reading.
pub fn load_daily_reading_time(conn: &rusqlite::Connection, day: &str) -> rusqlite::Result<f64> {
    use rusqlite::OptionalExtension;
    let seconds: Option<f64> = conn
        .query_row("SELECT seconds FROM daily_reading_time WHERE day = ?1", [day], |row| row.get(0))
        .optional()?;
    Ok(seconds.unwrap_or(0.0))
}

/// Every day with recorded reading activity in `[start_day, end_day]`
/// (inclusive, both `YYYY-MM-DD`), for populating a calendar month's
/// activity dots in one query rather than one round-trip per day.
pub fn load_reading_time_in_range(
    conn: &rusqlite::Connection,
    start_day: &str,
    end_day: &str,
) -> rusqlite::Result<Vec<(String, f64)>> {
    let mut stmt = conn.prepare(
        "SELECT day, seconds FROM daily_reading_time WHERE day >= ?1 AND day <= ?2 ORDER BY day ASC",
    )?;
    let rows = stmt.query_map((start_day, end_day), |row| Ok((row.get(0)?, row.get(1)?)))?;
    rows.collect()
}

/// Set the lightweight daily reading goal, effective from `effective_day`
/// onward. Recorded as a new history row (or replacing the row already
/// at that exact day, if the goal is changed more than once on the same
/// day) rather than overwriting a single "current value" cell -- this is
/// precisely what lets a past day's planned figure stay stable even
/// after the goal is later changed.
pub fn set_daily_goal(conn: &rusqlite::Connection, effective_day: &str, seconds: f64) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO daily_goal_history (effective_day, seconds) VALUES (?1, ?2)
         ON CONFLICT(effective_day) DO UPDATE SET seconds = excluded.seconds",
        (effective_day, seconds),
    )?;
    Ok(())
}

/// The lightweight daily reading goal in effect on `day`: the most
/// recent goal set on or before `day`, or `None` if no goal has ever
/// been set that early. A goal set *after* `day` never applies to it --
/// this is the explainability guarantee: querying the same past day
/// always returns the same answer, regardless of when the goal is later
/// changed.
pub fn goal_in_effect_on(conn: &rusqlite::Connection, day: &str) -> rusqlite::Result<Option<f64>> {
    use rusqlite::OptionalExtension;
    conn.query_row(
        "SELECT seconds FROM daily_goal_history WHERE effective_day <= ?1 ORDER BY effective_day DESC LIMIT 1",
        [day],
        |row| row.get(0),
    )
    .optional()
}

/// One day's Calendar detail: actual reading time recorded, and the
/// planned/goal figure that was in effect on that day.
#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize)]
pub struct DayDetail {
    pub actual_seconds: f64,
    pub planned_seconds: Option<f64>,
}

pub fn load_day_detail(conn: &rusqlite::Connection, day: &str) -> rusqlite::Result<DayDetail> {
    Ok(DayDetail {
        actual_seconds: load_daily_reading_time(conn, day)?,
        planned_seconds: goal_in_effect_on(conn, day)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        crate::store::run_migrations(&conn).unwrap();
        conn
    }

    #[test]
    fn a_day_with_no_recorded_reading_is_zero() {
        let conn = conn();
        assert_eq!(load_daily_reading_time(&conn, "2026-09-09").unwrap(), 0.0);
    }

    #[test]
    fn recording_accumulates_across_multiple_calls_on_the_same_day() {
        let conn = conn();
        record_daily_reading_time(&conn, "2026-09-09", Duration::from_secs(600)).unwrap();
        record_daily_reading_time(&conn, "2026-09-09", Duration::from_secs(300)).unwrap();
        assert_eq!(load_daily_reading_time(&conn, "2026-09-09").unwrap(), 900.0);
    }

    #[test]
    fn different_days_are_tracked_independently() {
        let conn = conn();
        record_daily_reading_time(&conn, "2026-09-09", Duration::from_secs(600)).unwrap();
        record_daily_reading_time(&conn, "2026-09-10", Duration::from_secs(60)).unwrap();
        assert_eq!(load_daily_reading_time(&conn, "2026-09-09").unwrap(), 600.0);
        assert_eq!(load_daily_reading_time(&conn, "2026-09-10").unwrap(), 60.0);
    }

    #[test]
    fn range_query_returns_only_days_with_activity_in_order() {
        let conn = conn();
        record_daily_reading_time(&conn, "2026-09-03", Duration::from_secs(60)).unwrap();
        record_daily_reading_time(&conn, "2026-09-01", Duration::from_secs(30)).unwrap();
        record_daily_reading_time(&conn, "2026-10-01", Duration::from_secs(90)).unwrap(); // out of range

        let rows = load_reading_time_in_range(&conn, "2026-09-01", "2026-09-30").unwrap();
        assert_eq!(rows, vec![("2026-09-01".to_string(), 30.0), ("2026-09-03".to_string(), 60.0)]);
    }

    #[test]
    fn no_goal_ever_set_returns_none() {
        let conn = conn();
        assert_eq!(goal_in_effect_on(&conn, "2026-09-09").unwrap(), None);
    }

    #[test]
    fn a_goal_applies_from_its_effective_day_onward() {
        let conn = conn();
        set_daily_goal(&conn, "2026-09-05", 3600.0).unwrap();

        assert_eq!(goal_in_effect_on(&conn, "2026-09-04").unwrap(), None, "before the goal existed");
        assert_eq!(goal_in_effect_on(&conn, "2026-09-05").unwrap(), Some(3600.0));
        assert_eq!(goal_in_effect_on(&conn, "2026-09-09").unwrap(), Some(3600.0), "still in effect later");
    }

    #[test]
    fn changing_the_goal_does_not_retroactively_alter_a_past_days_planned_figure() {
        let conn = conn();
        set_daily_goal(&conn, "2026-09-01", 1800.0).unwrap();
        set_daily_goal(&conn, "2026-09-08", 3600.0).unwrap();

        assert_eq!(
            goal_in_effect_on(&conn, "2026-09-05").unwrap(),
            Some(1800.0),
            "a day before the change must keep seeing the goal that was actually in effect then"
        );
        assert_eq!(goal_in_effect_on(&conn, "2026-09-08").unwrap(), Some(3600.0));
    }

    #[test]
    fn setting_the_goal_again_on_the_same_effective_day_replaces_it_rather_than_duplicating() {
        let conn = conn();
        set_daily_goal(&conn, "2026-09-05", 1800.0).unwrap();
        set_daily_goal(&conn, "2026-09-05", 2700.0).unwrap();
        assert_eq!(goal_in_effect_on(&conn, "2026-09-05").unwrap(), Some(2700.0));

        let count: i64 = conn.query_row("SELECT COUNT(*) FROM daily_goal_history", [], |r| r.get(0)).unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn day_detail_combines_actual_and_planned() {
        let conn = conn();
        record_daily_reading_time(&conn, "2026-09-09", Duration::from_secs(3120)).unwrap();
        set_daily_goal(&conn, "2026-09-01", 5400.0).unwrap();

        let detail = load_day_detail(&conn, "2026-09-09").unwrap();
        assert_eq!(detail, DayDetail { actual_seconds: 3120.0, planned_seconds: Some(5400.0) });
    }

    #[test]
    fn day_detail_with_no_goal_set_has_none_planned_but_still_reports_actual() {
        let conn = conn();
        record_daily_reading_time(&conn, "2026-09-09", Duration::from_secs(120)).unwrap();

        let detail = load_day_detail(&conn, "2026-09-09").unwrap();
        assert_eq!(detail, DayDetail { actual_seconds: 120.0, planned_seconds: None });
    }
}
