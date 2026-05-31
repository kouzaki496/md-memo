use super::frontmatter::parse_tags_from_content;
use super::search_cache::{invalidate_search_cache, invalidate_search_cache_file};
use super::store::{
    collect_markdown_paths, file_timestamps_ms, resolve_notes_root, sort_paths_by_recency,
};
use super::types::{NoteDetail, NoteMeta};
use crate::app_error::{self, err, io, with_detail};
use crate::config;
use crate::system_notes;
use std::fs;
use std::path::{Path, PathBuf};

pub(crate) fn note_title_from_path(path: &Path) -> String {
    path.file_name()
        .and_then(|n| n.to_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| "untitled.md".to_string())
}

pub(crate) fn note_preview_from_content(content: &str) -> String {
    content.lines().take(2).collect::<Vec<_>>().join(" / ")
}

pub(crate) fn is_note_path_deletable(path: &Path) -> bool {
    !system_notes::is_system_note_path(path)
}

/// 新規メモ用の `{date}-{n}.md` パス（存在しない最初の n）。
pub(crate) fn next_dated_note_path(notes_root: &Path, date_str: &str) -> PathBuf {
    let mut count = 1;
    let mut path = notes_root.join(format!("{date_str}-{count}.md"));
    while path.exists() {
        count += 1;
        path = notes_root.join(format!("{date_str}-{count}.md"));
    }
    path
}

pub(crate) fn resolve_save_target_path(
    notes_root: &Path,
    current_path: Option<&str>,
) -> Result<PathBuf, String> {
    if let Some(path_str) = current_path.filter(|p| !p.is_empty()) {
        let p = PathBuf::from(path_str);
        if system_notes::is_system_note_path(&p) {
            return Err(err(app_error::BUILTIN_NOTE_READ_ONLY));
        }
        if p.is_absolute() {
            Ok(p)
        } else {
            let name = p
                .file_name()
                .ok_or_else(|| err(app_error::SAVE_PATH_INVALID))?;
            Ok(notes_root.join(name))
        }
    } else {
        let date_str = chrono::Local::now().format("%Y-%m-%d").to_string();
        Ok(next_dated_note_path(notes_root, &date_str))
    }
}

#[tauri::command]
pub fn list_notes(app: tauri::AppHandle) -> Result<Vec<NoteMeta>, String> {
    let cfg = config::load_config(&app);
    let notes_root = resolve_notes_root(&app)?;
    fs::create_dir_all(&notes_root).map_err(|e| io(app_error::NOTES_DIR_CREATE_FAILED, e))?;

    let mut paths = collect_markdown_paths(&notes_root)?;
    sort_paths_by_recency(&mut paths);

    Ok(paths
        .into_iter()
        .map(|path| {
            let path_str = path.to_string_lossy().into_owned();
            let title = note_title_from_path(&path);
            let pinned = cfg.pinned_paths.iter().any(|p| p == &path_str);
            let tags = fs::read_to_string(&path)
                .ok()
                .map(|content| parse_tags_from_content(&content))
                .unwrap_or_default();
            let (updated_ms, created_ms) = file_timestamps_ms(&path);
            NoteMeta {
                path: path_str,
                title,
                pinned,
                system_note: system_notes::is_system_note_path(&path),
                tags,
                updated_ms,
                created_ms,
            }
        })
        .collect())
}

#[tauri::command]
pub fn list_notes_detail(app: tauri::AppHandle) -> Result<Vec<NoteDetail>, String> {
    let cfg = config::load_config(&app);
    let notes_root = resolve_notes_root(&app)?;
    fs::create_dir_all(&notes_root).map_err(|e| io(app_error::NOTES_DIR_CREATE_FAILED, e))?;

    let mut paths = collect_markdown_paths(&notes_root)?;
    sort_paths_by_recency(&mut paths);

    let details = paths
        .into_iter()
        .map(|path| {
            let path_str = path.to_string_lossy().into_owned();
            let title = note_title_from_path(&path);
            let pinned = cfg.pinned_paths.iter().any(|p| p == &path_str);
            let content = fs::read_to_string(&path).unwrap_or_default();
            let tags = parse_tags_from_content(&content);
            let char_count = content.chars().count();
            let preview = note_preview_from_content(&content);
            let (updated_ms, created_ms) = file_timestamps_ms(&path);
            NoteDetail {
                path: path_str,
                title,
                pinned,
                system_note: system_notes::is_system_note_path(&path),
                tags,
                char_count,
                updated_ms,
                created_ms,
                preview,
            }
        })
        .collect();
    Ok(details)
}

#[tauri::command]
pub fn read_note(path: String) -> Result<String, String> {
    let p = PathBuf::from(&path);
    if !p.is_file() {
        return Err(with_detail(app_error::NOTE_NOT_FOUND, path));
    }
    fs::read_to_string(&p).map_err(|e| io(app_error::NOTE_READ_FAILED, e))
}

