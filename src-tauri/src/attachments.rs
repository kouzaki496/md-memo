//! メモ添付画像（`attachments/` 配下）

use crate::app_error::{self, err, io};
use crate::config;
use rand::Rng;
use regex::Regex;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;

pub const ATTACHMENTS_DIR: &str = "attachments";

static RE_IMG_SRC_DQ: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?i)<img([^>]*?)\ssrc="([^"]+)""#).unwrap()
});
static RE_IMG_SRC_SQ: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?i)<img([^>]*?)\ssrc='([^']+)'"#).unwrap()
});

pub fn notes_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let cfg = config::load_config(app);
    config::resolve_notes_dir_path(app, &cfg.notes_dir)
}

fn attachments_root(notes_root: &Path) -> PathBuf {
    notes_root.join(ATTACHMENTS_DIR)
}

fn normalize_attachment_src(src: &str) -> Option<String> {
    let mut normalized = src.trim().replace('\\', "/");
    if normalized.is_empty() {
        return None;
    }
    if normalized.starts_with("./") {
        normalized = normalized[2..].to_string();
    }
    if normalized.contains("..") {
        return None;
    }
    if normalized.starts_with("attachments/") {
        Some(normalized)
    } else if !normalized.contains('/') {
        Some(format!("{ATTACHMENTS_DIR}/{normalized}"))
    } else {
        None
    }
}

pub fn resolve_absolute_path(app: &tauri::AppHandle, src: &str) -> Result<PathBuf, String> {
    let rel = normalize_attachment_src(src).ok_or_else(|| err(app_error::ATTACHMENT_PATH_INVALID))?;
    let notes = notes_root(app)?;
    let path = notes.join(&rel);
    if !path.is_file() {
        return Err(err(app_error::ATTACHMENT_NOT_FOUND));
    }
    let attachments = attachments_root(&notes);
    let canonical = path
        .canonicalize()
        .map_err(|e| io(app_error::ATTACHMENT_READ_FAILED, e))?;
    let attachments_canonical = attachments
        .canonicalize()
        .map_err(|e| io(app_error::ATTACHMENT_READ_FAILED, e))?;
    if !canonical.starts_with(&attachments_canonical) {
        return Err(err(app_error::ATTACHMENT_PATH_INVALID));
    }
    Ok(canonical)
}

pub fn resolve_attachment_file(notes_root: &Path, file_name: &str) -> Result<PathBuf, String> {
    let trimmed = file_name.trim();
    if trimmed.is_empty()
        || trimmed.contains('/')
        || trimmed.contains('\\')
        || trimmed.contains("..")
    {
        return Err(err(app_error::ATTACHMENT_PATH_INVALID));
    }
    let path = attachments_root(notes_root).join(trimmed);
    if !path.is_file() {
        return Err(err(app_error::ATTACHMENT_NOT_FOUND));
    }
    let canonical = path
        .canonicalize()
        .map_err(|e| io(app_error::ATTACHMENT_READ_FAILED, e))?;
    let attachments_canonical = attachments_root(notes_root)
        .canonicalize()
        .map_err(|e| io(app_error::ATTACHMENT_READ_FAILED, e))?;
    if !canonical.starts_with(&attachments_canonical) {
        return Err(err(app_error::ATTACHMENT_PATH_INVALID));
    }
    Ok(canonical)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentPayload {
    pub mime_type: String,
    pub bytes: Vec<u8>,
}

pub fn read_attachment_payload(app: &tauri::AppHandle, src: &str) -> Result<AttachmentPayload, String> {
    let path = resolve_absolute_path(app, src)?;
    let bytes = fs::read(&path).map_err(|e| io(app_error::ATTACHMENT_READ_FAILED, e))?;
    Ok(AttachmentPayload {
        mime_type: mime_from_path(&path).to_string(),
        bytes,
    })
}

fn infer_extension(bytes: &[u8], extension_hint: Option<&str>, file_name: Option<&str>) -> &'static str {
    if bytes.starts_with(&[0x89, 0x50, 0x4E, 0x47]) {
        return "png";
    }
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return "jpg";
    }
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return "gif";
    }
    if bytes.len() > 12 && bytes.starts_with(b"RIFF") && bytes[8..12] == *b"WEBP" {
        return "webp";
    }
    if bytes.starts_with(b"<svg") || bytes.starts_with(b"<?xml") {
        return "svg";
    }
    if let Some(name) = file_name {
        match Path::new(name)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase()
            .as_str()
        {
            "png" => return "png",
            "jpg" | "jpeg" => return "jpg",
            "gif" => return "gif",
            "webp" => return "webp",
            "svg" => return "svg",
            _ => {}
        }
    }
    if let Some(ext) = extension_hint {
        match ext.trim().trim_start_matches('.').to_lowercase().as_str() {
            "png" => return "png",
            "jpg" | "jpeg" => return "jpg",
            "gif" => return "gif",
            "webp" => return "webp",
            "svg" | "svg+xml" => return "svg",
            _ => {}
        }
    }
    "png"
}

