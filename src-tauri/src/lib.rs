mod commands;
mod db;
#[cfg(windows)]
mod reading_session_hook;

use commands::{
    advance_reading_progress_command, complete_current_read_command, get_reading_progress_command,
    import_book_command, list_library_command, list_system_fonts_command,
    load_reading_location_command, override_completed_reads_command, read_book_file_command,
    reading_session_status_command, relink_book_command, remove_book_command,
    save_reading_location_command, start_next_read_command,
};
use ebookreader_domain::reading_session::ReadingSession;
use std::sync::{Arc, Mutex};
use tauri::Manager;

pub struct ReadingSessionState(pub Arc<Mutex<ReadingSession>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let db_state = db::open_app_db(app.handle())?;
            app.manage(db_state);

            let reading_session = Arc::new(Mutex::new(ReadingSession::new()));
            #[cfg(windows)]
            reading_session_hook::install(reading_session.clone())
                .map_err(|e| format!("could not install session-lock hook: {e}"))?;
            app.manage(ReadingSessionState(reading_session));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            import_book_command,
            list_library_command,
            relink_book_command,
            remove_book_command,
            read_book_file_command,
            save_reading_location_command,
            load_reading_location_command,
            list_system_fonts_command,
            reading_session_status_command,
            get_reading_progress_command,
            advance_reading_progress_command,
            complete_current_read_command,
            start_next_read_command,
            override_completed_reads_command
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
