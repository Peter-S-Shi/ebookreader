//! Book Hours (`PRODUCT_SPEC.md` SS9): an *estimate* of expected reading
//! workload, structurally independent of Actual Reading Time (SS3.6,
//! `actual_reading_time` module) -- nothing in this module reads or
//! writes anything Actual-Reading-Time-related, which is itself how "must
//! not rewrite Actual Reading Time" (SS9.3) is enforced: there is no path
//! by which recomputing an estimate here could touch factual history.

/// SS9.1 frozen algorithm.
pub fn base_book_hours(quantity: f64, baseline_speed: f64, difficulty_coefficient: f64) -> f64 {
    if baseline_speed <= 0.0 {
        return 0.0;
    }
    (quantity / baseline_speed) * difficulty_coefficient
}

/// SS9.2 frozen algorithm.
pub fn cumulative_book_hours(base_book_hours: f64, cumulative_reading_percent: f64) -> f64 {
    base_book_hours * (cumulative_reading_percent / 100.0)
}

/// The inputs behind a Book's current Base Book Hours estimate. Per
/// SS9.3 "versioned/explainable": this is the *current* config; a full
/// per-revision history feeds the Calendar's estimate-snapshot needs
/// (SS9.3's last sentence) and is M6 scope, not this checkpoint.
#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize)]
pub struct WorkloadConfig {
    pub quantity: f64,
    pub baseline_speed: f64,
    pub difficulty_coefficient: f64,
}

impl WorkloadConfig {
    pub fn base_book_hours(&self) -> f64 {
        base_book_hours(self.quantity, self.baseline_speed, self.difficulty_coefficient)
    }
}

/// Save (insert or update) a Book's current workload config. Per SS9.3,
/// this only ever changes the *current* estimate inputs -- it has no
/// access to, and therefore cannot rewrite, Actual Reading Time.
pub fn save_workload_config(
    conn: &rusqlite::Connection,
    book_id: &str,
    config: &WorkloadConfig,
) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO workload_config (book_id, quantity, baseline_speed, difficulty_coefficient)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(book_id) DO UPDATE SET
             quantity = excluded.quantity,
             baseline_speed = excluded.baseline_speed,
             difficulty_coefficient = excluded.difficulty_coefficient",
        (book_id, config.quantity, config.baseline_speed, config.difficulty_coefficient),
    )?;
    Ok(())
}

/// Load a Book's current workload config, if one has been set.
pub fn load_workload_config(
    conn: &rusqlite::Connection,
    book_id: &str,
) -> rusqlite::Result<Option<WorkloadConfig>> {
    use rusqlite::OptionalExtension;
    conn.query_row(
        "SELECT quantity, baseline_speed, difficulty_coefficient FROM workload_config WHERE book_id = ?1",
        [book_id],
        |row| {
            Ok(WorkloadConfig {
                quantity: row.get(0)?,
                baseline_speed: row.get(1)?,
                difficulty_coefficient: row.get(2)?,
            })
        },
    )
    .optional()
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
    fn loading_an_unconfigured_book_returns_none() {
        let conn = conn_with_book("book-1");
        assert_eq!(load_workload_config(&conn, "book-1").unwrap(), None);
    }

    #[test]
    fn save_then_load_round_trips() {
        let conn = conn_with_book("book-1");
        let config = WorkloadConfig { quantity: 80_000.0, baseline_speed: 250.0, difficulty_coefficient: 1.1 };
        save_workload_config(&conn, "book-1", &config).unwrap();
        assert_eq!(load_workload_config(&conn, "book-1").unwrap(), Some(config));
    }

    #[test]
    fn saving_again_updates_in_place() {
        let conn = conn_with_book("book-1");
        save_workload_config(
            &conn,
            "book-1",
            &WorkloadConfig { quantity: 1000.0, baseline_speed: 200.0, difficulty_coefficient: 1.0 },
        )
        .unwrap();
        save_workload_config(
            &conn,
            "book-1",
            &WorkloadConfig { quantity: 2000.0, baseline_speed: 200.0, difficulty_coefficient: 1.0 },
        )
        .unwrap();

        let loaded = load_workload_config(&conn, "book-1").unwrap().unwrap();
        assert_eq!(loaded.quantity, 2000.0);

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM workload_config WHERE book_id = 'book-1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn base_book_hours_matches_the_frozen_formula() {
        // 50,000 words / 250 wpm = 200 minutes-equivalent-units * 1.2 difficulty
        assert_eq!(base_book_hours(50_000.0, 250.0, 1.2), 240.0);
    }

    #[test]
    fn base_book_hours_is_zero_for_a_non_positive_baseline_speed_rather_than_dividing_by_zero() {
        assert_eq!(base_book_hours(1000.0, 0.0, 1.0), 0.0);
    }

    #[test]
    fn cumulative_book_hours_matches_the_frozen_formula() {
        assert_eq!(cumulative_book_hours(10.0, 50.0), 5.0);
    }

    #[test]
    fn cumulative_book_hours_can_exceed_base_hours_after_a_reread() {
        // completed once + halfway through a second read = 150% cumulative
        assert_eq!(cumulative_book_hours(10.0, 150.0), 15.0);
    }

    #[test]
    fn workload_config_base_book_hours_matches_the_free_function() {
        let config = WorkloadConfig { quantity: 300.0, baseline_speed: 200.0, difficulty_coefficient: 1.0 };
        assert_eq!(config.base_book_hours(), base_book_hours(300.0, 200.0, 1.0));
    }
}
