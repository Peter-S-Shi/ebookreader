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
        match speed_override {
            Some(speed) => {
                if speed > 0.0 {
                    Some(speed)
                } else {
                    None // Explicitly invalid non-positive override must NOT fallback to global defaults
                }
            }
            None => match unit {
                QuantityUnit::Pages => Some(self.pages_per_hour),
                QuantityUnit::Words => Some(self.words_per_hour),
                QuantityUnit::Characters => Some(self.characters_per_hour),
                QuantityUnit::LegacyUntyped => None, // legacy_untyped must have a valid override to calculate
            },
        }
    }
}

pub fn validate_global_defaults(defaults: &GlobalBookHoursDefaults) -> rusqlite::Result<()> {
    for (field_name, val) in [
        ("pages_per_hour", defaults.pages_per_hour),
        ("words_per_hour", defaults.words_per_hour),
        ("characters_per_hour", defaults.characters_per_hour),
    ] {
        if !val.is_finite() || val <= 0.0 {
            return Err(rusqlite::Error::InvalidParameterName(format!(
                "{field_name} must be a finite positive number (> 0.0)"
            )));
        }
    }
    Ok(())
}

pub fn validate_difficulty_multiplier(diff: f64) -> rusqlite::Result<()> {
    if !diff.is_finite() || diff <= 0.0 {
        return Err(rusqlite::Error::InvalidParameterName(
            "difficulty_multiplier must be a finite positive number (> 0.0)".to_string(),
        ));
    }
    Ok(())
}

pub fn load_global_book_hours_defaults(conn: &Connection) -> rusqlite::Result<GlobalBookHoursDefaults> {
    if let Some(json_val) = crate::settings::get_setting(conn, crate::settings::keys::BOOK_HOURS_DEFAULTS)? {
        if let Ok(defaults) = serde_json::from_str::<GlobalBookHoursDefaults>(&json_val) {
            if validate_global_defaults(&defaults).is_ok() {
                return Ok(defaults);
            }
        }
    }
    Ok(GlobalBookHoursDefaults::default())
}

