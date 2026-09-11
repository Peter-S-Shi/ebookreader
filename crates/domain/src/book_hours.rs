//! Book Hours (`PRODUCT_SPEC.md` §9 & BH-0.2 canonical model): an *estimate* of expected
//! reading workload, structurally independent of Actual Reading Time (§3.6,
//! `actual_reading_time` module).
//!
//! Formula:
//!   Planned Book Hours = (Quantity / Baseline Speed) × Difficulty
//!   Current Book Hours = Planned Book Hours × (Cumulative Reading % / 100)
//!
//! Reading Profiles own Difficulty Coefficient only. Baseline speeds resolve from
//! unit-specific global defaults or per-Book speed overrides.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

/// §9.1 frozen algorithm.
pub fn base_book_hours(quantity: f64, baseline_speed: f64, difficulty_coefficient: f64) -> f64 {
    if baseline_speed <= 0.0 {
        return 0.0;
    }
    (quantity / baseline_speed) * difficulty_coefficient
}

/// §9.2 frozen algorithm.
pub fn cumulative_book_hours(base_book_hours: f64, cumulative_reading_percent: f64) -> f64 {
    base_book_hours * (cumulative_reading_percent / 100.0)
}

/// A Reading Profile represents a reading difficulty category.
/// Per BH-0.2: A profile owns *only* the difficulty multiplier and identity metadata.
/// Baseline speed and quantity units are decoupled from profiles.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ReadingProfile {
    pub id: String,
    pub name: String,
    pub difficulty_multiplier: f64,
    pub description: String,
    pub is_default: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// Supported workload quantity units.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum QuantityUnit {
    Pages,
    Words,
    Characters,
    LegacyUntyped,
}

impl QuantityUnit {
    pub fn as_str(&self) -> &'static str {
        match self {
            QuantityUnit::Pages => "pages",
            QuantityUnit::Words => "words",
            QuantityUnit::Characters => "characters",
            QuantityUnit::LegacyUntyped => "legacy_untyped",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "pages" => Some(QuantityUnit::Pages),
            "words" => Some(QuantityUnit::Words),
            "characters" => Some(QuantityUnit::Characters),
            "legacy_untyped" => Some(QuantityUnit::LegacyUntyped),
            _ => None,
        }
    }
}

/// Configurable global baseline reading speeds per quantity unit.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct GlobalBookHoursDefaults {
    pub pages_per_hour: f64,
    pub words_per_hour: f64,
    pub characters_per_hour: f64,
}

impl Default for GlobalBookHoursDefaults {
    fn default() -> Self {
        Self {
            pages_per_hour: 60.0,
            words_per_hour: 15_000.0,
            characters_per_hour: 30_000.0,
        }
    }
}

impl GlobalBookHoursDefaults {
    pub fn resolve_baseline_speed(&self, unit: &QuantityUnit, speed_override: Option<f64>) -> Option<f64> {
        if let Some(speed) = speed_override {
            if speed > 0.0 {
                return Some(speed);
            }
        }
        match unit {
            QuantityUnit::Pages => Some(self.pages_per_hour),
            QuantityUnit::Words => Some(self.words_per_hour),
            QuantityUnit::Characters => Some(self.characters_per_hour),
            QuantityUnit::LegacyUntyped => None, // legacy_untyped must have an override to calculate
        }
    }
}

/// Book-level workload setup parameters.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BookWorkloadSetup {
    pub profile_id: Option<String>,
    pub quantity: Option<f64>,
    pub unit: Option<QuantityUnit>,
    pub speed_override: Option<f64>,
}

/// Calculated Book Hours result for a single book.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BookHoursCalculation {
    pub planned_book_hours: f64,
    pub current_book_hours: f64,
    pub cumulative_percent: f64,
    pub baseline_speed: f64,
    pub difficulty_multiplier: f64,
}

