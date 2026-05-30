use super::frontmatter::{
    apply_tag_rename, dedupe_tags_case_insensitive, ensure_locked_inbox_first,
    normalize_inbox_exclusive_tags, note_frontmatter_regex, parse_tags_from_fm_inner,
    rebuild_note_frontmatter_tags, remove_tag_from_list, INBOX_TAG,
};
use super::store::resolve_notes_root;
use super::types::ReplaceTagGloballyResult;
use crate::app_error::{self, err, io};
use crate::config;
use crate::system_notes;
use std::fs;
use std::path::PathBuf;
use walkdir::WalkDir;

/// 全 `.md` のフロントマター `tags` 内で `from_tag` を `to_tag` に置換（タグ名は大文字小文字同一視）。
/// `config.json` の `template_tags` に同じタグがあれば同様に更新して保存する。
#[tauri::command]
pub fn replace_tag_globally(
    app: tauri::AppHandle,
    from_tag: String,
    to_tag: String,
) -> Result<ReplaceTagGloballyResult, String> {
    let from_trim = from_tag.trim();
    let to_trim = to_tag.trim();
    if from_trim.is_empty() {
        return Err(err(app_error::TAG_REPLACE_FROM_EMPTY));
    }
    if to_trim.is_empty() {
        return Err(err(app_error::TAG_REPLACE_TO_EMPTY));
    }
    if from_trim.eq_ignore_ascii_case(to_trim) {
        return Ok(ReplaceTagGloballyResult {
            files_changed: 0,
            changed_paths: vec![],
            template_tags: config::load_config(&app).template_tags,
        });
    }
    if system_notes::is_builtin_reserved_tag_name(from_trim) {
        return Err(err(app_error::TAG_REPLACE_FROM_RESERVED));
    }
    if system_notes::is_builtin_reserved_tag_name(to_trim) {
        return Err(err(app_error::TAG_REPLACE_TO_RESERVED));
    }

    let notes_root = resolve_notes_root(&app)?;
    fs::create_dir_all(&notes_root).map_err(|e| io(app_error::NOTES_DIR_CREATE_FAILED, e))?;

    let mut paths: Vec<PathBuf> = WalkDir::new(&notes_root)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .map(|e| e.path().to_path_buf())
        .filter(|p| p.extension().map(|ext| ext == "md").unwrap_or(false))
        .collect();

    paths.sort();

    let mut changed_paths: Vec<String> = Vec::new();

    for path in &paths {
        if system_notes::is_system_note_path(path.as_path()) {
            continue;
        }
        let content = match fs::read_to_string(path) {
            Ok(c) => c,
            Err(_) => continue,
        };
        let Some(cap) = note_frontmatter_regex().captures(&content) else {
            continue;
        };
        let fm_raw = match cap.get(1) {
            Some(m) => m.as_str(),
            None => continue,
        };
        let tags = parse_tags_from_fm_inner(fm_raw);
        if !tags.iter().any(|t| t.eq_ignore_ascii_case(from_trim)) {
            continue;
        }
        let next = apply_tag_rename(tags, from_trim, to_trim);
        let next = dedupe_tags_case_insensitive(next);
        let next = normalize_inbox_exclusive_tags(next);
        let Some(new_content) = rebuild_note_frontmatter_tags(&content, next) else {
            continue;
        };
        if new_content == content {
            continue;
        }
        fs::write(path, new_content).map_err(|e| io(app_error::FILE_WRITE_FAILED, e))?;
        changed_paths.push(path.to_string_lossy().into_owned());
    }

    let mut cfg = config::load_config(&app);
    let mut tmpl_changed = false;
    for t in &mut cfg.template_tags {
        if t.eq_ignore_ascii_case(from_trim) {
            *t = to_trim.to_string();
            tmpl_changed = true;
        }
    }
    if tmpl_changed {
        cfg.template_tags = dedupe_tags_case_insensitive(cfg.template_tags);
        cfg.template_tags = ensure_locked_inbox_first(cfg.template_tags);
        config::save_config_file(&app, &cfg)?;
    }

    Ok(ReplaceTagGloballyResult {
        files_changed: changed_paths.len(),
        changed_paths,
        template_tags: cfg.template_tags.clone(),
    })
}

/// 全 `.md` のフロントマター `tags` から指定タグを除去（大文字小文字同一視）。
#[tauri::command]
pub fn remove_tag_globally(app: tauri::AppHandle, tag: String) -> Result<ReplaceTagGloballyResult, String> {
    let target = tag.trim();
    if target.is_empty() {
        return Err(err(app_error::TAG_REMOVE_EMPTY));
    }
    if target.eq_ignore_ascii_case(INBOX_TAG) {
        return Err(err(app_error::TAG_REMOVE_INBOX));
    }
    if system_notes::is_builtin_reserved_tag_name(target) {
        return Err(err(app_error::TAG_REMOVE_RESERVED));
    }

    let notes_root = resolve_notes_root(&app)?;
    fs::create_dir_all(&notes_root).map_err(|e| io(app_error::NOTES_DIR_CREATE_FAILED, e))?;

    let mut paths: Vec<PathBuf> = WalkDir::new(&notes_root)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .map(|e| e.path().to_path_buf())
        .filter(|p| p.extension().map(|ext| ext == "md").unwrap_or(false))
        .collect();

    paths.sort();

    let mut changed_paths: Vec<String> = Vec::new();

    for path in &paths {
        if system_notes::is_system_note_path(path.as_path()) {
            continue;
        }
        let content = match fs::read_to_string(path) {
            Ok(c) => c,
            Err(_) => continue,
        };
        let Some(cap) = note_frontmatter_regex().captures(&content) else {
            continue;
        };
        let fm_raw = match cap.get(1) {
            Some(m) => m.as_str(),
            None => continue,
        };
        let tags = parse_tags_from_fm_inner(fm_raw);
        if !tags.iter().any(|t| t.eq_ignore_ascii_case(target)) {
            continue;
        }
        let next = remove_tag_from_list(tags, target);
        let next = dedupe_tags_case_insensitive(next);
        let next = normalize_inbox_exclusive_tags(next);
        let Some(new_content) = rebuild_note_frontmatter_tags(&content, next) else {
            continue;
        };
        if new_content == content {
            continue;
        }
        fs::write(path, new_content).map_err(|e| io(app_error::FILE_WRITE_FAILED, e))?;
        changed_paths.push(path.to_string_lossy().into_owned());
    }

    let mut cfg = config::load_config(&app);
    let before = cfg.template_tags.len();
    cfg.template_tags
        .retain(|t| !t.eq_ignore_ascii_case(target));
    if cfg.template_tags.len() != before {
        cfg.template_tags = dedupe_tags_case_insensitive(cfg.template_tags);
        cfg.template_tags = ensure_locked_inbox_first(cfg.template_tags);
        config::save_config_file(&app, &cfg)?;
    }

    Ok(ReplaceTagGloballyResult {
        files_changed: changed_paths.len(),
        changed_paths,
        template_tags: cfg.template_tags.clone(),
    })
}
