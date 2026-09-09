//! Tauri-side wiring for the canonical SQLite connection: resolves the
//! app data directory, opens `library.sqlite3`, and applies migrations.
//! All actual schema/import logic lives in `ebookreader_domain::store`.

use rusqlite::Connection;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

pub struct DbState(pub Mutex<Connection>);

/// The canonical database file's path -- the single source of truth
/// Backup/Restore (`[[backup]]`) copies/replaces wholesale, rather than
/// re-deriving it separately and risking the two paths drifting apart.
pub fn db_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("could not resolve app data directory: {e}"))?;
    Ok(data_dir.join("library.sqlite3"))
}

/// Where automatic pre-restore recovery snapshots (`PRODUCT_SPEC.md`
/// SS16.1) are kept.
pub fn recovery_snapshots_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("could not resolve app data directory: {e}"))?;
    let dir = data_dir.join("recovery-snapshots");
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("could not create recovery-snapshots directory {dir:?}: {e}"))?;
    Ok(dir)
}

/// Copies the live database file into `recovery_snapshots_dir` before a
/// high-risk operation (`PRODUCT_SPEC.md` SS16.1: "Automatic Recovery
/// Snapshot ... created before high-risk app-data operations such as:
/// schema migration; restore; major destructive library mutation"; the
/// restore case has its own dedicated snapshot inside
/// `backup::restore`). `label` becomes part of the snapshot filename
/// (e.g. `"pre-migration"`, `"pre-destructive-mutation"`) so its cause is
/// visible without inspecting contents. A no-op if the database file
/// does not exist yet -- nothing to protect on a fresh install.
pub fn create_recovery_snapshot(app: &AppHandle, label: &str) -> Result<(), String> {
    let db_path = db_path(app)?;
    let snapshot_dir = recovery_snapshots_dir(app)?;
    let millis = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    ebookreader_domain::backup::create_recovery_snapshot(&db_path, &snapshot_dir, label, &millis.to_string(), 5)
        .map_err(|e| format!("could not create recovery snapshot: {e}"))
}

pub fn open_app_db(app: &AppHandle) -> Result<DbState, String> {
    let db_path = db_path(app)?;
    let data_dir = db_path.parent().expect("db_path always has a parent");
    std::fs::create_dir_all(data_dir)
        .map_err(|e| format!("could not create app data directory {data_dir:?}: {e}"))?;

    // The snapshot must happen before the database file is opened/created
    // by this process, both so a brand-new install (no file yet) is
    // correctly treated as "nothing to protect" and so the copy reads a
    // file no connection in this process is touching.
    create_recovery_snapshot(app, "pre-migration")?;

    let conn = Connection::open(&db_path)
        .map_err(|e| format!("could not open library database at {db_path:?}: {e}"))?;
    ebookreader_domain::store::run_migrations(&conn)
        .map_err(|e| format!("could not apply Library schema migrations: {e}"))?;
    ebookreader_domain::search::ensure_search_schema(&conn)
        .map_err(|e| format!("could not apply search index schema: {e}"))?;

    Ok(DbState(Mutex::new(conn)))
}

/// Where Managed-Copy book files are stored, per `PRODUCT_SPEC.md`
/// "Managed Copy": application-managed copies, separate from the user's
/// original source location.
pub fn managed_books_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("could not resolve app data directory: {e}"))?;
    let dir = data_dir.join("managed-books");
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("could not create managed-books directory {dir:?}: {e}"))?;
    Ok(dir)
}
