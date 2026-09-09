//! Tauri command surface for the Library. Thin adapters only: all identity/
//! duplicate/persistence decisions live in `ebookreader_domain::store`,
//! which carries its own TDD coverage (`crates/domain/src/store.rs`).

use crate::db::{managed_books_dir, DbState};
use crate::{OcrEngineState, ReadingSessionState};
use ebookreader_domain::actual_reading_time::{
    active_duration, load_actual_reading_time, save_actual_reading_time, ActualReadingTime,
};
use ebookreader_domain::assets::{self, AssetKind, ReadingAsset};
use ebookreader_domain::book_hours::{cumulative_book_hours, load_workload_config, save_workload_config, WorkloadConfig};
use ebookreader_domain::calendar::{self, DayDetail};
use ebookreader_domain::completion::ReadingProgress;
use ebookreader_domain::document_location::{load_location, save_location, DocumentLocation};
use ebookreader_domain::fonts::parse_system_font_registry_names;
use ebookreader_domain::ocr::{self, OcrJob, OcrJobStatus, OcrScope};
use ebookreader_domain::ocr_engine::{reading_order_text, OcrEngine};
use ebookreader_domain::progress_store::{load_progress, save_progress};
use ebookreader_domain::reading_session::SessionState;
use ebookreader_domain::search::{self, SearchHit};
use ebookreader_domain::store::{
    get_book, import_book, import_book_managed, list_books, relink_book_file, remove_book,
    BookSummary, OwnershipMode, RelinkOutcome,
};
use serde::Serialize;
use std::time::Duration;
use std::path::Path;
use tauri::{AppHandle, State};
use winreg::enums::HKEY_LOCAL_MACHINE;
use winreg::RegKey;

/// Import a book file into the Library.
///
/// `ownership_mode` must be `"reference"` or `"managed_copy"`
/// (`PRODUCT_SPEC.md` "Reference" / "Managed Copy"; default V1 import mode
/// is Reference). Returns the resulting `book_id`, which is the same
/// existing id if this file's fingerprint is already in the Library
/// (`PRODUCT_SPEC.md` "Duplicate import").
#[tauri::command]
pub fn import_book_command(
    app: AppHandle,
    state: State<DbState>,
    path: String,
    ownership_mode: String,
) -> Result<String, String> {
    let file_path = Path::new(&path);
    let title = file_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Untitled")
        .to_string();
    let format = file_path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();

    let mode = match ownership_mode.as_str() {
        "reference" => OwnershipMode::Reference,
        "managed_copy" => OwnershipMode::ManagedCopy,
        other => return Err(format!("unknown ownership_mode: {other}")),
    };

    let conn = state.0.lock().map_err(|e| format!("Library database lock poisoned: {e}"))?;

    match mode {
        OwnershipMode::Reference => import_book(&conn, file_path, &title, &format, mode),
        OwnershipMode::ManagedCopy => {
            let managed_dir = managed_books_dir(&app)?;
            import_book_managed(&conn, file_path, &title, &format, mode, &managed_dir)
        }
    }
    .map_err(|e| format!("import failed: {e}"))
}

/// List every Book currently in the Library, most recently imported first.
#[tauri::command]
pub fn list_library_command(state: State<DbState>) -> Result<Vec<BookSummary>, String> {
    let conn = state.0.lock().map_err(|e| format!("Library database lock poisoned: {e}"))?;
    list_books(&conn).map_err(|e| format!("could not list Library: {e}"))
}

/// Attempt to relink `book_id`'s BookFile to `candidate_path`.
///
/// Returns `"relinked"` if the candidate's fingerprint matched and the
/// path was updated, or `"fingerprint_mismatch"` if not (the stored path
/// is left unchanged in that case -- `ARCHITECTURE.md` "Changed
/// fingerprint: Do not silently inherit").
#[tauri::command]
pub fn relink_book_command(
    state: State<DbState>,
    book_id: String,
    candidate_path: String,
) -> Result<String, String> {
    let conn = state.0.lock().map_err(|e| format!("Library database lock poisoned: {e}"))?;
    let outcome = relink_book_file(&conn, &book_id, Path::new(&candidate_path))
        .map_err(|e| format!("relink failed: {e}"))?;
    Ok(match outcome {
        RelinkOutcome::Relinked => "relinked",
        RelinkOutcome::FingerprintMismatch => "fingerprint_mismatch",
    }
    .to_string())
}

