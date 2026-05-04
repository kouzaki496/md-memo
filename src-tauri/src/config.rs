//! アプリ設定（`AppLocalData/config.json`）

use serde::{Deserialize, Serialize};
use std::error::Error;
use std::fs;
use std::path::PathBuf;
use tauri::path::BaseDirectory;
use tauri::Manager;

pub fn default_notes_dir() -> String {
    "zen-memo-notes".to_string()
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    /// ドキュメント直下のフォルダ名（相対）または絶対パス
    #[serde(default = "default_notes_dir", alias = "notes_dir")]
    pub notes_dir: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            notes_dir: default_notes_dir(),
        }
    }
}

pub fn get_config_path(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .resolve("config.json", BaseDirectory::AppLocalData)
        .expect("Failed to get config path")
}

pub fn load_config(app: &tauri::AppHandle) -> AppConfig {
    let path = get_config_path(app);
    if path.exists() {
        let content = fs::read_to_string(&path).unwrap_or_default();
        if content.trim().is_empty() {
            AppConfig::default()
        } else {
            serde_json::from_str(&content).unwrap_or_default()
        }
    } else {
        AppConfig::default()
    }
}

/// 初回起動時など、`config.json` が無ければ既定内容で作成する
pub fn ensure_config_file_exists(app: &tauri::AppHandle) -> Result<(), Box<dyn Error>> {
    let path = get_config_path(app);
    if !path.exists() {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let cfg = AppConfig::default();
        fs::write(&path, serde_json::to_string_pretty(&cfg)?)?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_config(app: tauri::AppHandle) -> AppConfig {
    load_config(&app)
}

#[tauri::command]
pub fn save_config(app: tauri::AppHandle, config: AppConfig) -> Result<(), String> {
    let path = get_config_path(&app);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())
}
