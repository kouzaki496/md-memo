use std::path::Path;

const SYSTEM_NOTE_NAMES: &[&str] = &["editor-shortcuts.md"];

pub const BUILTIN_RESERVED_TAG: &str = "_builtin";
pub const REFERENCE_PURPOSE_TAG: &str = "reference";
pub const SHORTCUTS_PURPOSE_TAG: &str = "shortcuts";
pub const BUILTIN_TAGS_REFERENCE: &[&str] = &[BUILTIN_RESERVED_TAG, REFERENCE_PURPOSE_TAG];
pub const BUILTIN_TAGS_SHORTCUTS: &[&str] = &[BUILTIN_RESERVED_TAG, SHORTCUTS_PURPOSE_TAG];

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

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn is_builtin_reserved_tag_name_matches_with_optional_hash() {
        assert!(is_builtin_reserved_tag_name("_builtin"));
        assert!(is_builtin_reserved_tag_name("  #_builtin  "));
        assert!(!is_builtin_reserved_tag_name("inbox"));
        assert!(!is_builtin_reserved_tag_name("reference"));
    }

    #[test]
    fn is_system_note_file_name_is_case_insensitive() {
        assert!(is_system_note_file_name("editor-shortcuts.md"));
        assert!(is_system_note_file_name("Editor-Shortcuts.MD"));
        assert!(!is_system_note_file_name("note.md"));
    }

    #[test]
    fn is_system_note_path_uses_file_name_only() {
        assert!(is_system_note_path(Path::new("/vault/editor-shortcuts.md")));
        assert!(!is_system_note_path(Path::new("/vault/note.md")));
    }

    #[test]
    fn builtin_tag_constants_match_contract() {
        assert_eq!(BUILTIN_TAGS_REFERENCE, &["_builtin", "reference"]);
        assert_eq!(BUILTIN_TAGS_SHORTCUTS, &["_builtin", "shortcuts"]);
        assert_eq!(REFERENCE_PURPOSE_TAG, "reference");
        assert_eq!(SHORTCUTS_PURPOSE_TAG, "shortcuts");
    }
}
