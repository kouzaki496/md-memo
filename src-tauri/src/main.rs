// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;
mod edit_lock;
mod notes;
mod presentation;
mod preview_render;
mod system_notes;

use tauri::{Manager, RunEvent, WindowEvent};

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .on_window_event(|window, event| {
            if let WindowEvent::Destroyed = event {
                edit_lock::release_if_holder(window.app_handle(), window.label());
            }
        })
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
            notes::open_note_window,
            notes::upsert_system_note,
            notes::ensure_markdown_reference_note,
            notes::replace_tag_globally,
            notes::remove_tag_globally,
            edit_lock::acquire_edit_lock,
            edit_lock::release_edit_lock,
            config::get_config,
            config::save_config,
            presentation::start_presentation,
            presentation::set_presentation_display,
            presentation::set_presentation_theme,
            presentation::get_presentation_viewer_url,
            presentation::push_presentation_update,
            presentation::set_presentation_realtime,
            presentation::end_presentation,
            presentation::get_presentation_status,
            presentation::list_presentation_statuses,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|_app_handle, event| {
        if let RunEvent::Exit = event {
            tauri::async_runtime::block_on(presentation::shutdown_on_app_exit());
        }
    });
}
