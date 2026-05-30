// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;
mod notes;
mod system_notes;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle();
            config::ensure_config_file_exists(handle)?;
            if let Err(e) = config::prune_stale_pinned_paths(handle) {
                eprintln!("prune_stale_pinned_paths: {e}");
            }
            if let Err(e) = notes::ensure_editor_shortcuts_note(handle) {
                eprintln!("ensure_editor_shortcuts_note: {e}");
            }
            if let Err(e) = notes::ensure_markdown_reference_note(handle.clone()) {
                eprintln!("ensure_markdown_reference_note: {e}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            notes::search_notes,
            notes::list_notes,
            notes::list_notes_detail,
            notes::read_note,
            notes::delete_note,
            notes::delete_notes,
            notes::toggle_pin_note,
            notes::save_note,
            notes::upsert_system_note,
            notes::ensure_markdown_reference_note,
            notes::replace_tag_globally,
            notes::remove_tag_globally,
            config::get_config,
            config::save_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
