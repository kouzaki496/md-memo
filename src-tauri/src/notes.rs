//! メモの検索・保存

use crate::config;
use rayon::prelude::*;
use std::fs;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use tauri::path::BaseDirectory;
use tauri::Manager;
use walkdir::WalkDir;

#[tauri::command]
pub fn search_notes(query: String, dir_path: String) -> Vec<String> {
    let path = PathBuf::from(dir_path);
    if !path.exists() {
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
        .filter_map(|path| search_in_file(path, &query).ok())
        .flatten()
        .collect()
}

fn search_in_file(path: &PathBuf, query: &str) -> std::io::Result<Vec<String>> {
    let file = File::open(path)?;
    let reader = BufReader::new(file);
    let mut results = Vec::new();

    for (index, line) in reader.lines().enumerate() {
        let line = line?;
        if line.contains(query) {
            results.push(format!("{}:{}:{}", path.display(), index + 1, line));
        }
    }
    Ok(results)
}

#[tauri::command]
pub fn save_note(
    app: tauri::AppHandle,
    content: String,
    current_path: Option<String>,
) -> Result<String, String> {
    let cfg = config::load_config(&app);
    let notes_root = if PathBuf::from(&cfg.notes_dir).is_absolute() {
        PathBuf::from(&cfg.notes_dir)
    } else {
        app.path()
            .resolve(&cfg.notes_dir, BaseDirectory::Document)
            .map_err(|e| e.to_string())?
    };
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