/// Remove `book_id` from the Library. A Managed-Copy file's app-managed
/// copy is deleted; a Reference file's source is never touched
/// (`PRODUCT_SPEC.md`).
#[tauri::command]
pub fn remove_book_command(state: State<DbState>, book_id: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| format!("Library database lock poisoned: {e}"))?;
    remove_book(&conn, &book_id).map_err(|e| format!("remove failed: {e}"))
}

/// Read a Book's file bytes off disk so the Reader can hand them to the
/// format-specific renderer (`foliate-js` for EPUB, `pdf.js` for PDF) in
/// the webview, which cannot read local paths directly.
#[tauri::command]
pub fn read_book_file_command(state: State<DbState>, book_id: String) -> Result<Vec<u8>, String> {
    let conn = state.0.lock().map_err(|e| format!("Library database lock poisoned: {e}"))?;
    let book = get_book(&conn, &book_id)
        .map_err(|e| format!("could not look up book: {e}"))?
        .ok_or_else(|| format!("no such book: {book_id}"))?;
    std::fs::read(&book.path).map_err(|e| format!("could not read {}: {e}", book.path))
}

/// Save the current reading position for a Book (`ARCHITECTURE.md` SS5
/// DocumentLocation).
#[tauri::command]
pub fn save_reading_location_command(
    state: State<DbState>,
    location: DocumentLocation,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| format!("Library database lock poisoned: {e}"))?;
    save_location(&conn, &location).map_err(|e| format!("could not save reading location: {e}"))
}

/// Load the saved reading position for a Book, if any.
#[tauri::command]
pub fn load_reading_location_command(
    state: State<DbState>,
    book_id: String,
) -> Result<Option<DocumentLocation>, String> {
    let conn = state.0.lock().map_err(|e| format!("Library database lock poisoned: {e}"))?;
    load_location(&conn, &book_id).map_err(|e| format!("could not load reading location: {e}"))
}