#[tauri::command]
pub fn delete_note(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if system_notes::is_system_note_path(&p) {
        return Err(err(app_error::BUILTIN_NOTE_NO_DELETE));
    }
    fs::remove_file(&path).map_err(|e| io(app_error::FILE_DELETE_FAILED, e))?;

    invalidate_search_cache_file(p.as_path());

    let mut cfg = config::load_config(&app);
    cfg.pinned_paths.retain(|p| p != &path);
    config::save_config_file(&app, &cfg)?;
    Ok(())
}

#[tauri::command]
pub fn delete_notes(app: tauri::AppHandle, paths: Vec<String>) -> Result<usize, String> {
    if paths.is_empty() {
        return Ok(0);
    }
    let mut deleted = 0usize;
    for path in &paths {
        if !is_note_path_deletable(PathBuf::from(path).as_path()) {
            continue;
        }
        if fs::remove_file(path).is_ok() {
            deleted += 1;
        }
    }
    let deletable_paths: Vec<&String> = paths
        .iter()
        .filter(|p| is_note_path_deletable(PathBuf::from(p.as_str()).as_path()))
        .collect();
    let mut cfg = config::load_config(&app);
    cfg.pinned_paths
        .retain(|p| !deletable_paths.iter().any(|x| x.as_str() == p));
    config::save_config_file(&app, &cfg)?;
    if deleted > 0 {
        invalidate_search_cache();
    }
    Ok(deleted)
}

#[tauri::command]
pub fn toggle_pin_note(app: tauri::AppHandle, path: String, pinned: bool) -> Result<(), String> {
    if !pinned && system_notes::is_system_note_path(PathBuf::from(&path).as_path()) {
        return Err(err(app_error::BUILTIN_NOTE_NO_UNPIN));
    }
    let mut cfg = config::load_config(&app);
    if pinned {
        if !cfg.pinned_paths.iter().any(|p| p == &path) {
            cfg.pinned_paths.push(path);
        }
    } else {
        cfg.pinned_paths.retain(|p| p != &path);
    }
    config::save_config_file(&app, &cfg)
}

#[tauri::command]
pub fn save_note(
    app: tauri::AppHandle,
    content: String,
    current_path: Option<String>,
) -> Result<String, String> {
    let notes_root = resolve_notes_root(&app)?;
    fs::create_dir_all(&notes_root).map_err(|e| io(app_error::NOTES_DIR_CREATE_FAILED, e))?;

    let target_path = resolve_save_target_path(&notes_root, current_path.as_deref())?;

    fs::write(&target_path, content).map_err(|e| io(app_error::FILE_WRITE_FAILED, e))?;

    invalidate_search_cache_file(&target_path);

    Ok(target_path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::app_error;
    use std::fs;

    #[test]
    fn note_title_from_path_uses_file_name() {
        assert_eq!(
            note_title_from_path(Path::new("/vault/work.md")),
            "work.md"
        );
    }

    #[test]
    fn note_preview_from_content_joins_first_two_lines() {
        assert_eq!(
            note_preview_from_content("line one\nline two\nline three"),
            "line one / line two"
        );
    }

    #[test]
    fn is_note_path_deletable_rejects_system_note() {
        assert!(!is_note_path_deletable(Path::new(
            "/vault/editor-shortcuts.md"
        )));
        assert!(is_note_path_deletable(Path::new("/vault/work.md")));
    }

    #[test]
    fn next_dated_note_path_skips_existing_files() {
        let dir = std::env::temp_dir().join(format!(
            "md-memo-crud-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("2026-05-29-1.md"), "a").unwrap();
        fs::write(dir.join("2026-05-29-2.md"), "b").unwrap();

        let path = next_dated_note_path(&dir, "2026-05-29");
        assert_eq!(path, dir.join("2026-05-29-3.md"));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn resolve_save_target_path_rejects_builtin_note() {
        let root = Path::new("/notes");
        assert_eq!(
            resolve_save_target_path(root, Some("/notes/editor-shortcuts.md")).unwrap_err(),
            app_error::BUILTIN_NOTE_READ_ONLY
        );
    }

    #[test]
    fn resolve_save_target_path_joins_relative_name_to_root() {
        let root = Path::new("/notes");
        assert_eq!(
            resolve_save_target_path(root, Some("draft.md")).unwrap(),
            PathBuf::from("/notes/draft.md")
        );
    }

    #[test]
    fn resolve_save_target_path_keeps_absolute_path() {
        let root = Path::new("/notes");
        let absolute = if cfg!(windows) {
            PathBuf::from(r"C:\other\keep.md")
        } else {
            PathBuf::from("/other/keep.md")
        };
        assert_eq!(
            resolve_save_target_path(root, Some(absolute.to_str().unwrap())).unwrap(),
            absolute
        );
    }
}
