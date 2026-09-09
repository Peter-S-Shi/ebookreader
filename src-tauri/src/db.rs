//! Tauri-side wiring for the canonical SQLite connection: resolves the
//! app data directory, opens `library.sqlite3`, and applies migrations.
//! All actual schema/import logic lives in `ebookreader_domain::store`.

use rusqlite::Connection;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

pub struct DbState(pub Mutex<Connection>);

pub fn open_app_db(app: &AppHandle) -> Result<DbState, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("could not resolve app data directory: {e}"))?;
    std::fs::create_dir_all(&data_dir)
        .map_err(|e| format!("could not create app data directory {data_dir:?}: {e}"))?;

    let db_path = data_dir.join("library.sqlite3");
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