/// List SYSTEM font families installed on Windows, per `ARCHITECTURE.md`
/// SS14: enumerated/invoked for typography controls, never copied into the
/// product. Reads registered font names, never font file bytes.
#[tauri::command]
pub fn list_system_fonts_command() -> Result<Vec<String>, String> {
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let fonts_key = hklm
        .open_subkey(r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts")
        .map_err(|e| format!("could not open the Windows Fonts registry key: {e}"))?;

    let raw_names: Vec<String> = fonts_key.enum_values().filter_map(|entry| entry.ok().map(|(name, _)| name)).collect();

    Ok(parse_system_font_registry_names(raw_names))
}

#[derive(Debug, Serialize)]
pub struct ReadingSessionStatus {
    /// "active" | "paused_locked" | "paused_suspended"
    pub state: String,
    pub total_excluded_ms: u128,
}

/// Current ReadingSession pause state, per `ARCHITECTURE.md` SS10: exact
/// lock/sleep-excluded time, maintained by the real Win32 hook
/// (`reading_session_hook`), not a fixed inactivity heuristic. Consumed by
/// Actual Reading Time / Book Hours computation (M3).
#[tauri::command]
pub fn reading_session_status_command(state: State<ReadingSessionState>) -> Result<ReadingSessionStatus, String> {
    let session = state
        .0
        .lock()
        .map_err(|e| format!("ReadingSession lock poisoned: {e}"))?;
    let state_str = match session.state() {
        SessionState::Active => "active",
        SessionState::PausedLocked => "paused_locked",
        SessionState::PausedSuspended => "paused_suspended",
    };
    Ok(ReadingSessionStatus {
        state: state_str.to_string(),
        total_excluded_ms: session.total_excluded().as_millis(),
    })
}

/// Load a Book's reading progress (`PRODUCT_SPEC.md` SS8). A never-opened
/// Book reads as a fresh, 0%-progress `ReadingProgress` -- not an error.
#[tauri::command]
pub fn get_reading_progress_command(state: State<DbState>, book_id: String) -> Result<ReadingProgress, String> {
    let conn = state.0.lock().map_err(|e| format!("Library database lock poisoned: {e}"))?;
    load_progress(&conn, &book_id).map_err(|e| format!("could not load reading progress: {e}"))
}

/// SS8.2: forward progress within the active read only (backtracking
/// cannot move this backwards -- enforced in `ReadingProgress` itself).
#[tauri::command]
pub fn advance_reading_progress_command(
    state: State<DbState>,
    book_id: String,
    progress_percent: f64,
) -> Result<ReadingProgress, String> {
    let conn = state.0.lock().map_err(|e| format!("Library database lock poisoned: {e}"))?;
    let mut progress = load_progress(&conn, &book_id).map_err(|e| format!("{e}"))?;
    progress.advance_active_progress(progress_percent);
    save_progress(&conn, &book_id, &progress).map_err(|e| format!("could not save reading progress: {e}"))?;
    Ok(progress)
}

/// SS8.1: reaching the final page. Increments completed_read_count and
/// closes the active read.
#[tauri::command]
pub fn complete_current_read_command(state: State<DbState>, book_id: String) -> Result<ReadingProgress, String> {
    let conn = state.0.lock().map_err(|e| format!("Library database lock poisoned: {e}"))?;
    let mut progress = load_progress(&conn, &book_id).map_err(|e| format!("{e}"))?;
    progress.complete_current_read();
    save_progress(&conn, &book_id, &progress).map_err(|e| format!("could not save reading progress: {e}"))?;
    Ok(progress)
}

/// SS8.1 "If Yes": start the next read.
#[tauri::command]
pub fn start_next_read_command(state: State<DbState>, book_id: String) -> Result<ReadingProgress, String> {
    let conn = state.0.lock().map_err(|e| format!("Library database lock poisoned: {e}"))?;
    let mut progress = load_progress(&conn, &book_id).map_err(|e| format!("{e}"))?;
    progress.start_next_read();
    save_progress(&conn, &book_id, &progress).map_err(|e| format!("could not save reading progress: {e}"))?;
    Ok(progress)
}

/// SS8.4: manual completed-read override from Data -> Book Data. Never
/// touches ReadingSession or Actual Reading Time history.
#[tauri::command]
pub fn override_completed_reads_command(
    state: State<DbState>,
    book_id: String,
    completed_read_count: u32,
) -> Result<ReadingProgress, String> {
    let conn = state.0.lock().map_err(|e| format!("Library database lock poisoned: {e}"))?;
    let mut progress = load_progress(&conn, &book_id).map_err(|e| format!("{e}"))?;
    progress.manual_override(completed_read_count);
    save_progress(&conn, &book_id, &progress).map_err(|e| format!("could not save reading progress: {e}"))?;
    Ok(progress)
}

#[derive(Debug, Serialize)]
pub struct BookHours {
    pub base_hours: f64,
    pub cumulative_hours: f64,
    pub cumulative_reading_percent: f64,
}

/// `PRODUCT_SPEC.md` SS9: Base/Cumulative Book Hours, computed from the
/// Book's workload config and its current Cumulative Reading %. `None` if
/// no workload config has been set yet for this Book.
#[tauri::command]
pub fn get_book_hours_command(state: State<DbState>, book_id: String) -> Result<Option<BookHours>, String> {
    let conn = state.0.lock().map_err(|e| format!("Library database lock poisoned: {e}"))?;
    let config = load_workload_config(&conn, &book_id).map_err(|e| format!("{e}"))?;
    let Some(config) = config else { return Ok(None) };

    let progress = load_progress(&conn, &book_id).map_err(|e| format!("{e}"))?;
    let cumulative_reading_percent = progress.cumulative_percent();
    let base_hours = config.base_book_hours();

    Ok(Some(BookHours {
        base_hours,
        cumulative_hours: cumulative_book_hours(base_hours, cumulative_reading_percent),
        cumulative_reading_percent,
    }))
}

/// Set/update a Book's workload config (SS9.1 inputs). Per SS9.3, this
/// only changes the current estimate -- it cannot touch Actual Reading
/// Time, which this command has no access to.
#[tauri::command]
pub fn save_workload_config_command(
    state: State<DbState>,
    book_id: String,
    quantity: f64,
    baseline_speed: f64,
    difficulty_coefficient: f64,
) -> Result<WorkloadConfig, String> {
    let conn = state.0.lock().map_err(|e| format!("Library database lock poisoned: {e}"))?;
    let config = WorkloadConfig { quantity, baseline_speed, difficulty_coefficient };
    save_workload_config(&conn, &book_id, &config).map_err(|e| format!("could not save workload config: {e}"))?;
    Ok(config)
}

/// `PRODUCT_SPEC.md` SS10: a Book's accumulated Actual Reading Time.
#[tauri::command]
pub fn get_actual_reading_time_command(state: State<DbState>, book_id: String) -> Result<ActualReadingTime, String> {
    let conn = state.0.lock().map_err(|e| format!("Library database lock poisoned: {e}"))?;
    load_actual_reading_time(&conn, &book_id).map_err(|e| format!("could not load Actual Reading Time: {e}"))
}

/// Record a real elapsed reading interval for a Book, net of any OS
/// lock/sleep exclusion during it (SS10 "OS lock/sleep always pauses").
/// The caller (the Reader's heartbeat) supplies both durations, derived
/// from real wall-clock elapsed time and the ReadingSession hook's
/// excluded-time delta over the same interval -- never fabricated here.
///
/// `day` (the caller's local `YYYY-MM-DD`) is also folded into the
/// Calendar's day-keyed aggregate (`[[calendar]]`), computed from the
/// exact same `active_duration` figure this command already derives for
/// the per-book ledger -- one fact, recorded into two groupings, never a
/// second independently-computed source of "how much was read."
#[tauri::command]
pub fn record_active_reading_time_command(
    state: State<DbState>,
    book_id: String,
    elapsed_seconds: f64,
    excluded_seconds: f64,
    day: String,
) -> Result<ActualReadingTime, String> {
    let conn = state.0.lock().map_err(|e| format!("Library database lock poisoned: {e}"))?;
    let active = active_duration(
        Duration::from_secs_f64(elapsed_seconds.max(0.0)),
        Duration::from_secs_f64(excluded_seconds.max(0.0)),
    );

    let mut art = load_actual_reading_time(&conn, &book_id).map_err(|e| format!("{e}"))?;
    art.record(active, Duration::ZERO);
    save_actual_reading_time(&conn, &book_id, &art).map_err(|e| format!("could not save Actual Reading Time: {e}"))?;

    calendar::record_daily_reading_time(&conn, &day, active)
        .map_err(|e| format!("could not record Calendar daily reading time: {e}"))?;

    Ok(art)
}

/// A Calendar day's actual reading total plus the lightweight goal that
/// was in effect on that day (`[[calendar]]`).
#[tauri::command]
pub fn get_calendar_day_command(state: State<DbState>, day: String) -> Result<DayDetail, String> {
    let conn = state.0.lock().map_err(|e| format!("Library database lock poisoned: {e}"))?;
    calendar::load_day_detail(&conn, &day).map_err(|e| format!("could not load Calendar day detail: {e}"))
}

/// Every day with recorded reading activity in `[start_day, end_day]`
/// (inclusive `YYYY-MM-DD`), for painting a calendar month's activity
/// dots in one round-trip.
#[tauri::command]
pub fn get_calendar_range_command(
    state: State<DbState>,
    start_day: String,
    end_day: String,
) -> Result<Vec<(String, f64)>, String> {
    let conn = state.0.lock().map_err(|e| format!("Library database lock poisoned: {e}"))?;
    calendar::load_reading_time_in_range(&conn, &start_day, &end_day)
        .map_err(|e| format!("could not load Calendar range: {e}"))
}

/// Set the lightweight daily reading goal, effective from `effective_day`
/// onward (ROADMAP.md M6 "lightweight goals" -- a single number, not a
/// streak/badge system).
#[tauri::command]
pub fn set_daily_goal_command(state: State<DbState>, effective_day: String, seconds: f64) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| format!("Library database lock poisoned: {e}"))?;
    calendar::set_daily_goal(&conn, &effective_day, seconds.max(0.0))
        .map_err(|e| format!("could not save the daily reading goal: {e}"))
}

