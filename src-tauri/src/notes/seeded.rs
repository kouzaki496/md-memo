use super::frontmatter::{merge_required_tags, parse_tags_from_content, rebuild_note_frontmatter_tags};
use super::store::resolve_notes_root;
use crate::app_error::{self, err, io};
use crate::config;
use crate::system_notes;
use std::fs;
use std::path::Path;

const DEFAULT_EDITOR_SHORTCUTS_MD: &str = include_str!("../../resources/editor-shortcuts.default.md");
const DEFAULT_MARKDOWN_REFERENCE_MD: &str = include_str!("../../resources/markdown-reference.default.md");
const MARKDOWN_REFERENCE_FILE_NAME: &str = "markdown-reference.md";

fn is_seeded_note(cfg: &config::AppConfig, file_name: &str) -> bool {
    cfg.seeded_notes
        .iter()
        .any(|n| n.eq_ignore_ascii_case(file_name))
}

fn mark_note_seeded(app: &tauri::AppHandle, file_name: &str) -> Result<(), String> {
    let mut cfg = config::load_config(app);
    if is_seeded_note(&cfg, file_name) {
        return Ok(());
    }
    cfg.seeded_notes.push(file_name.to_string());
    config::save_config_file(app, &cfg)
}

fn ensure_note_pinned(app: &tauri::AppHandle, target_path: &Path) {
    let mut cfg = config::load_config(app);
    let path_str = target_path.to_string_lossy().into_owned();
    if cfg.pinned_paths.iter().any(|p| p == &path_str) {
        return;
    }
    cfg.pinned_paths.push(path_str);
    if let Err(e) = config::save_config_file(app, &cfg) {
        eprintln!("ensure_note_pinned: ピン留めの保存に失敗: {e}");
    }
}

/// 既存 reference メモの先頭 tags に `_builtin` と `reference` が無ければ付与する。
fn ensure_reference_note_builtin_tags(target_path: &Path) -> Result<(), String> {
    let content = fs::read_to_string(target_path).map_err(|e| io(app_error::NOTE_READ_FAILED, e))?;
    let required = system_notes::BUILTIN_TAGS_REFERENCE;
    let existing = parse_tags_from_content(&content);
    let next = merge_required_tags(existing.clone(), required);
    if existing == next {
        return Ok(());
    }

    let new_content = if content.starts_with("---") {
        rebuild_note_frontmatter_tags(&content, next).ok_or_else(|| {
            "reference メモのタグを更新できませんでした".to_string()
        })?
    } else {
        format!(
            "---\ntags: {}\n---\n{}",
            required.join(", "),
            content
        )
    };

    fs::write(target_path, new_content).map_err(|e| io(app_error::FILE_WRITE_FAILED, e))
}

/// 初回のみ Markdown 構文リファレンスを生成する（削除後は再生成しない）。
#[tauri::command]
pub fn ensure_markdown_reference_note(app: tauri::AppHandle) -> Result<(), String> {
    let cfg = config::load_config(&app);
    let notes_root = resolve_notes_root(&app)?;
    fs::create_dir_all(&notes_root).map_err(|e| io(app_error::NOTES_DIR_CREATE_FAILED, e))?;
    let target_path = notes_root.join(MARKDOWN_REFERENCE_FILE_NAME);

    if target_path.is_file() {
        ensure_reference_note_builtin_tags(&target_path)?;
        ensure_note_pinned(&app, &target_path);
        if !is_seeded_note(&cfg, MARKDOWN_REFERENCE_FILE_NAME) {
            mark_note_seeded(&app, MARKDOWN_REFERENCE_FILE_NAME)?;
        }
        return Ok(());
    }

    if is_seeded_note(&cfg, MARKDOWN_REFERENCE_FILE_NAME) {
        return Ok(());
    }

    upsert_system_note_inner(
        &app,
        MARKDOWN_REFERENCE_FILE_NAME.to_string(),
        DEFAULT_MARKDOWN_REFERENCE_MD.to_string(),
        true,
    )?;
    mark_note_seeded(&app, MARKDOWN_REFERENCE_FILE_NAME)?;
    Ok(())
}

/// フロントより先に実行し、ショートカット説明メモが無いときだけ用意する（本文更新はフロントが担当）。
pub fn ensure_editor_shortcuts_note(app: &tauri::AppHandle) -> Result<(), String> {
    let notes_root = resolve_notes_root(app)?;
    fs::create_dir_all(&notes_root).map_err(|e| io(app_error::NOTES_DIR_CREATE_FAILED, e))?;
    let target_path = notes_root.join("editor-shortcuts.md");

    if target_path.is_file() {
        let mut cfg = config::load_config(app);
        let path_str = target_path.to_string_lossy().into_owned();
        if !cfg.pinned_paths.iter().any(|p| p == &path_str) {
            cfg.pinned_paths.push(path_str);
            if let Err(e) = config::save_config_file(app, &cfg) {
                eprintln!("ensure_editor_shortcuts_note: ピン留めの保存に失敗: {e}");
            }
        }
        return Ok(());
    }

    upsert_system_note_inner(
        app,
        "editor-shortcuts.md".to_string(),
        DEFAULT_EDITOR_SHORTCUTS_MD.to_string(),
        true,
    )?;
    Ok(())
}

fn upsert_system_note_inner(
    app: &tauri::AppHandle,
    file_name: String,
    content: String,
    pin: bool,
) -> Result<String, String> {
    let notes_root = resolve_notes_root(app)?;
    fs::create_dir_all(&notes_root).map_err(|e| io(app_error::NOTES_DIR_CREATE_FAILED, e))?;

    if file_name.trim().is_empty() {
        return Err(err(app_error::FILE_NAME_EMPTY));
    }
    if file_name.contains('/') || file_name.contains('\\') {
        return Err(err(app_error::FILE_NAME_INVALID));
    }

    let normalized = if file_name.ends_with(".md") {
        file_name
    } else {
        format!("{file_name}.md")
    };

    let target_path = notes_root.join(normalized);
    fs::write(&target_path, content).map_err(|e| io(app_error::FILE_WRITE_FAILED, e))?;

    if pin {
        let mut cfg = config::load_config(app);
        let path_str = target_path.to_string_lossy().into_owned();
        if !cfg.pinned_paths.iter().any(|p| p == &path_str) {
            cfg.pinned_paths.push(path_str);
            if let Err(e) = config::save_config_file(app, &cfg) {
                eprintln!("upsert_system_note: メモは保存済みだがピン留め用 config の保存に失敗: {e}");
            }
        }
    }

    Ok(target_path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn upsert_system_note(
    app: tauri::AppHandle,
    file_name: String,
    content: String,
    pin: bool,
) -> Result<String, String> {
    upsert_system_note_inner(&app, file_name, content, pin)
}