pub fn save_bytes(
    app: &tauri::AppHandle,
    bytes: &[u8],
    extension_hint: Option<&str>,
    file_name_hint: Option<&str>,
) -> Result<String, String> {
    if bytes.is_empty() {
        return Err(err(app_error::ATTACHMENT_EMPTY));
    }
    let notes = notes_root(app)?;
    let dir = attachments_root(&notes);
    fs::create_dir_all(&dir).map_err(|e| io(app_error::ATTACHMENT_SAVE_FAILED, e))?;

    let ext = infer_extension(bytes, extension_hint, file_name_hint);
    let suffix: u32 = rand::thread_rng().gen();
    let name = format!(
        "{}-{:x}.{ext}",
        chrono::Local::now().format("%Y%m%d-%H%M%S"),
        suffix
    );
    let rel = format!("{ATTACHMENTS_DIR}/{name}");
    let path = notes.join(&rel);
    fs::write(&path, bytes).map_err(|e| io(app_error::ATTACHMENT_SAVE_FAILED, e))?;
    Ok(rel)
}

pub fn import_from_path(app: &tauri::AppHandle, source_path: &str) -> Result<String, String> {
    let trimmed = source_path.trim();
    if trimmed.is_empty() {
        return Err(err(app_error::ATTACHMENT_PATH_INVALID));
    }
    let source = PathBuf::from(trimmed);
    if !source.is_file() {
        return Err(err(app_error::ATTACHMENT_NOT_FOUND));
    }
    let bytes = fs::read(&source).map_err(|e| io(app_error::ATTACHMENT_IMPORT_FAILED, e))?;
    let file_name = source
        .file_name()
        .and_then(|n| n.to_str())
        .map(str::to_string);
    save_bytes(
        app,
        &bytes,
        None,
        file_name.as_deref(),
    )
}

pub fn mime_from_path(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase()
        .as_str()
    {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        _ => "application/octet-stream",
    }
}

pub fn rewrite_attachment_img_src(html: &str, viewer_attachments_base: &str) -> String {
    rewrite_attachment_imgs_for_viewer(html, viewer_attachments_base, None)
}

pub fn rewrite_attachment_imgs_for_viewer(
    html: &str,
    viewer_attachments_base: &str,
    notes_root: Option<&Path>,
) -> String {
    let base = viewer_attachments_base.trim_end_matches('/');
    let with_double =
        rewrite_img_tags_for_viewer(html, base, notes_root, &RE_IMG_SRC_DQ, '"');
    rewrite_img_tags_for_viewer(&with_double, base, notes_root, &RE_IMG_SRC_SQ, '\'')
}

fn attachment_file_exists(notes_root: &Path, src: &str) -> bool {
    let Some(rel) = normalize_attachment_src(src) else {
        return false;
    };
    notes_root.join(&rel).is_file()
}