/// Index (or re-index) one searchable text entry for a Book -- e.g. a
/// Note or Excerpt's text (`ROADMAP.md` M4).
#[tauri::command]
pub fn index_search_text_command(
    state: State<DbState>,
    book_id: String,
    kind: String,
    entry_id: String,
    content: String,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| format!("Library database lock poisoned: {e}"))?;
    search::index_text(&conn, &book_id, &kind, &entry_id, &content)
        .map_err(|e| format!("could not index search text: {e}"))
}

/// Library-wide search (`ROADMAP.md` M4: "global search covers required
/// sources"), through the CJK bigram adapter so 2-character Chinese
/// queries resolve correctly.
#[tauri::command]
pub fn search_library_command(state: State<DbState>, query: String) -> Result<Vec<SearchHit>, String> {
    let conn = state.0.lock().map_err(|e| format!("Library database lock poisoned: {e}"))?;
    search::search(&conn, &query).map_err(|e| format!("search failed: {e}"))
}

/// In-book search, restricted to one Book's indexed entries.
#[tauri::command]
pub fn search_in_book_command(state: State<DbState>, query: String, book_id: String) -> Result<Vec<SearchHit>, String> {
    let conn = state.0.lock().map_err(|e| format!("Library database lock poisoned: {e}"))?;
    search::search_in_book(&conn, &query, &book_id).map_err(|e| format!("search failed: {e}"))
}

