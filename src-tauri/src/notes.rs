//! メモの検索・保存

use crate::config;
use rayon::prelude::*;
use serde::Serialize;
use regex::Regex;
use std::fs;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::sync::OnceLock;
use tauri::path::BaseDirectory;
use tauri::Manager;
use walkdir::WalkDir;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteMeta {
    pub path: String,
    pub title: String,
    pub pinned: bool,
    pub tags: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub path: String,
    pub line: usize,
    pub text: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteDetail {
    pub path: String,
    pub title: String,
    pub pinned: bool,
    pub tags: Vec<String>,
    pub char_count: usize,
    pub updated_ms: i64,
    pub preview: String,
}

/// 語に大文字が含まれる場合は大小区別、それ以外は大小区別なしで部分一致する。
fn term_matches_line(line: &str, term: &str) -> bool {
    if term.chars().any(|c| c.is_uppercase()) {
        line.contains(term)
    } else {
        line.to_lowercase().contains(&term.to_lowercase())
    }
}

fn resolve_notes_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let cfg = config::load_config(app);
    if PathBuf::from(&cfg.notes_dir).is_absolute() {
        Ok(PathBuf::from(&cfg.notes_dir))
    } else {
        app.path()
            .resolve(&cfg.notes_dir, BaseDirectory::Document)
            .map_err(|e| e.to_string())
    }
}

fn parse_tags_from_content(content: &str) -> Vec<String> {
    let mut lines = content.lines();
    if lines.next().map(str::trim) != Some("---") {
        return vec![];
    }

    let mut tags_line = None;
    for line in lines.by_ref() {
        let t = line.trim();
        if t == "---" {
            break;
        }
        if t.to_ascii_lowercase().starts_with("tags:") {
            tags_line = Some(t["tags:".len()..].trim().to_string());
        }
    }

    let Some(raw) = tags_line else {
        return vec![];
    };

    let val = raw.trim();
    if val.is_empty() {
        return vec![];
    }
    if val.starts_with('[') && val.ends_with(']') {
        let inner = &val[1..val.len() - 1];
        return inner
            .split(',')
            .map(|s| s.trim().trim_matches('"').trim_matches('\''))
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .collect();
    }

    val.split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .collect()
}

