mod commands;
mod db;
#[cfg(windows)]
mod reading_session_hook;

use commands::{
    add_book_to_collection_command, add_tag_to_book_command,
    advance_reading_progress_command, clear_ocr_cache_command, complete_current_read_command,
    create_app_data_backup_command, create_collection_command, create_full_library_backup_command, create_ocr_job_command,
    create_reading_asset_command, delete_collection_command, export_notebook_markdown_command, get_actual_reading_time_command, get_book_hours_command,
    get_alignment_package_command, get_calendar_day_command, get_calendar_range_command,
    get_ocr_effective_text_command, get_ocr_job_command, get_reading_progress_command, get_setting_command,
    import_alignment_package_command,
    import_book_command, index_search_text_command, list_all_reading_assets_command,
    list_book_ids_in_collection_command, list_collections_command, list_collections_for_book_command, list_library_command,
    list_reading_assets_command, list_system_fonts_command, list_tags_for_book_command,
    list_workload_config_revisions_command, load_reading_location_command,
    delete_managed_copy_file_command, delete_reading_data_command, mark_reading_asset_orphaned_command,
    override_completed_reads_command, preview_backup_command,
    pause_reading_session_command, read_book_file_command, reading_session_status_command,
    record_active_reading_time_command, record_book_opened_command, relink_book_command, resume_reading_session_command,
    start_note_taking_command, stop_note_taking_command,
    remove_book_command, remove_book_from_collection_command, remove_tag_from_book_command, rename_collection_command,
    restore_backup_command, run_ocr_job_command, save_ocr_correction_command,
    save_ocr_page_result_command, save_reading_location_command, save_workload_config_command,
    rebuild_search_index_command, search_in_book_command, search_library_command, set_daily_goal_command,
    set_ocr_job_status_command, set_setting_command, start_next_read_command, update_book_title_command,
};
use ebookreader_domain::ocr_engine::OcrEngine;
use ebookreader_domain::reading_session::ReadingSession;
use std::sync::{Arc, Mutex};
use tauri::Manager;

pub struct ReadingSessionState(pub Arc<Mutex<ReadingSession>>);

/// The loaded OCR engine, if any -- `None` until the first OCR job actually
/// runs (loading three ONNX sessions is expensive and unnecessary for users
/// who never use OCR). See `commands::find_ocr_assets_dir` for how the
/// model files are located.
pub struct OcrEngineState(pub Mutex<Option<OcrEngine>>);

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
            app.manage(OcrEngineState(Mutex::new(None)));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            import_book_command,
            list_library_command,
            record_book_opened_command,
            update_book_title_command,
            create_collection_command,
            rename_collection_command,
            delete_collection_command,
            list_collections_command,
            add_book_to_collection_command,
            remove_book_from_collection_command,
            list_book_ids_in_collection_command,
            list_collections_for_book_command,
            add_tag_to_book_command,
            remove_tag_from_book_command,
            list_tags_for_book_command,
            relink_book_command,
            remove_book_command,
            delete_reading_data_command,
            delete_managed_copy_file_command,
            read_book_file_command,
            save_reading_location_command,
            load_reading_location_command,
            list_system_fonts_command,
            reading_session_status_command,
            pause_reading_session_command,
            resume_reading_session_command,
            start_note_taking_command,
            stop_note_taking_command,
            get_reading_progress_command,
            advance_reading_progress_command,
            complete_current_read_command,
            start_next_read_command,
            override_completed_reads_command,
            get_book_hours_command,
            save_workload_config_command,
            list_workload_config_revisions_command,
            get_actual_reading_time_command,
            record_active_reading_time_command,
            get_calendar_day_command,
            get_calendar_range_command,
            set_daily_goal_command,
            import_alignment_package_command,
            get_alignment_package_command,
            create_app_data_backup_command,
            create_full_library_backup_command,
            preview_backup_command,
            restore_backup_command,
            index_search_text_command,
            search_library_command,
            search_in_book_command,
            rebuild_search_index_command,
            create_reading_asset_command,
            list_reading_assets_command,
            export_notebook_markdown_command,
            list_all_reading_assets_command,
            mark_reading_asset_orphaned_command,
            create_ocr_job_command,
            get_ocr_job_command,
            set_ocr_job_status_command,
            save_ocr_page_result_command,
            save_ocr_correction_command,
            get_ocr_effective_text_command,
            clear_ocr_cache_command,
            run_ocr_job_command,
            get_setting_command,
            set_setting_command
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