/// Rebuild the search index from canonical source data. Per
/// `PRODUCT_SPEC.md` SS12 ("Search index is derived state and must be
/// rebuildable"): this only touches the derived `search_index` table,
/// never `reading_asset` or any other canonical table.
#[tauri::command]
pub fn rebuild_search_index_command(state: State<DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| format!("Library database lock poisoned: {e}"))?;
    search::rebuild_index(&conn).map_err(|e| format!("could not rebuild search index: {e}"))
}

fn parse_asset_kind(kind: &str) -> Result<AssetKind, String> {
    match kind {
        "annotation" => Ok(AssetKind::Annotation),
        "excerpt" => Ok(AssetKind::Excerpt),
        "note" => Ok(AssetKind::Note),
        other => Err(format!("unknown asset kind: {other}")),
    }
}

/// Create a Notebook asset (Annotation/Note/Excerpt, `PRODUCT_SPEC.md`
/// SS4.7-4.9). `anchor` is `None` for a free-standing Note. Also indexes
/// the asset's text into the search index (`ROADMAP.md` M4: "global search
/// covers required sources" includes "Note content", "Excerpt content",
/// "user-authored annotation text/metadata").
#[tauri::command]
pub fn create_reading_asset_command(
    state: State<DbState>,
    book_id: String,
    kind: String,
    text: String,
    anchor: Option<DocumentLocation>,
) -> Result<ReadingAsset, String> {
    let conn = state.0.lock().map_err(|e| format!("Library database lock poisoned: {e}"))?;
    let asset = ReadingAsset {
        id: uuid::Uuid::new_v4().to_string(),
        book_id,
        kind: parse_asset_kind(&kind)?,
        text,
        anchor,
        orphaned: false,
    };
    assets::create_asset(&conn, &asset).map_err(|e| format!("could not create reading asset: {e}"))?;
    search::index_text(&conn, &asset.book_id, &kind, &asset.id, &asset.text)
        .map_err(|e| format!("could not index reading asset text: {e}"))?;
    Ok(asset)
}