fn extract_alt_attr(attrs: &str) -> Option<String> {
    static RE_ALT_DQ: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r#"(?i)\salt="([^"]*)""#).unwrap());
    static RE_ALT_SQ: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r#"(?i)\salt='([^']*)'"#).unwrap());
    RE_ALT_DQ
        .captures(attrs)
        .or_else(|| RE_ALT_SQ.captures(attrs))
        .map(|caps| caps[1].to_string())
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn meaningful_alt(alt: Option<&str>) -> Option<String> {
    let value = alt?.trim();
    if value.is_empty() || value.eq_ignore_ascii_case("image") {
        return None;
    }
    Some(value.to_string())
}

const MISSING_IMAGE_LABEL: &str = "画像が見つかりません";

fn missing_image_placeholder_html(src: &str, alt: Option<&str>) -> String {
    let escaped_src = html_escape(src.trim());
    let alt_line = meaningful_alt(alt).map(|value| {
        format!(
            r#"<p class="md-image-missing__alt">{}</p>"#,
            html_escape(&value)
        )
    }).unwrap_or_default();
    format!(
        r#"<figure class="md-image-missing" role="img" aria-label="{MISSING_IMAGE_LABEL}"><div class="md-image-missing__inner"><svg class="md-image-missing__icon" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.5 4h7.5a2 2 0 0 1 2 2v7.5"/><path d="M6 20h12a2 2 0 0 0 2-2V8"/><path d="M4 4l16 16"/></svg><p class="md-image-missing__label">{MISSING_IMAGE_LABEL}</p>{alt_line}<p class="md-image-missing__path" title="{escaped_src}">{escaped_src}</p></div></figure>"#
    )
}

fn rewrite_img_tags_for_viewer(
    html: &str,
    base: &str,
    notes_root: Option<&Path>,
    re: &Regex,
    quote: char,
) -> String {
    re.replace_all(html, |caps: &regex::Captures| {
        let attrs = &caps[1];
        let src = &caps[2];
        if !should_rewrite_attachment_src(src) {
            return format!("<img{attrs} src={quote}{src}{quote}");
        }
        if let Some(root) = notes_root {
            if !attachment_file_exists(root, src) {
                let alt = extract_alt_attr(attrs);
                return missing_image_placeholder_html(src, alt.as_deref());
            }
        }
        let new_src = attachment_viewer_url(src, base);
        format!("<img{attrs} src={quote}{new_src}{quote}")
    })
    .into_owned()
}

fn should_rewrite_attachment_src(src: &str) -> bool {
    let trimmed = src.trim();
    !trimmed.is_empty()
        && !trimmed.starts_with("http://")
        && !trimmed.starts_with("https://")
        && !trimmed.starts_with("data:")
}

fn attachment_viewer_url(src: &str, base: &str) -> String {
    let Some(rel) = normalize_attachment_src(src) else {
        return src.to_string();
    };
    let file = rel
        .strip_prefix(&format!("{ATTACHMENTS_DIR}/"))
        .unwrap_or(&rel);
    format!("{base}/{file}")
}

#[tauri::command]
pub fn save_note_attachment(
    app: tauri::AppHandle,
    bytes: Vec<u8>,
    extension: Option<String>,
) -> Result<String, String> {
    save_bytes(&app, &bytes, extension.as_deref(), None)
}

#[tauri::command]
pub fn import_note_attachment(app: tauri::AppHandle, source_path: String) -> Result<String, String> {
    import_from_path(&app, &source_path)
}

#[tauri::command]
pub fn resolve_attachment_path(app: tauri::AppHandle, src: String) -> Result<String, String> {
    resolve_absolute_path(&app, &src).map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn read_note_attachment(app: tauri::AppHandle, src: String) -> Result<AttachmentPayload, String> {
    read_attachment_payload(&app, &src)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rewrite_attachment_src_in_html() {
        let html = r#"<p><img alt="x" src="attachments/a.png"></p>"#;
        let out = rewrite_attachment_img_src(html, "http://127.0.0.1:1/view/tok/attachments");
        assert!(out.contains(r#"src="http://127.0.0.1:1/view/tok/attachments/a.png""#));
    }

    #[test]
    fn keep_remote_src() {
        let html = r#"<img src="https://example.com/a.png">"#;
        let out = rewrite_attachment_img_src(html, "http://127.0.0.1:1/view/tok/attachments");
        assert!(out.contains("https://example.com/a.png"));
    }

    #[test]
    fn missing_attachment_becomes_placeholder() {
        let notes_root = std::env::temp_dir().join("scriptax-missing-image-test-notes");
        let html = r#"<p><img alt="diagram" src="attachments/missing.png"></p>"#;
        let out = rewrite_attachment_imgs_for_viewer(
            html,
            "http://127.0.0.1:1/view/tok/attachments",
            Some(&notes_root),
        );
        assert!(out.contains("md-image-missing"));
        assert!(out.contains("画像が見つかりません"));
        assert!(out.contains("attachments/missing.png"));
        assert!(out.contains("diagram"));
    }
}