/// Pure calculation function for Book Hours.
pub fn calculate_book_hours(
    quantity: Option<f64>,
    unit: Option<QuantityUnit>,
    speed_override: Option<f64>,
    profile: Option<&ReadingProfile>,
    defaults: &GlobalBookHoursDefaults,
    cumulative_percent: f64,
) -> Option<BookHoursCalculation> {
    let q = quantity?;
    let u = unit?;
    if q <= 0.0 {
        return None;
    }
    let baseline_speed = defaults.resolve_baseline_speed(&u, speed_override)?;
    if baseline_speed <= 0.0 {
        return None;
    }
    let difficulty = profile.map(|p| p.difficulty_multiplier).unwrap_or(1.0);
    if difficulty <= 0.0 {
        return None;
    }
    let planned = (q / baseline_speed) * difficulty;
    let current = planned * (cumulative_percent / 100.0);
    Some(BookHoursCalculation {
        planned_book_hours: planned,
        current_book_hours: current,
        cumulative_percent,
        baseline_speed,
        difficulty_multiplier: difficulty,
    })
}

// ---------------------------------------------------------------------------
// Reading Profile CRUD
// ---------------------------------------------------------------------------

pub fn create_reading_profile(
    conn: &Connection,
    id: &str,
    name: &str,
    difficulty_multiplier: f64,
    description: &str,
    is_default: bool,
    created_at: &str,
) -> rusqlite::Result<ReadingProfile> {
    conn.execute(
        "INSERT INTO reading_profiles (id, name, difficulty_multiplier, description, is_default, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
        params![id, name, difficulty_multiplier, description, if is_default { 1 } else { 0 }, created_at],
    )?;
    Ok(ReadingProfile {
        id: id.to_string(),
        name: name.to_string(),
        difficulty_multiplier,
        description: description.to_string(),
        is_default,
        created_at: created_at.to_string(),
        updated_at: created_at.to_string(),
    })
}