/// A Book's Notebook: all its Annotation/Note/Excerpt assets.
#[tauri::command]
pub fn list_reading_assets_command(state: State<DbState>, book_id: String) -> Result<Vec<ReadingAsset>, String> {
    let conn = state.0.lock().map_err(|e| format!("Library database lock poisoned: {e}"))?;
    assets::list_assets_for_book(&conn, &book_id).map_err(|e| format!("could not list reading assets: {e}"))
}

/// Global Notes: cross-book asset listing, optionally filtered by kind.
#[tauri::command]
pub fn list_all_reading_assets_command(state: State<DbState>, kind: Option<String>) -> Result<Vec<ReadingAsset>, String> {
    let conn = state.0.lock().map_err(|e| format!("Library database lock poisoned: {e}"))?;
    let kind = kind.map(|k| parse_asset_kind(&k)).transpose()?;
    assets::list_all_assets(&conn, kind).map_err(|e| format!("could not list reading assets: {e}"))
}

/// Mark an asset Orphaned/Detached because its source anchor became
/// unrecoverable (e.g. a relink to a file that no longer contains it).
/// Per `PRODUCT_SPEC.md` SS11, this never deletes the asset's text.
#[tauri::command]
pub fn mark_reading_asset_orphaned_command(state: State<DbState>, asset_id: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| format!("Library database lock poisoned: {e}"))?;
    assets::mark_orphaned(&conn, &asset_id).map_err(|e| format!("could not mark asset orphaned: {e}"))
}

/// Create an OCR job for a Book (`PRODUCT_SPEC.md` SS13.1: "user chooses
/// Current Page, Selected Pages, or Entire Book"). This records the job's
/// scope/status only -- running the actual OCR engine against `scope` is
/// a later checkpoint (see `ebookreader_domain::ocr`'s module doc for why
/// real inference isn't wired yet).
#[tauri::command]
pub fn create_ocr_job_command(state: State<DbState>, book_id: String, scope: OcrScope) -> Result<OcrJob, String> {
    let conn = state.0.lock().map_err(|e| format!("Library database lock poisoned: {e}"))?;
    let job = OcrJob { id: uuid::Uuid::new_v4().to_string(), book_id, scope, status: OcrJobStatus::Pending };
    ocr::create_job(&conn, &job).map_err(|e| format!("could not create OCR job: {e}"))?;
    Ok(job)
}

#[tauri::command]
pub fn get_ocr_job_command(state: State<DbState>, job_id: String) -> Result<Option<OcrJob>, String> {
    let conn = state.0.lock().map_err(|e| format!("Library database lock poisoned: {e}"))?;
    ocr::get_job(&conn, &job_id).map_err(|e| format!("could not load OCR job: {e}"))
}

/// Pause/resume/cancel an OCR job, or record its terminal outcome
/// (SS13.1: "jobs can pause/resume/cancel"; "successful completion has an
/// explicit semantic success state").
#[tauri::command]
pub fn set_ocr_job_status_command(state: State<DbState>, job_id: String, status: OcrJobStatus) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| format!("Library database lock poisoned: {e}"))?;
    ocr::set_job_status(&conn, &job_id, status).map_err(|e| format!("could not update OCR job status: {e}"))
}

/// Save (or overwrite) one page's raw OCR text -- the rebuildable cache
/// (SS13.1: "raw OCR/cache is rebuildable").
#[tauri::command]
pub fn save_ocr_page_result_command(state: State<DbState>, book_id: String, page_number: u32, text: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| format!("Library database lock poisoned: {e}"))?;
    ocr::save_page_result(&conn, &book_id, page_number, &text).map_err(|e| format!("could not save OCR page result: {e}"))
}

