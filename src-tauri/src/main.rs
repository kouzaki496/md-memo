// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;
mod notes;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle();
            config::ensure_config_file_exists(&handle)
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
            config::get_config,
            config::save_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
