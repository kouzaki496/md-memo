//! アプリ全体で編集モードを1ウィンドウに限定するロック

use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditLockState {
    pub holder_label: String,
    pub note_path: Option<String>,
}

static EDIT_LOCK: Mutex<Option<EditLockState>> = Mutex::new(None);

pub const EDIT_LOCK_CHANGED: &str = "edit-lock-changed";

fn emit_lock(app: &AppHandle, state: &EditLockState) {
    let _ = app.emit(EDIT_LOCK_CHANGED, state);
}

#[tauri::command]
pub fn acquire_edit_lock(
    app: AppHandle,
    window_label: String,
    note_path: Option<String>,
) -> Result<(), String> {
    let state = EditLockState {
        holder_label: window_label,
        note_path,
    };
    {
        let mut lock = EDIT_LOCK.lock().map_err(|e| e.to_string())?;
        *lock = Some(state.clone());
    }
    emit_lock(&app, &state);
    Ok(())
}

#[tauri::command]
pub fn release_edit_lock(window_label: String) -> Result<(), String> {
    let mut lock = EDIT_LOCK.lock().map_err(|e| e.to_string())?;
    if lock
        .as_ref()
        .is_some_and(|s| s.holder_label == window_label)
    {
        *lock = None;
    }
    Ok(())
}

pub fn release_if_holder(app: &AppHandle, window_label: &str) {
    if let Ok(mut lock) = EDIT_LOCK.lock() {
        if lock
            .as_ref()
            .is_some_and(|s| s.holder_label == window_label)
        {
            *lock = None;
        }
    }
    let _ = app;
}
