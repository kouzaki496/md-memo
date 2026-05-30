//! アプリ設定（`AppLocalData/config.json`）

use crate::app_error::{self, io, err};
use serde::{Deserialize, Serialize};
use std::error::Error;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::path::BaseDirectory;
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;

pub fn default_notes_dir() -> String {
    "scriptax-notes".to_string()
}

pub fn default_template_tags() -> Vec<String> {
    vec!["inbox".to_string(), "todo".to_string(), "idea".to_string()]
}

pub fn default_theme_mode() -> String {
    "".to_string()
}

pub fn default_theme_preset() -> String {
    "".to_string()
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    /// ドキュメント直下のフォルダ名（相対）または絶対パス
    #[serde(default = "default_notes_dir", alias = "notes_dir")]
    pub notes_dir: String,
    #[serde(default, alias = "pinned_paths")]
    pub pinned_paths: Vec<String>,
    #[serde(default = "default_template_tags", alias = "template_tags")]
    pub template_tags: Vec<String>,
    #[serde(default = "default_theme_mode", alias = "theme_mode")]
    pub theme_mode: String,
    #[serde(default = "default_theme_preset", alias = "theme_preset")]
    pub theme_preset: String,
    /// 初回シード済みメモ（ファイル名）。削除後の再生成は行わない。
    #[serde(default, alias = "seeded_notes")]
    pub seeded_notes: Vec<String>,
    /// 初回セットアップ完了。`None` は従来 config（完了扱い）、`Some(false)` は未完了。
    #[serde(default, alias = "setup_completed")]
    pub setup_completed: Option<bool>,
    #[serde(default, alias = "darkMode", alias = "dark_mode", skip_serializing)]
    pub dark_mode_legacy: Option<bool>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            notes_dir: default_notes_dir(),
            pinned_paths: Vec::new(),
            template_tags: default_template_tags(),
            theme_mode: "system".to_string(),
            theme_preset: "default".to_string(),
            seeded_notes: Vec::new(),
            setup_completed: Some(false),
            dark_mode_legacy: None,
        }
    }
}

pub fn is_setup_completed(cfg: &AppConfig) -> bool {
    if cfg.setup_completed == Some(false) {
        return false;
    }
    if cfg.setup_completed == Some(true) {
        return true;
    }
    !cfg.notes_dir.trim().is_empty()
}

fn normalize_theme_mode(cfg: &mut AppConfig) {
    if cfg.theme_mode.trim().is_empty() {
        cfg.theme_mode = match cfg.dark_mode_legacy {
            Some(true) => "dark".to_string(),
            Some(false) => "light".to_string(),
            None => "system".to_string(),
        };
        return;
    }
    let normalized = cfg.theme_mode.to_lowercase();
    cfg.theme_mode = match normalized.as_str() {
        "system" | "light" | "dark" => normalized,
        _ => "system".to_string(),
    };
}

fn normalize_theme_preset(cfg: &mut AppConfig) {
    if cfg.theme_preset.trim().is_empty() {
        cfg.theme_preset = "default".to_string();
        return;
    }
    let normalized = cfg.theme_preset.to_lowercase();
    cfg.theme_preset = match normalized.as_str() {
        "default" | "sepia" | "high-contrast" => normalized,
        _ => "default".to_string(),
    };
}

pub fn resolve_notes_dir_path(app: &tauri::AppHandle, notes_dir: &str) -> Result<PathBuf, String> {
    let trimmed = notes_dir.trim();
    if trimmed.is_empty() {
        return Err(err(app_error::NOTES_DIR_EMPTY));
    }
    if PathBuf::from(trimmed).is_absolute() {
        Ok(PathBuf::from(trimmed))
    } else {
        app.path()
            .resolve(trimmed, BaseDirectory::Document)
            .map_err(|e| io(app_error::NOTES_DIR_RESOLVE_FAILED, e))
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
            let mut cfg = serde_json::from_str::<AppConfig>(&content).unwrap_or_default();
            normalize_theme_mode(&mut cfg);
            normalize_theme_preset(&mut cfg);
            cfg
        }
    } else {
        let mut cfg = AppConfig::default();
        normalize_theme_mode(&mut cfg);
        normalize_theme_preset(&mut cfg);
        cfg
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

/// 別PCへ移したあとなど、実ファイルが無いピン留めパスを `config.json` から取り除く。
pub fn prune_stale_pinned_paths(app: &tauri::AppHandle) -> Result<(), String> {
    let mut cfg = load_config(app);
    let before = cfg.pinned_paths.len();
    cfg.pinned_paths
        .retain(|p| !p.trim().is_empty() && Path::new(p).is_file());
    if cfg.pinned_paths.len() != before {
        save_config_file(app, &cfg)?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_config(app: tauri::AppHandle) -> AppConfig {
    load_config(&app)
}

#[tauri::command]
pub fn resolve_notes_dir(app: tauri::AppHandle, notes_dir: String) -> Result<String, String> {
    resolve_notes_dir_path(&app, &notes_dir).map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn open_notes_dir(app: tauri::AppHandle, notes_dir: String) -> Result<(), String> {
    let trimmed = notes_dir.trim();
    if trimmed.is_empty() {
        return Err(err(app_error::NOTES_DIR_EMPTY));
    }
    let path = resolve_notes_dir_path(&app, trimmed)?;
    fs::create_dir_all(&path).map_err(|e| io(app_error::NOTES_DIR_CREATE_FAILED, e))?;
    app.opener()
        .open_path(path.to_string_lossy().into_owned(), None::<&str>)
        .map_err(|e| io(app_error::NOTES_DIR_OPEN_FAILED, e))
}

#[tauri::command]
pub fn save_config(app: tauri::AppHandle, config: AppConfig) -> Result<(), String> {
    save_config_file(&app, &config)
}

pub fn save_config_file(app: &tauri::AppHandle, config: &AppConfig) -> Result<(), String> {
    let mut cfg = config.clone();
    if cfg.notes_dir.trim().is_empty() {
        return Err(err(app_error::NOTES_DIR_REQUIRED));
    }
    cfg.notes_dir = cfg.notes_dir.trim().to_string();
    normalize_theme_mode(&mut cfg);
    normalize_theme_preset(&mut cfg);
    cfg.dark_mode_legacy = None;
    let path = get_config_path(&app);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| io(app_error::CONFIG_SAVE_FAILED, e))?;
    }
    let content = serde_json::to_string_pretty(&cfg).map_err(|e| io(app_error::CONFIG_SAVE_FAILED, e))?;
    fs::write(path, content).map_err(|e| io(app_error::CONFIG_SAVE_FAILED, e))
}