pub fn get_reading_profile(conn: &Connection, id: &str) -> rusqlite::Result<Option<ReadingProfile>> {
    conn.query_row(
        "SELECT id, name, difficulty_multiplier, description, is_default, created_at, updated_at
         FROM reading_profiles WHERE id = ?1",
        [id],
        |row| {
            Ok(ReadingProfile {
                id: row.get(0)?,
                name: row.get(1)?,
                difficulty_multiplier: row.get(2)?,
                description: row.get(3)?,
                is_default: row.get::<_, i32>(4)? != 0,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        },
    )
    .optional()
}

pub fn get_default_reading_profile(conn: &Connection) -> rusqlite::Result<Option<ReadingProfile>> {
    conn.query_row(
        "SELECT id, name, difficulty_multiplier, description, is_default, created_at, updated_at
         FROM reading_profiles WHERE is_default = 1 LIMIT 1",
        [],
        |row| {
            Ok(ReadingProfile {
                id: row.get(0)?,
                name: row.get(1)?,
                difficulty_multiplier: row.get(2)?,
                description: row.get(3)?,
                is_default: true,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        },
    )
    .optional()
}

pub fn list_reading_profiles(conn: &Connection) -> rusqlite::Result<Vec<ReadingProfile>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, difficulty_multiplier, description, is_default, created_at, updated_at
         FROM reading_profiles
         ORDER BY is_default DESC, name ASC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(ReadingProfile {
            id: row.get(0)?,
            name: row.get(1)?,
            difficulty_multiplier: row.get(2)?,
            description: row.get(3)?,
            is_default: row.get::<_, i32>(4)? != 0,
            created_at: row.get(5)?,
            updated_at: row.get(6)?,
        })
    })?;
    rows.collect()
}

pub fn update_reading_profile(
    conn: &Connection,
    id: &str,
    name: &str,
    difficulty_multiplier: f64,
    description: &str,
    updated_at: &str,
) -> rusqlite::Result<Option<ReadingProfile>> {
    let affected = conn.execute(
        "UPDATE reading_profiles
         SET name = ?1, difficulty_multiplier = ?2, description = ?3, updated_at = ?4
         WHERE id = ?5",
        params![name, difficulty_multiplier, description, updated_at, id],
    )?;
    if affected == 0 {
        return Ok(None);
    }
    get_reading_profile(conn, id)
}

pub fn delete_reading_profile(conn: &Connection, id: &str) -> rusqlite::Result<bool> {
    // Cannot delete the default profile
    let is_default: bool = conn
        .query_row(
            "SELECT is_default FROM reading_profiles WHERE id = ?1",
            [id],
            |row| Ok(row.get::<_, i32>(0)? != 0),
        )
        .optional()?
        .unwrap_or(false);

    if is_default {
        return Ok(false);
    }

    // Reassign books referencing this profile to default profile
    conn.execute(
        "UPDATE book SET profile_id = 'profile-default' WHERE profile_id = ?1",
        [id],
    )?;

    let affected = conn.execute("DELETE FROM reading_profiles WHERE id = ?1", [id])?;
    Ok(affected > 0)
}

// ---------------------------------------------------------------------------
// Book Workload Setup Operations
// ---------------------------------------------------------------------------

pub fn get_book_workload(conn: &Connection, book_id: &str) -> rusqlite::Result<Option<BookWorkloadSetup>> {
    conn.query_row(
        "SELECT profile_id, workload_quantity, workload_unit, workload_speed_override FROM book WHERE id = ?1",
        [book_id],
        |row| {
            let profile_id: Option<String> = row.get(0)?;
            let quantity: Option<f64> = row.get(1)?;
            let unit_str: Option<String> = row.get(2)?;
            let speed_override: Option<f64> = row.get(3)?;
            let unit = unit_str.as_deref().and_then(QuantityUnit::from_str);
            Ok(BookWorkloadSetup {
                profile_id,
                quantity,
                unit,
                speed_override,
            })
        },
    )
    .optional()
}

pub fn set_book_workload(
    conn: &Connection,
    book_id: &str,
    setup: &BookWorkloadSetup,
) -> rusqlite::Result<()> {
    let unit_str = setup.unit.map(|u| u.as_str());
    conn.execute(
        "UPDATE book SET profile_id = ?1, workload_quantity = ?2, workload_unit = ?3, workload_speed_override = ?4 WHERE id = ?5",
        params![
            &setup.profile_id,
            setup.quantity,
            unit_str,
            setup.speed_override,
            book_id,
        ],
    )?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Aggregation & Overview
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CalculationCoverage {
    pub calculated_books: usize,
    pub uncalculated_books: usize,
    pub total_books: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProfileBookHoursSummary {
    pub profile_id: String,
    pub profile_name: String,
    pub difficulty_multiplier: f64,
    pub is_default: bool,
    pub total_planned_hours: f64,
    pub total_current_hours: f64,
    pub coverage: CalculationCoverage,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CollectionBookHoursSummary {
    pub collection_id: String,
    pub collection_name: String,
    pub total_planned_hours: f64,
    pub total_current_hours: f64,
    pub coverage: CalculationCoverage,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BookHoursOverview {
    pub total_planned_hours: f64,
    pub total_current_hours: f64,
    pub global_coverage: CalculationCoverage,
    pub profiles: Vec<ProfileBookHoursSummary>,
    pub collections: Vec<CollectionBookHoursSummary>,
}

struct BookRecord {
    id: String,
    profile_id: Option<String>,
    quantity: Option<f64>,
    unit: Option<QuantityUnit>,
    speed_override: Option<f64>,
    cumulative_percent: f64,
}

pub fn compute_book_hours_overview(
    conn: &Connection,
    defaults: &GlobalBookHoursDefaults,
) -> rusqlite::Result<BookHoursOverview> {
    // 1. Load profiles into map
    let profiles = list_reading_profiles(conn)?;
    let profile_map: std::collections::HashMap<String, ReadingProfile> = profiles
        .into_iter()
        .map(|p| (p.id.clone(), p))
        .collect();

    // 2. Load all active books with progress
    let mut stmt = conn.prepare(
        "SELECT b.id, b.profile_id, b.workload_quantity, b.workload_unit, b.workload_speed_override,
                COALESCE(
                    rp.completed_read_count * 100.0 + (CASE WHEN rp.active_read_in_progress != 0 THEN rp.active_pass_progress ELSE 0.0 END),
                    0.0
                )
         FROM book b
         LEFT JOIN reading_progress rp ON rp.book_id = b.id
         WHERE b.library_status = 'active'",
    )?;

    let book_rows = stmt.query_map([], |row| {
        let id: String = row.get(0)?;
        let profile_id: Option<String> = row.get(1)?;
        let quantity: Option<f64> = row.get(2)?;
        let unit_str: Option<String> = row.get(3)?;
        let speed_override: Option<f64> = row.get(4)?;
        let cumulative_percent: f64 = row.get(5)?;
        let unit = unit_str.as_deref().and_then(QuantityUnit::from_str);
        Ok(BookRecord {
            id,
            profile_id,
            quantity,
            unit,
            speed_override,
            cumulative_percent,
        })
    })?;

    let mut books = Vec::new();
    for b in book_rows {
        books.push(b?);
    }

    // 3. Calculate per book
    let mut book_calc_map: std::collections::HashMap<String, Option<BookHoursCalculation>> =
        std::collections::HashMap::new();

    let mut global_planned = 0.0;
    let mut global_current = 0.0;
    let mut global_calculated = 0;
    let mut global_uncalculated = 0;

    for b in &books {
        let prof = b.profile_id.as_deref().and_then(|pid| profile_map.get(pid));
        let calc = calculate_book_hours(
            b.quantity,
            b.unit,
            b.speed_override,
            prof,
            defaults,
            b.cumulative_percent,
        );
        if let Some(ref c) = calc {
            global_planned += c.planned_book_hours;
            global_current += c.current_book_hours;
            global_calculated += 1;
        } else {
            global_uncalculated += 1;
        }
        book_calc_map.insert(b.id.clone(), calc);
    }

    let global_coverage = CalculationCoverage {
        calculated_books: global_calculated,
        uncalculated_books: global_uncalculated,
        total_books: books.len(),
    };

    // 4. Summaries by Profile
    let mut profile_summaries = Vec::new();
    for (pid, prof) in &profile_map {
        let mut p_planned = 0.0;
        let mut p_current = 0.0;
        let mut p_calc = 0;
        let mut p_uncalc = 0;
        let mut p_total = 0;

        for b in &books {
            if b.profile_id.as_deref() == Some(pid.as_str()) {
                p_total += 1;
                if let Some(Some(ref c)) = book_calc_map.get(&b.id) {
                    p_planned += c.planned_book_hours;
                    p_current += c.current_book_hours;
                    p_calc += 1;
                } else {
                    p_uncalc += 1;
                }
            }
        }

        profile_summaries.push(ProfileBookHoursSummary {
            profile_id: pid.clone(),
            profile_name: prof.name.clone(),
            difficulty_multiplier: prof.difficulty_multiplier,
            is_default: prof.is_default,
            total_planned_hours: p_planned,
            total_current_hours: p_current,
            coverage: CalculationCoverage {
                calculated_books: p_calc,
                uncalculated_books: p_uncalc,
                total_books: p_total,
            },
        });
    }
    profile_summaries.sort_by(|a, b| b.is_default.cmp(&a.is_default).then_with(|| a.profile_name.cmp(&b.profile_name)));

    // 5. Summaries by Collection
    let mut coll_stmt = conn.prepare("SELECT id, name FROM collection ORDER BY name ASC")?;
    let coll_rows = coll_stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;

    let mut coll_summaries = Vec::new();
    for c in coll_rows {
        let (coll_id, coll_name) = c?;
        let mut member_stmt = conn.prepare("SELECT book_id FROM book_collection WHERE collection_id = ?1")?;
        let member_rows = member_stmt.query_map([&coll_id], |row| row.get::<_, String>(0))?;

        let mut c_planned = 0.0;
        let mut c_current = 0.0;
        let mut c_calc = 0;
        let mut c_uncalc = 0;
        let mut c_total = 0;

        for m in member_rows {
            let book_id = m?;
            if let Some(calc_opt) = book_calc_map.get(&book_id) {
                c_total += 1;
                if let Some(ref c) = calc_opt {
                    c_planned += c.planned_book_hours;
                    c_current += c.current_book_hours;
                    c_calc += 1;
                } else {
                    c_uncalc += 1;
                }
            }
        }

        coll_summaries.push(CollectionBookHoursSummary {
            collection_id: coll_id,
            collection_name: coll_name,
            total_planned_hours: c_planned,
            total_current_hours: c_current,
            coverage: CalculationCoverage {
                calculated_books: c_calc,
                uncalculated_books: c_uncalc,
                total_books: c_total,
            },
        });
    }

    Ok(BookHoursOverview {
        total_planned_hours: global_planned,
        total_current_hours: global_current,
        global_coverage,
        profiles: profile_summaries,
        collections: coll_summaries,
    })
}

// ---------------------------------------------------------------------------
// Backward-Compatibility WorkloadConfig APIs
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
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

pub fn save_workload_config(
    conn: &Connection,
    book_id: &str,
    config: &WorkloadConfig,
    recorded_at: &str,
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
    conn.execute(
        "INSERT INTO workload_config_revision (book_id, quantity, baseline_speed, difficulty_coefficient, recorded_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        (book_id, config.quantity, config.baseline_speed, config.difficulty_coefficient, recorded_at),
    )?;
    Ok(())
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct WorkloadConfigRevision {
    pub quantity: f64,
    pub baseline_speed: f64,
    pub difficulty_coefficient: f64,
    pub recorded_at: String,
}

pub fn list_workload_config_revisions(
    conn: &Connection,
    book_id: &str,
) -> rusqlite::Result<Vec<WorkloadConfigRevision>> {
    let mut stmt = conn.prepare(
        "SELECT quantity, baseline_speed, difficulty_coefficient, recorded_at
         FROM workload_config_revision WHERE book_id = ?1
         ORDER BY id DESC",
    )?;
    let rows = stmt.query_map([book_id], |row| {
        Ok(WorkloadConfigRevision {
            quantity: row.get(0)?,
            baseline_speed: row.get(1)?,
            difficulty_coefficient: row.get(2)?,
            recorded_at: row.get(3)?,
        })
    })?;
    rows.collect()
}

pub fn load_workload_config(
    conn: &Connection,
    book_id: &str,
) -> rusqlite::Result<Option<WorkloadConfig>> {
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

    fn test_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        crate::store::run_migrations(&conn).unwrap();
        conn
    }

    fn conn_with_book(book_id: &str) -> Connection {
        let conn = test_conn();
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
        save_workload_config(&conn, "book-1", &config, "2026-09-09T00:00:00Z").unwrap();
        assert_eq!(load_workload_config(&conn, "book-1").unwrap(), Some(config));
    }

    #[test]
    fn saving_again_updates_the_current_config_in_place() {
        let conn = conn_with_book("book-1");
        save_workload_config(
            &conn,
            "book-1",
            &WorkloadConfig { quantity: 1000.0, baseline_speed: 200.0, difficulty_coefficient: 1.0 },
            "2026-09-09T00:00:00Z",
        )
        .unwrap();
        save_workload_config(
            &conn,
            "book-1",
            &WorkloadConfig { quantity: 2000.0, baseline_speed: 200.0, difficulty_coefficient: 1.0 },
            "2026-09-09T01:00:00Z",
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
    fn saving_again_appends_to_the_revision_history() {
        let conn = conn_with_book("book-1");
        save_workload_config(
            &conn,
            "book-1",
            &WorkloadConfig { quantity: 1000.0, baseline_speed: 200.0, difficulty_coefficient: 1.0 },
            "2026-09-09T00:00:00Z",
        )
        .unwrap();
        save_workload_config(
            &conn,
            "book-1",
            &WorkloadConfig { quantity: 2000.0, baseline_speed: 200.0, difficulty_coefficient: 1.0 },
            "2026-09-09T01:00:00Z",
        )
        .unwrap();

        let revisions = list_workload_config_revisions(&conn, "book-1").unwrap();
        assert_eq!(revisions.len(), 2);
        assert_eq!(revisions[0].quantity, 2000.0);
        assert_eq!(revisions[0].recorded_at, "2026-09-09T01:00:00Z");
        assert_eq!(revisions[1].quantity, 1000.0);
        assert_eq!(revisions[1].recorded_at, "2026-09-09T00:00:00Z");
    }

    #[test]
    fn default_reading_profile_seeded_by_migration() {
        let conn = test_conn();
        let default_profile = get_default_reading_profile(&conn).unwrap().expect("default profile should exist");
        assert_eq!(default_profile.id, "profile-default");
        assert_eq!(default_profile.difficulty_multiplier, 1.0);
        assert!(default_profile.is_default);
    }

    #[test]
    fn reading_profile_crud_operations() {
        let conn = test_conn();
        let created = create_reading_profile(
            &conn,
            "prof-custom",
            "Technical Paper",
            1.5,
            "Dense papers",
            false,
            "2026-09-10T12:00:00Z",
        )
        .unwrap();
        assert_eq!(created.name, "Technical Paper");
        assert_eq!(created.difficulty_multiplier, 1.5);

        let retrieved = get_reading_profile(&conn, "prof-custom").unwrap().unwrap();
        assert_eq!(retrieved.id, "prof-custom");
        assert_eq!(retrieved.difficulty_multiplier, 1.5);

        let updated = update_reading_profile(
            &conn,
            "prof-custom",
            "Technical Paper (Advanced)",
            1.8,
            "Very dense papers",
            "2026-09-10T13:00:00Z",
        )
        .unwrap()
        .unwrap();
        assert_eq!(updated.name, "Technical Paper (Advanced)");
        assert_eq!(updated.difficulty_multiplier, 1.8);

        let deleted = delete_reading_profile(&conn, "prof-custom").unwrap();
        assert!(deleted);
        assert_eq!(get_reading_profile(&conn, "prof-custom").unwrap(), None);

        // Cannot delete default profile
        let delete_default = delete_reading_profile(&conn, "profile-default").unwrap();
        assert!(!delete_default);
        assert!(get_reading_profile(&conn, "profile-default").unwrap().is_some());
    }

    #[test]
    fn book_workload_setup_round_trip() {
        let conn = conn_with_book("book-pdf");
        let setup = BookWorkloadSetup {
            profile_id: Some("profile-default".to_string()),
            quantity: Some(300.0),
            unit: Some(QuantityUnit::Pages),
            speed_override: None,
        };
        set_book_workload(&conn, "book-pdf", &setup).unwrap();

        let loaded = get_book_workload(&conn, "book-pdf").unwrap().unwrap();
        assert_eq!(loaded, setup);
    }

    #[test]
    fn book_hours_calculation_and_needs_setup_behavior() {
        let defaults = GlobalBookHoursDefaults::default();
        let default_profile = ReadingProfile {
            id: "profile-default".to_string(),
            name: "Default".to_string(),
            difficulty_multiplier: 1.0,
            description: "".to_string(),
            is_default: true,
            created_at: "".to_string(),
            updated_at: "".to_string(),
        };

        // 1. PDF 300 pages at 60 pph, 1.0 diff, 50% progress -> planned 5.0h, current 2.5h
        let calc_pdf = calculate_book_hours(
            Some(300.0),
            Some(QuantityUnit::Pages),
            None,
            Some(&default_profile),
            &defaults,
            50.0,
        )
        .expect("should calculate");
        assert_eq!(calc_pdf.planned_book_hours, 5.0);
        assert_eq!(calc_pdf.current_book_hours, 2.5);

        // 2. EPUB 60,000 words at 15,000 wph, 1.5 diff, 100% progress -> planned 6.0h, current 6.0h
        let hard_profile = ReadingProfile {
            difficulty_multiplier: 1.5,
            ..default_profile.clone()
        };
        let calc_epub = calculate_book_hours(
            Some(60_000.0),
            Some(QuantityUnit::Words),
            None,
            Some(&hard_profile),
            &defaults,
            100.0,
        )
        .expect("should calculate");
        assert_eq!(calc_epub.planned_book_hours, 6.0);
        assert_eq!(calc_epub.current_book_hours, 6.0);

        // 3. Reread (150% progress) -> current 7.5h
        let calc_reread = calculate_book_hours(
            Some(300.0),
            Some(QuantityUnit::Pages),
            None,
            Some(&default_profile),
            &defaults,
            150.0,
        )
        .expect("should calculate");
        assert_eq!(calc_reread.planned_book_hours, 5.0);
        assert_eq!(calc_reread.current_book_hours, 7.5);

        // 4. Incomplete setup / missing quantity -> returns None (Needs Setup)
        assert!(calculate_book_hours(
            None,
            Some(QuantityUnit::Pages),
            None,
            Some(&default_profile),
            &defaults,
            0.0,
        )
        .is_none());

        // 5. Legacy untyped without override -> returns None (Needs Setup)
        assert!(calculate_book_hours(
            Some(500.0),
            Some(QuantityUnit::LegacyUntyped),
            None,
            Some(&default_profile),
            &defaults,
            0.0,
        )
        .is_none());

        // 6. Legacy untyped with speed override -> calculates successfully
        let calc_legacy = calculate_book_hours(
            Some(500.0),
            Some(QuantityUnit::LegacyUntyped),
            Some(100.0),
            Some(&default_profile),
            &defaults,
            20.0,
        )
        .expect("legacy with override should calculate");
        assert_eq!(calc_legacy.planned_book_hours, 5.0);
        assert_eq!(calc_legacy.current_book_hours, 1.0);
    }

    #[test]
    fn book_hours_overview_aggregation_and_deduplication() {
        let conn = test_conn();
        let defaults = GlobalBookHoursDefaults::default();

        // Add 2 books
        conn.execute("INSERT INTO book (id, title, profile_id, workload_quantity, workload_unit) VALUES ('b1', 'Book 1', 'profile-default', 300.0, 'pages')", []).unwrap();
        conn.execute("INSERT INTO book (id, title, profile_id, workload_quantity, workload_unit) VALUES ('b2', 'Book 2', 'profile-default', 600.0, 'pages')", []).unwrap();
        // Progress for b1 = 50%, b2 = 100%
        conn.execute("INSERT INTO reading_progress (book_id, completed_read_count, active_read_in_progress, active_pass_progress) VALUES ('b1', 0, 1, 50.0)", []).unwrap();
        conn.execute("INSERT INTO reading_progress (book_id, completed_read_count, active_read_in_progress, active_pass_progress) VALUES ('b2', 1, 0, 0.0)", []).unwrap();

        // Collections: c1 has both books; c2 has b1 only
        conn.execute("INSERT INTO collection (id, name) VALUES ('c1', 'All Reading')", []).unwrap();
        conn.execute("INSERT INTO collection (id, name) VALUES ('c2', 'Short List')", []).unwrap();
        conn.execute("INSERT INTO book_collection (book_id, collection_id) VALUES ('b1', 'c1')", []).unwrap();
        conn.execute("INSERT INTO book_collection (book_id, collection_id) VALUES ('b2', 'c1')", []).unwrap();
        conn.execute("INSERT INTO book_collection (book_id, collection_id) VALUES ('b1', 'c2')", []).unwrap();

        let overview = compute_book_hours_overview(&conn, &defaults).unwrap();

        // b1 = 300 / 60 = 5.0h planned, 2.5h current
        // b2 = 600 / 60 = 10.0h planned, 10.0h current
        // Global deduplicated total = 15.0h planned, 12.5h current
        assert_eq!(overview.total_planned_hours, 15.0);
        assert_eq!(overview.total_current_hours, 12.5);
        assert_eq!(overview.global_coverage.calculated_books, 2);
        assert_eq!(overview.global_coverage.total_books, 2);

        // Collection c1 total = 15.0h planned, 12.5h current
        let c1 = overview.collections.iter().find(|c| c.collection_id == "c1").unwrap();
        assert_eq!(c1.total_planned_hours, 15.0);
        assert_eq!(c1.total_current_hours, 12.5);

        // Collection c2 total = 5.0h planned, 2.5h current
        let c2 = overview.collections.iter().find(|c| c.collection_id == "c2").unwrap();
        assert_eq!(c2.total_planned_hours, 5.0);
        assert_eq!(c2.total_current_hours, 2.5);
    }

    #[test]
    fn base_book_hours_matches_the_frozen_formula() {
        assert_eq!(base_book_hours(50_000.0, 250.0, 1.2), 240.0);
    }

    #[test]
    fn base_book_hours_is_zero_for_a_non_positive_baseline_speed() {
        assert_eq!(base_book_hours(1000.0, 0.0, 1.0), 0.0);
    }

    #[test]
    fn cumulative_book_hours_matches_the_frozen_formula() {
        assert_eq!(cumulative_book_hours(10.0, 50.0), 5.0);
    }

    #[test]
    fn cumulative_book_hours_can_exceed_base_hours_after_a_reread() {
        assert_eq!(cumulative_book_hours(10.0, 150.0), 15.0);
    }

    #[test]
    fn workload_config_base_book_hours_matches_the_free_function() {
        let config = WorkloadConfig { quantity: 300.0, baseline_speed: 200.0, difficulty_coefficient: 1.0 };
        assert_eq!(config.base_book_hours(), base_book_hours(300.0, 200.0, 1.0));
    }
}

