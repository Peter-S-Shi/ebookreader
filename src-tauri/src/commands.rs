//! Tauri command surface for the Library. Thin adapters only: all identity/
//! duplicate/persistence decisions live in `ebookreader_domain::store`,
//! which carries its own TDD coverage (`crates/domain/src/store.rs`).

use crate::db::{managed_books_dir, DbState};
use ebookreader_domain::store::{
    import_book, import_book_managed, list_books, relink_book_file, BookSummary, OwnershipMode,
    RelinkOutcome,
};
use std::path::Path;
use tauri::{AppHandle, State};

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
