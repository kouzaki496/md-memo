//! メモの検索・保存

use crate::config;
use rayon::prelude::*;
use serde::Serialize;
use std::fs;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use tauri::path::BaseDirectory;
use tauri::Manager;
use walkdir::WalkDir;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteMeta {
    pub path: String,
    pub title: String,
    pub pinned: bool,
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
    pub char_count: usize,
    pub updated_ms: i64,
    pub preview: String,
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
        .all(|t| lines.iter().any(|line| line.contains(t)));
    if !file_matches_all_terms {
        return Ok(vec![]);
    }

    // 返却は 1 ファイル 1 件。代表行として最初に一致した行を使う。
    let first_hit = lines.into_iter().enumerate().find_map(|(index, line)| {
        if terms.iter().any(|t| line.contains(t)) {
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
            NoteMeta {
                path: path_str,
                title,
                pinned,
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
    fs::read_to_string(path).map_err(|e| e.to_string())
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
