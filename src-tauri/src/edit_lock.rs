//! アプリ全体で編集モードを1ウィンドウに限定するロック

use crate::app_error::{self, io};
use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

#[derive(Clone, Serialize, PartialEq, Eq, Debug)]
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

pub(crate) fn take_edit_lock(
    lock: &mut Option<EditLockState>,
    window_label: String,
    note_path: Option<String>,
) -> EditLockState {
    let state = EditLockState {
        holder_label: window_label,
        note_path,
    };
    *lock = Some(state.clone());
    state
}

pub(crate) fn release_edit_lock_if_holder(lock: &mut Option<EditLockState>, window_label: &str) -> bool {
    if lock
        .as_ref()
        .is_some_and(|s| s.holder_label == window_label)
    {
        *lock = None;
        true
    } else {
        false
    }
}

#[tauri::command]
pub fn acquire_edit_lock(
    app: AppHandle,
    window_label: String,
    note_path: Option<String>,
) -> Result<(), String> {
    let state = {
        let mut lock = EDIT_LOCK.lock().map_err(|e| io(app_error::INTERNAL_LOCK_FAILED, e))?;
        take_edit_lock(&mut lock, window_label, note_path)
    };
    emit_lock(&app, &state);
    Ok(())
}

#[tauri::command]
pub fn release_edit_lock(window_label: String) -> Result<(), String> {
    let mut lock = EDIT_LOCK.lock().map_err(|e| io(app_error::INTERNAL_LOCK_FAILED, e))?;
    release_edit_lock_if_holder(&mut lock, &window_label);
    Ok(())
}

pub fn release_if_holder(app: &AppHandle, window_label: &str) {
    if let Ok(mut lock) = EDIT_LOCK.lock() {
        release_edit_lock_if_holder(&mut lock, window_label);
    }
    let _ = app;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn take_edit_lock_replaces_previous_holder() {
        let mut lock = None;
        let first = take_edit_lock(&mut lock, "main".into(), Some("/a.md".into()));
        assert_eq!(
            first,
            EditLockState {
                holder_label: "main".into(),
                note_path: Some("/a.md".into()),
            }
        );
        take_edit_lock(&mut lock, "note-1".into(), None);
        assert_eq!(lock.as_ref().unwrap().holder_label, "note-1");
        assert!(lock.as_ref().unwrap().note_path.is_none());
    }

    #[test]
    fn release_only_clears_matching_holder() {
        let mut lock = Some(EditLockState {
            holder_label: "main".into(),
            note_path: None,
        });
        assert!(!release_edit_lock_if_holder(&mut lock, "other"));
        assert!(lock.is_some());
        assert!(release_edit_lock_if_holder(&mut lock, "main"));
        assert!(lock.is_none());
    }
}
