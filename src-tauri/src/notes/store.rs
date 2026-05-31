use crate::config;
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

pub(crate) fn resolve_notes_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let cfg = config::load_config(app);
    config::resolve_notes_dir_path(app, &cfg.notes_dir)
}

fn system_time_to_ms(time: std::time::SystemTime) -> i64 {
    time.duration_since(std::time::UNIX_EPOCH)
        .ok()
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub(crate) fn file_timestamps_ms(path: &Path) -> (i64, i64) {
    let Some(meta) = fs::metadata(path).ok() else {
        return (0, 0);
    };
    let updated_ms = meta
        .modified()
        .ok()
        .map(system_time_to_ms)
        .unwrap_or(0);
    let created_ms = meta
        .created()
        .ok()
        .map(system_time_to_ms)
        .unwrap_or(updated_ms);
    (updated_ms, created_ms)
}

pub(crate) fn collect_markdown_paths(notes_root: &Path) -> Result<Vec<PathBuf>, String> {
    let paths: Vec<PathBuf> = WalkDir::new(notes_root)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .map(|e| e.path().to_path_buf())
        .filter(|p| p.extension().map(|ext| ext == "md").unwrap_or(false))
        .filter(|p| p.is_file())
        .collect();
    Ok(paths)
}

pub(crate) fn sort_paths_by_recency(paths: &mut [PathBuf]) {
    paths.sort_by(|a, b| {
        let (au, ac) = file_timestamps_ms(a);
        let (bu, bc) = file_timestamps_ms(b);
        bu.cmp(&au)
            .then_with(|| bc.cmp(&ac))
            .then_with(|| a.cmp(b))
    });
}
