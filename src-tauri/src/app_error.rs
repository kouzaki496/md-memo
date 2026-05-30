//! Tauri コマンドが返すエラーコード。表示文言はフロントの `messages.ts` に集約する。

pub const NOTES_DIR_EMPTY: &str = "notes_dir_empty";
pub const NOTES_DIR_REQUIRED: &str = "notes_dir_required";
pub const NOTES_DIR_OPEN_FAILED: &str = "notes_dir_open_failed";
pub const NOTES_DIR_RESOLVE_FAILED: &str = "notes_dir_resolve_failed";
pub const NOTES_DIR_CREATE_FAILED: &str = "notes_dir_create_failed";
pub const CONFIG_SAVE_FAILED: &str = "config_save_failed";

pub const NOTE_NOT_FOUND: &str = "note_not_found";
pub const NOTE_READ_FAILED: &str = "note_read_failed";
pub const NOTE_PATH_EMPTY: &str = "note_path_empty";
pub const SAVE_PATH_INVALID: &str = "save_path_invalid";
pub const BUILTIN_NOTE_NO_DELETE: &str = "builtin_note_no_delete";
pub const BUILTIN_NOTE_NO_UNPIN: &str = "builtin_note_no_unpin";
pub const BUILTIN_NOTE_READ_ONLY: &str = "builtin_note_read_only";
pub const NOTE_WINDOW_OPEN_FAILED: &str = "note_window_open_failed";
pub const FILE_NAME_EMPTY: &str = "file_name_empty";
pub const FILE_NAME_INVALID: &str = "file_name_invalid";
pub const FILE_WRITE_FAILED: &str = "file_write_failed";
pub const FILE_DELETE_FAILED: &str = "file_delete_failed";

pub const TAG_REPLACE_FROM_EMPTY: &str = "tag_replace_from_empty";
pub const TAG_REPLACE_TO_EMPTY: &str = "tag_replace_to_empty";
pub const TAG_REPLACE_FROM_RESERVED: &str = "tag_replace_from_reserved";
pub const TAG_REPLACE_TO_RESERVED: &str = "tag_replace_to_reserved";
pub const TAG_REMOVE_EMPTY: &str = "tag_remove_empty";
pub const TAG_REMOVE_INBOX: &str = "tag_remove_inbox";
pub const TAG_REMOVE_RESERVED: &str = "tag_remove_reserved";

pub const PRESENTATION_SERVER_START_FAILED: &str = "presentation_server_start_failed";
pub const PRESENTATION_PORT_UNAVAILABLE: &str = "presentation_port_unavailable";
pub const PRESENTATION_SESSION_NOT_STARTED: &str = "presentation_session_not_started";
pub const PRESENTATION_ALREADY_ENDED: &str = "presentation_already_ended";
pub const BROWSER_OPEN_FAILED: &str = "browser_open_failed";
pub const INVALID_THEME_MODE: &str = "invalid_theme_mode";
pub const INVALID_THEME_PRESET: &str = "invalid_theme_preset";

pub const ATTACHMENT_EMPTY: &str = "attachment_empty";
pub const ATTACHMENT_SAVE_FAILED: &str = "attachment_save_failed";
pub const ATTACHMENT_IMPORT_FAILED: &str = "attachment_import_failed";
pub const ATTACHMENT_PATH_INVALID: &str = "attachment_path_invalid";
pub const ATTACHMENT_NOT_FOUND: &str = "attachment_not_found";
pub const ATTACHMENT_READ_FAILED: &str = "attachment_read_failed";

pub const INTERNAL_LOCK_FAILED: &str = "internal_lock_failed";

pub fn err(code: &'static str) -> String {
    code.to_string()
}

pub fn with_detail(code: &'static str, detail: impl ToString) -> String {
    #[derive(serde::Serialize)]
    struct Payload<'a> {
        code: &'a str,
        detail: String,
    }
    serde_json::to_string(&Payload {
        code,
        detail: detail.to_string(),
    })
    .unwrap_or_else(|_| code.to_string())
}

pub fn io(code: &'static str, error: impl ToString) -> String {
    with_detail(code, error)
}
