mod commands;
mod db;

use commands::{
    import_book_command, list_library_command, list_system_fonts_command,
    load_reading_location_command, read_book_file_command, relink_book_command,
    remove_book_command, save_reading_location_command,
};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let db_state = db::open_app_db(app.handle())?;
            app.manage(db_state);
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
            list_system_fonts_command
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