/// Save a user's correction to one page's OCR text. Canonical user data
/// -- `clear_ocr_cache_command` never touches it (`ROADMAP.md` M5 Exit
/// Gate: "Manual corrections survive raw OCR/cache rebuild and restart").
#[tauri::command]
pub fn save_ocr_correction_command(state: State<DbState>, book_id: String, page_number: u32, corrected_text: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| format!("Library database lock poisoned: {e}"))?;
    ocr::save_correction(&conn, &book_id, page_number, &corrected_text)
        .map_err(|e| format!("could not save OCR correction: {e}"))?;
    // Keep Library-wide Search current with the user's correction, not the
    // stale raw OCR text (PRODUCT_SPEC.md SS12's "corrected OCR text").
    search::index_text(&conn, &book_id, "book_text", &page_number.to_string(), &corrected_text).ok();
    Ok(())
}

/// The text a Reader/search should actually use for a page: the user's
/// correction if one exists, else the raw OCR result, else `None`.
#[tauri::command]
pub fn get_ocr_effective_text_command(state: State<DbState>, book_id: String, page_number: u32) -> Result<Option<String>, String> {
    let conn = state.0.lock().map_err(|e| format!("Library database lock poisoned: {e}"))?;
    ocr::effective_text(&conn, &book_id, page_number).map_err(|e| format!("could not load OCR text: {e}"))
}

/// Delete all raw OCR results for a Book (cache invalidation/rebuild).
/// Corrections are untouched -- see `save_ocr_correction_command`.
#[tauri::command]
pub fn clear_ocr_cache_command(state: State<DbState>, book_id: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| format!("Library database lock poisoned: {e}"))?;
    ocr::clear_page_results(&conn, &book_id).map_err(|e| format!("could not clear OCR cache: {e}"))
}

/// Searches this machine for the local, gitignored `ocr-assets/` dev
/// convention (`tooling/m5-evidence/README.md`): the current working
/// directory and the running executable's directory, each searched up
/// through a few parent levels for a folder containing `onnxruntime.dll`.
///
/// This is a dev-only convenience, not a release distribution strategy --
/// per that same evidence doc, the final self-contained model/runtime
/// packaging decision is explicitly deferred to later release evidence
/// work, not resolved here.
fn find_ocr_assets_dir() -> Option<std::path::PathBuf> {
    let mut roots = Vec::new();
    if let Ok(cwd) = std::env::current_dir() {
        roots.push(cwd);
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            roots.push(dir.to_path_buf());
        }
    }
    for root in roots {
        let mut dir = root.as_path();
        for _ in 0..6 {
            let candidate = dir.join("ocr-assets");
            if candidate.join("onnxruntime.dll").is_file() {
                return Some(candidate);
            }
            match dir.parent() {
                Some(parent) => dir = parent,
                None => break,
            }
        }
    }
    None
}

