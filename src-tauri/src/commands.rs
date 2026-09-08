//! Tauri command surface for the Library. Thin adapters only: all identity/
//! duplicate/persistence decisions live in `ebookreader_domain::store`,
//! which carries its own TDD coverage (`crates/domain/src/store.rs`).

use crate::db::{managed_books_dir, DbState};
use crate::ReadingSessionState;
use ebookreader_domain::actual_reading_time::{load_actual_reading_time, save_actual_reading_time, ActualReadingTime};
use ebookreader_domain::book_hours::{cumulative_book_hours, load_workload_config, save_workload_config, WorkloadConfig};
use ebookreader_domain::completion::ReadingProgress;
use ebookreader_domain::document_location::{load_location, save_location, DocumentLocation};
use ebookreader_domain::fonts::parse_system_font_registry_names;
use ebookreader_domain::progress_store::{load_progress, save_progress};
use ebookreader_domain::reading_session::SessionState;
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
#[tauri::command]
pub fn record_active_reading_time_command(
    state: State<DbState>,
    book_id: String,
    elapsed_seconds: f64,
    excluded_seconds: f64,
) -> Result<ActualReadingTime, String> {
    let conn = state.0.lock().map_err(|e| format!("Library database lock poisoned: {e}"))?;
    let mut art = load_actual_reading_time(&conn, &book_id).map_err(|e| format!("{e}"))?;
    art.record(
        Duration::from_secs_f64(elapsed_seconds.max(0.0)),
        Duration::from_secs_f64(excluded_seconds.max(0.0)),
    );
    save_actual_reading_time(&conn, &book_id, &art).map_err(|e| format!("could not save Actual Reading Time: {e}"))?;
    Ok(art)
}
