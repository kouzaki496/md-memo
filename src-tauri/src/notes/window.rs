use crate::app_error::{self, err, io};
use std::path::Path;
use tauri::Manager;

fn percent_encode_component(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => {
                out.push_str(&format!("%{b:02X}"));
            }
        }
    }
    out
}

fn note_window_label(path: &str) -> String {
    let normalized = path.replace('\\', "/").to_lowercase();
    let mut hash: u32 = 0;
    for ch in normalized.chars() {
        hash = hash.wrapping_mul(31).wrapping_add(ch as u32);
    }
    format!("note-{hash:x}")
}

#[tauri::command]
pub async fn open_note_window(app: tauri::AppHandle, path: String) -> Result<(), String> {
    use tauri::{WebviewUrl, WebviewWindowBuilder};

    if path.trim().is_empty() {
        return Err(err(app_error::NOTE_PATH_EMPTY));
    }

    let label = note_window_label(&path);
    if let Some(existing) = app.get_webview_window(&label) {
        existing
            .set_focus()
            .map_err(|e| io(app_error::NOTE_WINDOW_OPEN_FAILED, e))?;
        return Ok(());
    }

    let title = Path::new(&path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("メモ")
        .to_string();

    // ハッシュでパスを渡す（`/?notePath=` だとアセット読込が壊れるため）
    let url = format!("/#?notePath={}", percent_encode_component(&path));

    WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(url.into()))
        .title(&title)
        .inner_size(960.0, 720.0)
        .min_inner_size(480.0, 360.0)
        .build()
        .map_err(|e| io(app_error::NOTE_WINDOW_OPEN_FAILED, e))?;

    Ok(())
}