/// Runs the real OCR pipeline (detect -> classify orientation -> recognize
/// -> reading-order assembly) over the given pages and saves each page's
/// result via `ocr::save_page_result` -- the rebuildable cache a user's
/// correction (`save_ocr_correction_command`) always takes priority over
/// (`ROADMAP.md` M5 Exit Gate).
///
/// Pages are passed as **PNG-encoded image bytes**, not file paths: a
/// scanned PDF page only ever exists as an in-memory `<canvas>` render in
/// `PdfReader.tsx` (`pdfjs-dist` renders directly to canvas; there is no
/// per-page image file on disk to point a path at). The frontend calls
/// `canvas.toDataURL('image/png')` and sends the bytes directly.
///
/// Synchronous for now: this call blocks until every page in `pages` is
/// processed (real 3-model inference is not fast -- seconds per page).
/// Real mid-run pause/cancel and incremental progress reporting are not
/// wired here; `OcrJobStatus::Running` is set for the duration and
/// `Succeeded`/`Failed` at the end. Wiring actual pause/cancel/progress
/// into this call is scoped to the frontend job-trigger/progress UI
/// checkpoint, not this one.
#[tauri::command]
pub fn run_ocr_job_command(
    state: State<DbState>,
    ocr_state: State<OcrEngineState>,
    job_id: String,
    book_id: String,
    pages: Vec<(u32, Vec<u8>)>,
) -> Result<(), String> {
    {
        let conn = state.0.lock().map_err(|e| format!("Library database lock poisoned: {e}"))?;
        ocr::set_job_status(&conn, &job_id, OcrJobStatus::Running)
            .map_err(|e| format!("could not start OCR job: {e}"))?;
    }

    let mut engine_guard = ocr_state.0.lock().map_err(|e| format!("OCR engine lock poisoned: {e}"))?;
    if engine_guard.is_none() {
        let assets_dir = find_ocr_assets_dir()
            .ok_or_else(|| "OCR is unavailable on this machine (no local OCR model assets found)".to_string())?;
        let engine = OcrEngine::load(
            &assets_dir.join("onnxruntime.dll"),
            &assets_dir.join("PP-OCRv6_det_medium.onnx"),
            &assets_dir.join("ch_ppocr_mobile_v2.0_cls_mobile.onnx"),
            &assets_dir.join("PP-OCRv6_rec_small.onnx"),
        )
        .map_err(|e| format!("failed to load OCR engine: {e}"))?;
        *engine_guard = Some(engine);
    }
    let engine = engine_guard.as_mut().expect("just set to Some above");

    for (page_number, image_bytes) in pages {
        // Real pause/cancel (SS13.1: "jobs can pause/resume/cancel"): this
        // call is otherwise a single blocking loop, so mid-run pause/cancel
        // can only work by having a *concurrent* set_ocr_job_status_command
        // call update the job row while this loop is running, and this loop
        // noticing it between pages. Resume is the frontend's job: it
        // re-derives which pages still lack a saved result and issues a
        // fresh run_ocr_job_command for only those.
        {
            let conn = state.0.lock().map_err(|e| format!("Library database lock poisoned: {e}"))?;
            if let Ok(Some(job)) = ocr::get_job(&conn, &job_id) {
                if matches!(job.status, OcrJobStatus::Paused | OcrJobStatus::Cancelled) {
                    return Ok(());
                }
            }
        }

        let img = match image::load_from_memory(&image_bytes) {
            Ok(img) => img,
            Err(e) => {
                let conn = state.0.lock().map_err(|e| format!("Library database lock poisoned: {e}"))?;
                ocr::set_job_status(&conn, &job_id, OcrJobStatus::Failed).ok();
                return Err(format!("could not decode page {page_number} image: {e}"));
            }
        };
        let lines = match engine.process_page(&img) {
            Ok(lines) => lines,
            Err(e) => {
                let conn = state.0.lock().map_err(|e| format!("Library database lock poisoned: {e}"))?;
                ocr::set_job_status(&conn, &job_id, OcrJobStatus::Failed).ok();
                return Err(format!("OCR failed on page {page_number}: {e}"));
            }
        };
        let text = reading_order_text(&lines);
        let conn = state.0.lock().map_err(|e| format!("Library database lock poisoned: {e}"))?;
        ocr::save_page_result(&conn, &book_id, page_number, &text)
            .map_err(|e| format!("could not save OCR page result: {e}"))?;
        // PRODUCT_SPEC.md SS12's required Library-wide Search source list
        // names "corrected OCR text" -- index the raw result now so it's
        // searchable immediately; save_ocr_correction_command re-indexes
        // with the corrected text when/if the user edits it.
        search::index_text(&conn, &book_id, "book_text", &page_number.to_string(), &text).ok();
    }

    let conn = state.0.lock().map_err(|e| format!("Library database lock poisoned: {e}"))?;
    ocr::set_job_status(&conn, &job_id, OcrJobStatus::Succeeded)
        .map_err(|e| format!("could not finish OCR job: {e}"))
}
