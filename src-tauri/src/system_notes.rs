use std::path::Path;

const SYSTEM_NOTE_NAMES: &[&str] = &["editor-shortcuts.md"];

pub const BUILTIN_RESERVED_TAG: &str = "_builtin";
pub const REFERENCE_PURPOSE_TAG: &str = "reference";
pub const BUILTIN_TAGS_REFERENCE: &[&str] = &[BUILTIN_RESERVED_TAG, REFERENCE_PURPOSE_TAG];

pub fn is_builtin_reserved_tag_name(name: &str) -> bool {
    name.trim().trim_start_matches('#').eq_ignore_ascii_case(BUILTIN_RESERVED_TAG)
}

pub fn is_system_note_file_name(name: &str) -> bool {
    let lower = name.to_lowercase();
    SYSTEM_NOTE_NAMES
        .iter()
        .any(|n| lower == n.to_lowercase())
}

pub fn is_system_note_path(path: &Path) -> bool {
    path.file_name()
        .and_then(|n| n.to_str())
        .map(is_system_note_file_name)
        .unwrap_or(false)
}