pub fn save_global_book_hours_defaults(
    conn: &Connection,
    defaults: &GlobalBookHoursDefaults,
) -> rusqlite::Result<()> {
    validate_global_defaults(defaults)?;
    let json_val = serde_json::to_string(defaults)
        .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    crate::settings::set_setting(conn, crate::settings::keys::BOOK_HOURS_DEFAULTS, &json_val)
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
    validate_difficulty_multiplier(difficulty_multiplier)?;
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
    validate_difficulty_multiplier(difficulty_multiplier)?;
    let affected = conn.execute(
        "UPDATE reading_profiles
         SET name = ?1, difficulty_multiplier = ?2, description = ?3, updated_at = ?4
         WHERE id = ?5",
        params![name, difficulty_multiplier, description, updated_at, id],
    )?;
    if affected == 0 {
        return Err(rusqlite::Error::InvalidParameterName(format!(
            "unknown reading profile id '{id}'"
        )));
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
pub struct BookHoursItem {
    pub book_id: String,
    pub title: String,
    pub profile_id: Option<String>,
    pub profile_name: Option<String>,
    pub collections: Vec<String>,
    pub quantity: Option<f64>,
    pub unit: Option<QuantityUnit>,
    pub speed_override: Option<f64>,
    pub cumulative_percent: f64,
    pub calculation: Option<BookHoursCalculation>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BookHoursOverview {
    pub total_planned_hours: f64,
    pub total_current_hours: f64,
    pub global_coverage: CalculationCoverage,
    pub profiles: Vec<ProfileBookHoursSummary>,
    pub collections: Vec<CollectionBookHoursSummary>,
    pub books: Vec<BookHoursItem>,
}

struct BookRecord {
    id: String,
    title: String,
    profile_id: Option<String>,
    quantity: Option<f64>,
    unit: Option<QuantityUnit>,
    speed_override: Option<f64>,
    cumulative_percent: f64,
}

pub fn get_book_hours_item(
    conn: &Connection,
    book_id: &str,
    defaults: &GlobalBookHoursDefaults,
) -> rusqlite::Result<Option<BookHoursItem>> {
    let mut stmt = conn.prepare(
        "SELECT b.id, b.title, b.profile_id, b.workload_quantity, b.workload_unit, b.workload_speed_override,
                COALESCE(
                    rp.completed_read_count * 100.0 + (CASE WHEN rp.active_read_in_progress != 0 THEN rp.active_pass_progress ELSE 0.0 END),
                    0.0
                )
         FROM book b
         LEFT JOIN reading_progress rp ON rp.book_id = b.id
         WHERE b.id = ?1",
    )?;

    let row_opt = stmt
        .query_row([book_id], |row| {
            let id: String = row.get(0)?;
            let title: String = row.get(1)?;
            let profile_id: Option<String> = row.get(2)?;
            let quantity: Option<f64> = row.get(3)?;
            let unit_str: Option<String> = row.get(4)?;
            let speed_override: Option<f64> = row.get(5)?;
            let cumulative_percent: f64 = row.get(6)?;
            let unit = unit_str.as_deref().and_then(QuantityUnit::from_str);
            Ok(BookRecord {
                id,
                title,
                profile_id,
                quantity,
                unit,
                speed_override,
                cumulative_percent,
            })
        })
        .optional()?;

    let Some(b) = row_opt else {
        return Ok(None);
    };

    let profile = if let Some(ref pid) = b.profile_id {
        get_reading_profile(conn, pid)?
    } else {
        None
    };

    let profile_name = profile.as_ref().map(|p| p.name.clone());
    let calculation = calculate_book_hours(
        b.quantity,
        b.unit,
        b.speed_override,
        profile.as_ref(),
        defaults,
        b.cumulative_percent,
    );

    let mut coll_stmt = conn.prepare(
        "SELECT c.name FROM book_collection bc JOIN collection c ON c.id = bc.collection_id WHERE bc.book_id = ?1 ORDER BY c.name ASC",
    )?;
    let collections: Vec<String> = coll_stmt
        .query_map([book_id], |row| row.get::<_, String>(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    Ok(Some(BookHoursItem {
        book_id: b.id,
        title: b.title,
        profile_id: b.profile_id,
        profile_name,
        collections,
        quantity: b.quantity,
        unit: b.unit,
        speed_override: b.speed_override,
        cumulative_percent: b.cumulative_percent,
        calculation,
    }))
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
        "SELECT b.id, b.title, b.profile_id, b.workload_quantity, b.workload_unit, b.workload_speed_override,
                COALESCE(
                    rp.completed_read_count * 100.0 + (CASE WHEN rp.active_read_in_progress != 0 THEN rp.active_pass_progress ELSE 0.0 END),
                    0.0
                )
         FROM book b
         LEFT JOIN reading_progress rp ON rp.book_id = b.id
         WHERE b.library_status = 'active'
         ORDER BY b.title ASC",
    )?;

    let book_rows = stmt.query_map([], |row| {
        let id: String = row.get(0)?;
        let title: String = row.get(1)?;
        let profile_id: Option<String> = row.get(2)?;
        let quantity: Option<f64> = row.get(3)?;
        let unit_str: Option<String> = row.get(4)?;
        let speed_override: Option<f64> = row.get(5)?;
        let cumulative_percent: f64 = row.get(6)?;
        let unit = unit_str.as_deref().and_then(QuantityUnit::from_str);
        Ok(BookRecord {
            id,
            title,
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

    // 2b. Load collection memberships for all books
    let mut bc_stmt = conn.prepare(
        "SELECT bc.book_id, c.name FROM book_collection bc JOIN collection c ON c.id = bc.collection_id ORDER BY c.name ASC",
    )?;
    let mut book_collections_map: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();
    let bc_rows = bc_stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))?;
    for row in bc_rows {
        let (b_id, c_name) = row?;
        book_collections_map.entry(b_id).or_default().push(c_name);
    }

    // 3. Calculate per book
    let mut book_calc_map: std::collections::HashMap<String, Option<BookHoursCalculation>> =
        std::collections::HashMap::new();
    let mut book_items: Vec<BookHoursItem> = Vec::with_capacity(books.len());

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
        book_calc_map.insert(b.id.clone(), calc.clone());
        let book_colls = book_collections_map.remove(&b.id).unwrap_or_default();
        book_items.push(BookHoursItem {
            book_id: b.id.clone(),
            title: b.title.clone(),
            profile_id: b.profile_id.clone(),
            profile_name: prof.map(|p| p.name.clone()),
            collections: book_colls,
            quantity: b.quantity,
            unit: b.unit,
            speed_override: b.speed_override,
            cumulative_percent: b.cumulative_percent,
            calculation: calc,
        });
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
        books: book_items,
    })
}

// ---------------------------------------------------------------------------
// Recalculation Impact Preview & Apply
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProfileDifficultyUpdate {
    pub profile_id: String,
    pub difficulty_multiplier: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RecalculationPreviewRequest {
    pub proposed_defaults: Option<GlobalBookHoursDefaults>,
    pub proposed_profiles: Option<Vec<ProfileDifficultyUpdate>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BookRecalculationImpact {
    pub book_id: String,
    pub title: String,
    pub old_planned_hours: Option<f64>,
    pub new_planned_hours: Option<f64>,
    pub old_current_hours: Option<f64>,
    pub new_current_hours: Option<f64>,
    pub hours_delta: f64,
    pub was_calculated: bool,
    pub is_calculated: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CoverageDelta {
    pub old_calculated_books: usize,
    pub new_calculated_books: usize,
    pub delta: i64,
    pub total_books: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProfileRecalculationImpact {
    pub profile_id: String,
    pub profile_name: String,
    pub old_planned_hours: f64,
    pub new_planned_hours: f64,
    pub hours_delta: f64,
    pub coverage_delta: CoverageDelta,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CollectionRecalculationImpact {
    pub collection_id: String,
    pub collection_name: String,
    pub old_planned_hours: f64,
    pub new_planned_hours: f64,
    pub hours_delta: f64,
    pub coverage_delta: CoverageDelta,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RecalculationPreviewResult {
    pub total_books_count: usize,
    pub affected_books_count: usize,
    pub progress_changed_count: usize, // ALWAYS 0
    pub old_total_planned_hours: f64,
    pub new_total_planned_hours: f64,
    pub total_hours_delta: f64,
    pub old_total_current_hours: f64,
    pub new_total_current_hours: f64,
    pub global_coverage_delta: CoverageDelta,
    pub affected_books: Vec<BookRecalculationImpact>,
    pub profile_impacts: Vec<ProfileRecalculationImpact>,
    pub collection_impacts: Vec<CollectionRecalculationImpact>,
}

pub fn validate_recalculation_request(
    conn: &Connection,
    request: &RecalculationPreviewRequest,
) -> rusqlite::Result<()> {
    if let Some(ref defaults) = request.proposed_defaults {
        validate_global_defaults(defaults)?;
    }

    if let Some(ref updates) = request.proposed_profiles {
        let mut seen_ids = std::collections::HashSet::new();
        for update in updates {
            validate_difficulty_multiplier(update.difficulty_multiplier)?;

            if !seen_ids.insert(&update.profile_id) {
                return Err(rusqlite::Error::InvalidParameterName(format!(
                    "duplicate update for reading profile id '{}'",
                    update.profile_id
                )));
            }

            let exists: bool = conn
                .query_row(
                    "SELECT 1 FROM reading_profiles WHERE id = ?1",
                    [&update.profile_id],
                    |_| Ok(true),
                )
                .optional()?
                .unwrap_or(false);

            if !exists {
                return Err(rusqlite::Error::InvalidParameterName(format!(
                    "unknown reading profile id '{}'",
                    update.profile_id
                )));
            }
        }
    }

    Ok(())
}

pub fn preview_book_hours_recalculation(
    conn: &Connection,
    request: &RecalculationPreviewRequest,
) -> rusqlite::Result<RecalculationPreviewResult> {
    validate_recalculation_request(conn, request)?;

    let current_defaults = load_global_book_hours_defaults(conn)?;
    let effective_defaults = request.proposed_defaults.unwrap_or(current_defaults);

    let profiles = list_reading_profiles(conn)?;
    let current_profile_map: std::collections::HashMap<String, ReadingProfile> = profiles
        .into_iter()
        .map(|p| (p.id.clone(), p))
        .collect();

    let mut effective_profile_map = current_profile_map.clone();
    if let Some(ref updates) = request.proposed_profiles {
        for u in updates {
            if let Some(p) = effective_profile_map.get_mut(&u.profile_id) {
                p.difficulty_multiplier = u.difficulty_multiplier;
            }
        }
    }

    let mut stmt = conn.prepare(
        "SELECT b.id, b.title, b.profile_id, b.workload_quantity, b.workload_unit, b.workload_speed_override,
                COALESCE(
                    rp.completed_read_count * 100.0 + (CASE WHEN rp.active_read_in_progress != 0 THEN rp.active_pass_progress ELSE 0.0 END),
                    0.0
                )
         FROM book b
         LEFT JOIN reading_progress rp ON rp.book_id = b.id
         WHERE b.library_status = 'active'
         ORDER BY b.title ASC",
    )?;

    let book_rows = stmt.query_map([], |row| {
        let id: String = row.get(0)?;
        let title: String = row.get(1)?;
        let profile_id: Option<String> = row.get(2)?;
        let quantity: Option<f64> = row.get(3)?;
        let unit_str: Option<String> = row.get(4)?;
        let speed_override: Option<f64> = row.get(5)?;
        let cumulative_percent: f64 = row.get(6)?;
        let unit = unit_str.as_deref().and_then(QuantityUnit::from_str);
        Ok(BookRecord {
            id,
            title,
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

    let mut affected_books = Vec::new();
    let mut old_total_planned = 0.0;
    let mut new_total_planned = 0.0;
    let mut old_total_current = 0.0;
    let mut new_total_current = 0.0;
    let mut old_calc_count = 0;
    let mut new_calc_count = 0;

    let mut old_book_calcs: std::collections::HashMap<String, Option<BookHoursCalculation>> =
        std::collections::HashMap::new();
    let mut new_book_calcs: std::collections::HashMap<String, Option<BookHoursCalculation>> =
        std::collections::HashMap::new();

    for b in &books {
        let old_prof = b.profile_id.as_deref().and_then(|pid| current_profile_map.get(pid));
        let new_prof = b.profile_id.as_deref().and_then(|pid| effective_profile_map.get(pid));

        let old_calc = calculate_book_hours(
            b.quantity,
            b.unit,
            b.speed_override,
            old_prof,
            &current_defaults,
            b.cumulative_percent,
        );
        let new_calc = calculate_book_hours(
            b.quantity,
            b.unit,
            b.speed_override,
            new_prof,
            &effective_defaults,
            b.cumulative_percent,
        );

        if let Some(ref c) = old_calc {
            old_total_planned += c.planned_book_hours;
            old_total_current += c.current_book_hours;
            old_calc_count += 1;
        }
        if let Some(ref c) = new_calc {
            new_total_planned += c.planned_book_hours;
            new_total_current += c.current_book_hours;
            new_calc_count += 1;
        }

        let is_affected = match (&old_calc, &new_calc) {
            (None, None) => false,
            (Some(_), None) | (None, Some(_)) => true,
            (Some(o), Some(n)) => {
                (o.planned_book_hours - n.planned_book_hours).abs() > 1e-6
                    || (o.current_book_hours - n.current_book_hours).abs() > 1e-6
            }
        };

        let old_planned = old_calc.as_ref().map(|c| c.planned_book_hours);
        let new_planned = new_calc.as_ref().map(|c| c.planned_book_hours);
        let old_curr = old_calc.as_ref().map(|c| c.current_book_hours);
        let new_curr = new_calc.as_ref().map(|c| c.current_book_hours);
        let delta = match (new_planned, old_planned) {
            (Some(n), Some(o)) => n - o,
            (Some(n), None) => n,
            (None, Some(o)) => -o,
            (None, None) => 0.0,
        };

        if is_affected {
            affected_books.push(BookRecalculationImpact {
                book_id: b.id.clone(),
                title: b.title.clone(),
                old_planned_hours: old_planned,
                new_planned_hours: new_planned,
                old_current_hours: old_curr,
                new_current_hours: new_curr,
                hours_delta: delta,
                was_calculated: old_calc.is_some(),
                is_calculated: new_calc.is_some(),
            });
        }

        old_book_calcs.insert(b.id.clone(), old_calc);
        new_book_calcs.insert(b.id.clone(), new_calc);
    }

    // Profile impacts
    let mut profile_impacts = Vec::new();
    for (pid, prof) in &current_profile_map {
        let mut old_p_planned = 0.0;
        let mut new_p_planned = 0.0;
        let mut old_p_calc = 0;
        let mut new_p_calc = 0;
        let mut p_total = 0;

        for b in &books {
            if b.profile_id.as_deref() == Some(pid.as_str()) {
                p_total += 1;
                if let Some(Some(ref c)) = old_book_calcs.get(&b.id) {
                    old_p_planned += c.planned_book_hours;
                    old_p_calc += 1;
                }
                if let Some(Some(ref c)) = new_book_calcs.get(&b.id) {
                    new_p_planned += c.planned_book_hours;
                    new_p_calc += 1;
                }
            }
        }

        profile_impacts.push(ProfileRecalculationImpact {
            profile_id: pid.clone(),
            profile_name: prof.name.clone(),
            old_planned_hours: old_p_planned,
            new_planned_hours: new_p_planned,
            hours_delta: new_p_planned - old_p_planned,
            coverage_delta: CoverageDelta {
                old_calculated_books: old_p_calc,
                new_calculated_books: new_p_calc,
                delta: new_p_calc as i64 - old_p_calc as i64,
                total_books: p_total,
            },
        });
    }
    profile_impacts.sort_by(|a, b| b.profile_id.cmp(&a.profile_id));

    // Collection impacts
    let mut coll_stmt = conn.prepare("SELECT id, name FROM collection ORDER BY name ASC")?;
    let coll_rows = coll_stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;

    let mut collection_impacts = Vec::new();
    for c in coll_rows {
        let (coll_id, coll_name) = c?;
        let mut member_stmt = conn.prepare("SELECT book_id FROM book_collection WHERE collection_id = ?1")?;
        let member_rows = member_stmt.query_map([&coll_id], |row| row.get::<_, String>(0))?;

        let mut old_c_planned = 0.0;
        let mut new_c_planned = 0.0;
        let mut old_c_calc = 0;
        let mut new_c_calc = 0;
        let mut c_total = 0;

        for m in member_rows {
            let book_id = m?;
            if let Some(calc_opt) = old_book_calcs.get(&book_id) {
                c_total += 1;
                if let Some(ref c) = calc_opt {
                    old_c_planned += c.planned_book_hours;
                    old_c_calc += 1;
                }
            }
            if let Some(Some(ref c)) = new_book_calcs.get(&book_id) {
                new_c_planned += c.planned_book_hours;
                new_c_calc += 1;
            }
        }

        collection_impacts.push(CollectionRecalculationImpact {
            collection_id: coll_id,
            collection_name: coll_name,
            old_planned_hours: old_c_planned,
            new_planned_hours: new_c_planned,
            hours_delta: new_c_planned - old_c_planned,
            coverage_delta: CoverageDelta {
                old_calculated_books: old_c_calc,
                new_calculated_books: new_c_calc,
                delta: new_c_calc as i64 - old_c_calc as i64,
                total_books: c_total,
            },
        });
    }

    let total_books_count = books.len();
    let affected_books_count = affected_books.len();

    Ok(RecalculationPreviewResult {
        total_books_count,
        affected_books_count,
        progress_changed_count: 0,
        old_total_planned_hours: old_total_planned,
        new_total_planned_hours: new_total_planned,
        total_hours_delta: new_total_planned - old_total_planned,
        old_total_current_hours: old_total_current,
        new_total_current_hours: new_total_current,
        global_coverage_delta: CoverageDelta {
            old_calculated_books: old_calc_count,
            new_calculated_books: new_calc_count,
            delta: new_calc_count as i64 - old_calc_count as i64,
            total_books: total_books_count,
        },
        affected_books,
        profile_impacts,
        collection_impacts,
    })
}

pub fn apply_book_hours_recalculation(
    conn: &Connection,
    request: &RecalculationPreviewRequest,
) -> rusqlite::Result<RecalculationPreviewResult> {
    // preview_book_hours_recalculation performs validate_recalculation_request as its first step
    let preview = preview_book_hours_recalculation(conn, request)?;

    conn.execute("SAVEPOINT apply_book_hours_recalculation", [])?;

    let result: rusqlite::Result<()> = (|| {
        if let Some(ref defaults) = request.proposed_defaults {
            save_global_book_hours_defaults(conn, defaults)?;
        }

        if let Some(ref profile_updates) = request.proposed_profiles {
            for update in profile_updates {
                let affected = conn.execute(
                    "UPDATE reading_profiles SET difficulty_multiplier = ?1, updated_at = datetime('now') WHERE id = ?2",
                    params![update.difficulty_multiplier, &update.profile_id],
                )?;
                if affected == 0 {
                    return Err(rusqlite::Error::InvalidParameterName(format!(
                        "unknown reading profile id '{}'",
                        update.profile_id
                    )));
                }
            }
        }
        Ok(())
    })();

    match result {
        Ok(()) => {
            conn.execute("RELEASE apply_book_hours_recalculation", [])?;
            Ok(preview)
        }
        Err(e) => {
            conn.execute("ROLLBACK TO apply_book_hours_recalculation", []).ok();
            conn.execute("RELEASE apply_book_hours_recalculation", []).ok();
            Err(e)
        }
    }
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

        // 7. Explicit non-positive speed override -> returns None (Needs Setup), must NOT fall back to global defaults
        assert!(
            calculate_book_hours(
                Some(300.0),
                Some(QuantityUnit::Pages),
                Some(0.0),
                Some(&default_profile),
                &defaults,
                50.0,
            )
            .is_none(),
            "speed override of 0.0 must be rejected and not fall back to global 60 pph"
        );
        assert!(
            calculate_book_hours(
                Some(300.0),
                Some(QuantityUnit::Pages),
                Some(-10.0),
                Some(&default_profile),
                &defaults,
                50.0,
            )
            .is_none(),
            "negative speed override must be rejected and not fall back to global 60 pph"
        );
        assert_eq!(
            defaults.resolve_baseline_speed(&QuantityUnit::Pages, Some(0.0)),
            None,
            "resolve_baseline_speed must return None on 0.0 override"
        );
        assert_eq!(
            defaults.resolve_baseline_speed(&QuantityUnit::Pages, Some(-5.0)),
            None,
            "resolve_baseline_speed must return None on negative override"
        );
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

    #[test]
    fn global_book_hours_defaults_round_trip() {
        let conn = test_conn();
        let initial = load_global_book_hours_defaults(&conn).unwrap();
        assert_eq!(initial, GlobalBookHoursDefaults::default());

        let custom = GlobalBookHoursDefaults {
            pages_per_hour: 50.0,
            words_per_hour: 12_000.0,
            characters_per_hour: 25_000.0,
        };
        save_global_book_hours_defaults(&conn, &custom).unwrap();

        let loaded = load_global_book_hours_defaults(&conn).unwrap();
        assert_eq!(loaded, custom);
    }

    #[test]
    fn get_book_hours_item_query() {
        let conn = test_conn();
        let defaults = GlobalBookHoursDefaults::default();

        conn.execute("INSERT INTO book (id, title, profile_id, workload_quantity, workload_unit) VALUES ('b1', 'Test Book', 'profile-default', 300.0, 'pages')", []).unwrap();
        conn.execute("INSERT INTO reading_progress (book_id, completed_read_count, active_read_in_progress, active_pass_progress) VALUES ('b1', 0, 1, 50.0)", []).unwrap();

        let item = get_book_hours_item(&conn, "b1", &defaults).unwrap().expect("should find book");
        assert_eq!(item.book_id, "b1");
        assert_eq!(item.title, "Test Book");
        assert_eq!(item.profile_id.as_deref(), Some("profile-default"));
        assert_eq!(item.profile_name.as_deref(), Some("Default"));
        assert_eq!(item.quantity, Some(300.0));
        assert_eq!(item.unit, Some(QuantityUnit::Pages));
        assert_eq!(item.cumulative_percent, 50.0);
        let calc = item.calculation.expect("should calculate");
        assert_eq!(calc.planned_book_hours, 5.0);
        assert_eq!(calc.current_book_hours, 2.5);

        assert!(get_book_hours_item(&conn, "nonexistent", &defaults).unwrap().is_none());
    }

    #[test]
    fn preview_and_apply_book_hours_recalculation() {
        let conn = test_conn();
        let defaults = GlobalBookHoursDefaults::default();

        // Setup custom profile
        create_reading_profile(&conn, "prof-deep", "Deep", 1.5, "Deep reading", false, "2026-09-10T00:00:00Z").unwrap();

        // Add 2 books:
        // b1: 300 pages, profile-default (1.0 diff) -> 300 / 60 * 1.0 = 5.0h planned, 2.5h current (50% progress)
        // b2: 60,000 words, prof-deep (1.5 diff) -> 60000 / 15000 * 1.5 = 6.0h planned, 6.0h current (100% progress)
        conn.execute("INSERT INTO book (id, title, profile_id, workload_quantity, workload_unit) VALUES ('b1', 'Book 1', 'profile-default', 300.0, 'pages')", []).unwrap();
        conn.execute("INSERT INTO book (id, title, profile_id, workload_quantity, workload_unit) VALUES ('b2', 'Book 2', 'prof-deep', 60000.0, 'words')", []).unwrap();
        conn.execute("INSERT INTO reading_progress (book_id, completed_read_count, active_read_in_progress, active_pass_progress) VALUES ('b1', 0, 1, 50.0)", []).unwrap();
        conn.execute("INSERT INTO reading_progress (book_id, completed_read_count, active_read_in_progress, active_pass_progress) VALUES ('b2', 1, 0, 0.0)", []).unwrap();

        // Collection c1 with both books
        conn.execute("INSERT INTO collection (id, name) VALUES ('c1', 'Reading List')", []).unwrap();
        conn.execute("INSERT INTO book_collection (book_id, collection_id) VALUES ('b1', 'c1')", []).unwrap();
        conn.execute("INSERT INTO book_collection (book_id, collection_id) VALUES ('b2', 'c1')", []).unwrap();

        // 1. Preview changes: pages_per_hour from 60 -> 30, prof-deep difficulty from 1.5 -> 2.0
        let req = RecalculationPreviewRequest {
            proposed_defaults: Some(GlobalBookHoursDefaults {
                pages_per_hour: 30.0,
                words_per_hour: 15_000.0,
                characters_per_hour: 30_000.0,
            }),
            proposed_profiles: Some(vec![
                ProfileDifficultyUpdate {
                    profile_id: "prof-deep".to_string(),
                    difficulty_multiplier: 2.0,
                },
            ]),
        };

        let preview = preview_book_hours_recalculation(&conn, &req).unwrap();

        // Preview checks
        assert_eq!(preview.total_books_count, 2);
        assert_eq!(preview.affected_books_count, 2);
        assert_eq!(preview.progress_changed_count, 0, "Invariant: progress_changed_count MUST be 0");
        assert_eq!(preview.old_total_planned_hours, 11.0);
        // b1 new: 300 / 30 * 1.0 = 10.0h planned, 5.0h current
        // b2 new: 60000 / 15000 * 2.0 = 8.0h planned, 8.0h current
        // new total planned = 18.0h
        assert_eq!(preview.new_total_planned_hours, 18.0);
        assert_eq!(preview.total_hours_delta, 7.0);
        assert_eq!(preview.old_total_current_hours, 8.5);
        assert_eq!(preview.new_total_current_hours, 13.0);
        assert_eq!(preview.global_coverage_delta.old_calculated_books, 2);
        assert_eq!(preview.global_coverage_delta.new_calculated_books, 2);
        assert_eq!(preview.global_coverage_delta.delta, 0);

        // Verify that preview did NOT mutate the database!
        let defaults_after_preview = load_global_book_hours_defaults(&conn).unwrap();
        assert_eq!(defaults_after_preview, defaults);
        let prof_after_preview = get_reading_profile(&conn, "prof-deep").unwrap().unwrap();
        assert_eq!(prof_after_preview.difficulty_multiplier, 1.5);

        // 2. Apply recalculation
        let applied = apply_book_hours_recalculation(&conn, &req).unwrap();
        assert_eq!(applied.new_total_planned_hours, 18.0);

        // Verify that database WAS mutated after apply
        let defaults_after_apply = load_global_book_hours_defaults(&conn).unwrap();
        assert_eq!(defaults_after_apply.pages_per_hour, 30.0);
        let prof_after_apply = get_reading_profile(&conn, "prof-deep").unwrap().unwrap();
        assert_eq!(prof_after_apply.difficulty_multiplier, 2.0);
    }

    #[test]
    fn reject_invalid_numerics_on_global_defaults() {
        let conn = test_conn();
        let invalid_cases = vec![
            GlobalBookHoursDefaults { pages_per_hour: 0.0, words_per_hour: 15_000.0, characters_per_hour: 30_000.0 },
            GlobalBookHoursDefaults { pages_per_hour: -10.0, words_per_hour: 15_000.0, characters_per_hour: 30_000.0 },
            GlobalBookHoursDefaults { pages_per_hour: f64::NAN, words_per_hour: 15_000.0, characters_per_hour: 30_000.0 },
            GlobalBookHoursDefaults { pages_per_hour: f64::INFINITY, words_per_hour: 15_000.0, characters_per_hour: 30_000.0 },
            GlobalBookHoursDefaults { pages_per_hour: 60.0, words_per_hour: 0.0, characters_per_hour: 30_000.0 },
            GlobalBookHoursDefaults { pages_per_hour: 60.0, words_per_hour: -500.0, characters_per_hour: 30_000.0 },
            GlobalBookHoursDefaults { pages_per_hour: 60.0, words_per_hour: f64::NAN, characters_per_hour: 30_000.0 },
            GlobalBookHoursDefaults { pages_per_hour: 60.0, words_per_hour: 15_000.0, characters_per_hour: 0.0 },
            GlobalBookHoursDefaults { pages_per_hour: 60.0, words_per_hour: 15_000.0, characters_per_hour: -1.0 },
            GlobalBookHoursDefaults { pages_per_hour: 60.0, words_per_hour: 15_000.0, characters_per_hour: f64::INFINITY },
        ];

        for invalid in invalid_cases {
            assert!(validate_global_defaults(&invalid).is_err());
            assert!(save_global_book_hours_defaults(&conn, &invalid).is_err());
        }

        // Verify default remained untouched
        assert_eq!(load_global_book_hours_defaults(&conn).unwrap(), GlobalBookHoursDefaults::default());
    }

    #[test]
    fn reject_invalid_inputs_on_profile_crud() {
        let conn = test_conn();

        // 1. Invalid difficulty on create
        for bad_diff in [0.0, -1.0, f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
            assert!(create_reading_profile(&conn, "p-bad", "Bad", bad_diff, "", false, "2026-09-10T00:00:00Z").is_err());
        }

        // 2. Create a valid profile
        create_reading_profile(&conn, "p-valid", "Valid", 1.2, "", false, "2026-09-10T00:00:00Z").unwrap();

        // 3. Invalid difficulty on update
        for bad_diff in [0.0, -2.5, f64::NAN, f64::INFINITY] {
            assert!(update_reading_profile(&conn, "p-valid", "Valid", bad_diff, "", "2026-09-10T01:00:00Z").is_err());
        }

        // 4. Unknown profile ID on update
        assert!(update_reading_profile(&conn, "nonexistent-id", "Valid", 1.2, "", "2026-09-10T01:00:00Z").is_err());
    }

    #[test]
    fn recalculation_preview_and_apply_validation_parity() {
        let conn = test_conn();
        create_reading_profile(&conn, "p-1", "P1", 1.0, "", false, "2026-09-10T00:00:00Z").unwrap();

        // Case A: Unknown profile ID
        let req_unknown = RecalculationPreviewRequest {
            proposed_defaults: None,
            proposed_profiles: Some(vec![ProfileDifficultyUpdate {
                profile_id: "p-unknown".to_string(),
                difficulty_multiplier: 1.5,
            }]),
        };
        assert!(preview_book_hours_recalculation(&conn, &req_unknown).is_err());
        assert!(apply_book_hours_recalculation(&conn, &req_unknown).is_err());

        // Case B: Duplicate profile ID in request
        let req_dup = RecalculationPreviewRequest {
            proposed_defaults: None,
            proposed_profiles: Some(vec![
                ProfileDifficultyUpdate {
                    profile_id: "p-1".to_string(),
                    difficulty_multiplier: 1.5,
                },
                ProfileDifficultyUpdate {
                    profile_id: "p-1".to_string(),
                    difficulty_multiplier: 2.0,
                },
            ]),
        };
        assert!(preview_book_hours_recalculation(&conn, &req_dup).is_err());
        assert!(apply_book_hours_recalculation(&conn, &req_dup).is_err());

        // Case C: Invalid defaults (e.g. negative speed)
        let req_bad_defaults = RecalculationPreviewRequest {
            proposed_defaults: Some(GlobalBookHoursDefaults {
                pages_per_hour: -50.0,
                words_per_hour: 15_000.0,
                characters_per_hour: 30_000.0,
            }),
            proposed_profiles: None,
        };
        assert!(preview_book_hours_recalculation(&conn, &req_bad_defaults).is_err());
        assert!(apply_book_hours_recalculation(&conn, &req_bad_defaults).is_err());

        // Case D: Invalid profile difficulty (e.g. NaN or 0.0)
        let req_bad_diff = RecalculationPreviewRequest {
            proposed_defaults: None,
            proposed_profiles: Some(vec![ProfileDifficultyUpdate {
                profile_id: "p-1".to_string(),
                difficulty_multiplier: 0.0,
            }]),
        };
        assert!(preview_book_hours_recalculation(&conn, &req_bad_diff).is_err());
        assert!(apply_book_hours_recalculation(&conn, &req_bad_diff).is_err());
    }

    #[test]
    fn recalculation_atomic_rollback_on_failure() {
        let conn = test_conn();
        create_reading_profile(&conn, "p-alpha", "Alpha", 1.0, "", false, "2026-09-10T00:00:00Z").unwrap();
        create_reading_profile(&conn, "p-beta", "Beta", 1.2, "", false, "2026-09-10T00:00:00Z").unwrap();

        let initial_defaults = load_global_book_hours_defaults(&conn).unwrap();

        // 1. Validation phase failure (unknown profile)
        let invalid_req = RecalculationPreviewRequest {
            proposed_defaults: Some(GlobalBookHoursDefaults {
                pages_per_hour: 45.0,
                words_per_hour: 10_000.0,
                characters_per_hour: 20_000.0,
            }),
            proposed_profiles: Some(vec![
                ProfileDifficultyUpdate {
                    profile_id: "p-alpha".to_string(),
                    difficulty_multiplier: 2.5,
                },
                ProfileDifficultyUpdate {
                    profile_id: "p-unknown".to_string(),
                    difficulty_multiplier: 3.0,
                },
            ]),
        };

        assert!(apply_book_hours_recalculation(&conn, &invalid_req).is_err());
        assert_eq!(load_global_book_hours_defaults(&conn).unwrap(), initial_defaults);
        assert_eq!(get_reading_profile(&conn, "p-alpha").unwrap().unwrap().difficulty_multiplier, 1.0);

        // 2. Mid-apply SQL execution failure:
        // Install a trigger that aborts when p-beta is updated inside the savepoint
        conn.execute(
            "CREATE TRIGGER test_fail_on_beta
             BEFORE UPDATE ON reading_profiles
             WHEN NEW.id = 'p-beta'
             BEGIN
                 SELECT RAISE(ABORT, 'forced mid-apply failure');
             END;",
            [],
        )
        .unwrap();

        let mid_fail_req = RecalculationPreviewRequest {
            proposed_defaults: Some(GlobalBookHoursDefaults {
                pages_per_hour: 45.0,
                words_per_hour: 10_000.0,
                characters_per_hour: 20_000.0,
            }),
            proposed_profiles: Some(vec![
                ProfileDifficultyUpdate {
                    profile_id: "p-alpha".to_string(),
                    difficulty_multiplier: 2.5,
                },
                ProfileDifficultyUpdate {
                    profile_id: "p-beta".to_string(),
                    difficulty_multiplier: 3.0,
                },
            ]),
        };

        let result = apply_book_hours_recalculation(&conn, &mid_fail_req);
        assert!(result.is_err(), "Must fail mid-apply on p-beta update");

        // Verify that SAVEPOINT rollback restored defaults and p-alpha completely!
        let defaults_after = load_global_book_hours_defaults(&conn).unwrap();
        assert_eq!(defaults_after, initial_defaults, "Defaults must be rolled back on mid-apply failure");

        let p_alpha_after = get_reading_profile(&conn, "p-alpha").unwrap().unwrap();
        assert_eq!(p_alpha_after.difficulty_multiplier, 1.0, "p-alpha difficulty must be rolled back on mid-apply failure");

        let p_beta_after = get_reading_profile(&conn, "p-beta").unwrap().unwrap();
        assert_eq!(p_beta_after.difficulty_multiplier, 1.2, "p-beta difficulty must remain 1.2");
    }

    #[test]
    fn atomic_multi_profile_and_defaults_application() {
        let conn = test_conn();
        create_reading_profile(&conn, "p-1", "Profile 1", 1.0, "", false, "2026-09-10T00:00:00Z").unwrap();
        create_reading_profile(&conn, "p-2", "Profile 2", 1.5, "", false, "2026-09-10T00:00:00Z").unwrap();

        let req = RecalculationPreviewRequest {
            proposed_defaults: Some(GlobalBookHoursDefaults {
                pages_per_hour: 40.0,
                words_per_hour: 12_000.0,
                characters_per_hour: 24_000.0,
            }),
            proposed_profiles: Some(vec![
                ProfileDifficultyUpdate {
                    profile_id: "p-1".to_string(),
                    difficulty_multiplier: 1.8,
                },
                ProfileDifficultyUpdate {
                    profile_id: "p-2".to_string(),
                    difficulty_multiplier: 2.2,
                },
            ]),
        };

        let res = apply_book_hours_recalculation(&conn, &req).unwrap();
        assert_eq!(res.progress_changed_count, 0);

        // Verify persistent mutation of defaults and both profiles
        let defaults = load_global_book_hours_defaults(&conn).unwrap();
        assert_eq!(defaults.pages_per_hour, 40.0);
        assert_eq!(defaults.words_per_hour, 12_000.0);
        assert_eq!(defaults.characters_per_hour, 24_000.0);

        let p1 = get_reading_profile(&conn, "p-1").unwrap().unwrap();
        assert_eq!(p1.difficulty_multiplier, 1.8);

        let p2 = get_reading_profile(&conn, "p-2").unwrap().unwrap();
        assert_eq!(p2.difficulty_multiplier, 2.2);
    }
}