#[tauri::command]
pub fn search_notes(query: String, dir_path: String) -> Vec<SearchHit> {
    let path = PathBuf::from(dir_path);
    if !path.exists() {
        return vec![];
    }
    let terms: Vec<String> = query
        .split_whitespace()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .collect();
    if terms.is_empty() {
        return vec![];
    }

    let paths: Vec<PathBuf> = WalkDir::new(path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .map(|e| e.path().to_path_buf())
        .collect();

    paths
        .par_iter()
        .filter_map(|path| search_in_file(path, &terms).ok())
        .flatten()
        .collect()
}

fn search_in_file(path: &PathBuf, terms: &[String]) -> std::io::Result<Vec<SearchHit>> {
    let file = File::open(path)?;
    let reader = BufReader::new(file);
    let mut lines: Vec<String> = Vec::new();
    for line in reader.lines() {
        lines.push(line?);
    }

    // AND 条件: すべての語が「同一ファイル内」のどこかに存在すること
    let file_matches_all_terms = terms
        .iter()
        .all(|t| lines.iter().any(|line| term_matches_line(line, t)));
    if !file_matches_all_terms {
        return Ok(vec![]);
    }

    // 返却は 1 ファイル 1 件。代表行として最初に一致した行を使う。
    let first_hit = lines.into_iter().enumerate().find_map(|(index, line)| {
        if terms.iter().any(|t| term_matches_line(&line, t)) {
            Some(SearchHit {
                path: path.to_string_lossy().into_owned(),
                line: index + 1,
                text: line,
            })
        } else {
            None
        }
    });
    Ok(first_hit.into_iter().collect())
}

#[tauri::command]
pub fn list_notes(app: tauri::AppHandle) -> Result<Vec<NoteMeta>, String> {
    let cfg = config::load_config(&app);
    let notes_root = resolve_notes_root(&app)?;
    fs::create_dir_all(&notes_root).map_err(|e| e.to_string())?;

    let mut paths: Vec<PathBuf> = WalkDir::new(&notes_root)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .map(|e| e.path().to_path_buf())
        .filter(|p| p.extension().map(|ext| ext == "md").unwrap_or(false))
        .filter(|p| p.is_file())
        .collect();

    paths.sort_by(|a, b| b.cmp(a));

    Ok(paths
        .into_iter()
        .map(|path| {
            let path_str = path.to_string_lossy().into_owned();
            let title = path
                .file_name()
                .and_then(|n| n.to_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| "untitled.md".to_string());
            let pinned = cfg.pinned_paths.iter().any(|p| p == &path_str);
            let tags = fs::read_to_string(&path)
                .ok()
                .map(|content| parse_tags_from_content(&content))
                .unwrap_or_default();
            NoteMeta {
                path: path_str,
                title,
                pinned,
                tags,
            }
        })
        .collect())
}

#[tauri::command]
pub fn list_notes_detail(app: tauri::AppHandle) -> Result<Vec<NoteDetail>, String> {
    let cfg = config::load_config(&app);
    let notes_root = resolve_notes_root(&app)?;
    fs::create_dir_all(&notes_root).map_err(|e| e.to_string())?;

    let mut paths: Vec<PathBuf> = WalkDir::new(&notes_root)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .map(|e| e.path().to_path_buf())
        .filter(|p| p.extension().map(|ext| ext == "md").unwrap_or(false))
        .filter(|p| p.is_file())
        .collect();
    paths.sort_by(|a, b| b.cmp(a));

    let details = paths
        .into_iter()
        .map(|path| {
            let path_str = path.to_string_lossy().into_owned();
            let title = path
                .file_name()
                .and_then(|n| n.to_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| "untitled.md".to_string());
            let pinned = cfg.pinned_paths.iter().any(|p| p == &path_str);
            let content = fs::read_to_string(&path).unwrap_or_default();
            let tags = parse_tags_from_content(&content);
            let char_count = content.chars().count();
            let preview = content.lines().take(2).collect::<Vec<_>>().join(" / ");
            let updated_ms = fs::metadata(&path)
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as i64)
                .unwrap_or(0);
            NoteDetail {
                path: path_str,
                title,
                pinned,
                tags,
                char_count,
                updated_ms,
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
        return Err(format!(
            "メモが見つかりません（別PCでは「ドキュメント」内のメモフォルダをコピーするか、設定で保存先を合わせてください）: {}",
            path
        ));
    }
    fs::read_to_string(&p).map_err(|e| format!("読み込みに失敗しました: {e}"))
}

#[tauri::command]
pub fn delete_note(app: tauri::AppHandle, path: String) -> Result<(), String> {
    fs::remove_file(&path).map_err(|e| e.to_string())?;

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
        if fs::remove_file(path).is_ok() {
            deleted += 1;
        }
    }
    let mut cfg = config::load_config(&app);
    cfg.pinned_paths.retain(|p| !paths.iter().any(|x| x == p));
    config::save_config_file(&app, &cfg)?;
    Ok(deleted)
}

#[tauri::command]
pub fn toggle_pin_note(app: tauri::AppHandle, path: String, pinned: bool) -> Result<(), String> {
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
    fs::create_dir_all(&notes_root).map_err(|e| e.to_string())?;

    let target_path = if let Some(path_str) = current_path.filter(|p| !p.is_empty()) {
        let p = PathBuf::from(&path_str);
        if p.is_absolute() {
            p
        } else {
            let name = p
                .file_name()
                .ok_or_else(|| "保存先パスが不正です（ファイル名がありません）".to_string())?;
            notes_root.join(name)
        }
    } else {
        let date_str = chrono::Local::now().format("%Y-%m-%d").to_string();
        let mut count = 1;
        let mut path = notes_root.join(format!("{date_str}.md"));

        while path.exists() {
            path = notes_root.join(format!("{date_str}-{count}.md"));
            count += 1;
        }
        path
    };

    fs::write(&target_path, content).map_err(|e| e.to_string())?;

    Ok(target_path.to_string_lossy().into_owned())
}

const DEFAULT_EDITOR_SHORTCUTS_MD: &str = include_str!("../resources/editor-shortcuts.default.md");

/// フロントより先に実行し、ショートカット説明メモを必ずディスク上に用意する。
pub fn ensure_editor_shortcuts_note(app: &tauri::AppHandle) -> Result<(), String> {
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
    fs::create_dir_all(&notes_root).map_err(|e| e.to_string())?;

    if file_name.trim().is_empty() {
        return Err("file_name is empty".to_string());
    }
    if file_name.contains('/') || file_name.contains('\\') {
        return Err("file_name must not include path separators".to_string());
    }

    let normalized = if file_name.ends_with(".md") {
        file_name
    } else {
        format!("{file_name}.md")
    };

    let target_path = notes_root.join(normalized);
    fs::write(&target_path, content).map_err(|e| e.to_string())?;

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

static NOTE_FRONTMATTER: OnceLock<Regex> = OnceLock::new();

fn note_frontmatter_regex() -> &'static Regex {
    NOTE_FRONTMATTER.get_or_init(|| {
        Regex::new(r"(?s)^---\r?\n(.*?)\r?\n---\s*(?:\r?\n(.*))?$").expect("note frontmatter regex")
    })
}

fn line_starts_with_tags_ci(line: &str) -> bool {
    let t = line.trim_start();
    t.len() >= 5 && t[..5].eq_ignore_ascii_case("tags:")
}

fn parse_tags_from_fm_inner(fm: &str) -> Vec<String> {
    let mut raw_val: Option<String> = None;
    for line in fm.lines() {
        let t = line.trim_start();
        if t.len() >= 5 && t[..5].eq_ignore_ascii_case("tags:") {
            raw_val = Some(t[5..].trim().to_string());
            break;
        }
    }
    let Some(raw) = raw_val else {
        return vec![];
    };
    if raw.is_empty() {
        return vec![];
    }
    if raw.starts_with('[') && raw.ends_with(']') {
        let inner = raw[1..raw.len() - 1].trim();
        if inner.is_empty() {
            return vec![];
        }
        return inner
            .split(',')
            .map(|s| {
                s.trim()
                    .trim_matches(|c| c == '"' || c == '\'')
                    .to_string()
            })
            .filter(|s| !s.is_empty())
            .collect();
    }
    raw.split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

fn dedupe_tags_case_insensitive(tags: Vec<String>) -> Vec<String> {
    let mut out = Vec::new();
    let mut seen = std::collections::HashSet::<String>::new();
    for t in tags {
        let key = t.to_lowercase();
        if seen.insert(key) {
            out.push(t);
        }
    }
    out
}

const INBOX_TAG: &str = "inbox";

fn normalize_inbox_exclusive_tags(tags: Vec<String>) -> Vec<String> {
    let without_inbox: Vec<String> = tags
        .into_iter()
        .filter(|t| !t.eq_ignore_ascii_case(INBOX_TAG))
        .collect();
    if without_inbox.is_empty() {
        vec![INBOX_TAG.to_string()]
    } else {
        without_inbox
    }
}

fn apply_tag_rename(tags: Vec<String>, from: &str, to: &str) -> Vec<String> {
    tags.into_iter()
        .map(|t| {
            if t.eq_ignore_ascii_case(from) {
                to.to_string()
            } else {
                t
            }
        })
        .collect()
}

fn ensure_locked_inbox_first(tags: Vec<String>) -> Vec<String> {
    let rest: Vec<String> = tags
        .into_iter()
        .filter(|t| !t.eq_ignore_ascii_case(INBOX_TAG))
        .collect();
    let mut out = vec![INBOX_TAG.to_string()];
    out.extend(rest);
    out
}

fn rebuild_note_frontmatter_tags(content: &str, next_tags: Vec<String>) -> Option<String> {
    let cap = note_frontmatter_regex().captures(content)?;
    let fm_raw = cap.get(1)?.as_str();
    let body = cap.get(2).map(|m| m.as_str()).unwrap_or("");
    let fm_lines: Vec<&str> = fm_raw
        .lines()
        .filter(|l| !line_starts_with_tags_ci(l))
        .filter(|l| !l.trim().is_empty())
        .collect();
    let mut new_fm = fm_lines.join("\n");
    if !new_fm.is_empty() {
        new_fm.push('\n');
    }
    new_fm.push_str("tags: ");
    new_fm.push_str(&next_tags.join(", "));
    Some(format!("---\n{new_fm}\n---\n{body}"))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceTagGloballyResult {
    pub files_changed: usize,
    pub changed_paths: Vec<String>,
    pub template_tags: Vec<String>,
}

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
        return Err("置換元のタグを入力してください".to_string());
    }
    if to_trim.is_empty() {
        return Err("置換先のタグを入力してください".to_string());
    }
    if from_trim.eq_ignore_ascii_case(to_trim) {
        return Ok(ReplaceTagGloballyResult {
            files_changed: 0,
            changed_paths: vec![],
            template_tags: config::load_config(&app).template_tags,
        });
    }

    let notes_root = resolve_notes_root(&app)?;
    fs::create_dir_all(&notes_root).map_err(|e| e.to_string())?;

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
        fs::write(path, new_content).map_err(|e| e.to_string())?;
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
