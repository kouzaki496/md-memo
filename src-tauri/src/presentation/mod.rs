//! ブラウザ提示（localhost HTTP + SSE）。表示は 1 タブ（viewer）に集約。

mod server;
mod viewer_html;

use crate::app_error::{self, err, io, with_detail};
use crate::attachments;
use crate::preview_render;
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, OnceLock},
};
use tokio::sync::{broadcast, Mutex, RwLock};
use tauri_plugin_opener::OpenerExt;

const UNSAVED_KEY: &str = "__unsaved__";

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PresentationSnapshot {
    pub active: bool,
    pub ended: bool,
    pub app_shutdown: bool,
    pub file_name: String,
    pub body_html: String,
    pub realtime: bool,
    pub theme_mode: String,
    pub theme_preset: String,
}

#[derive(Clone)]
pub(super) enum ViewerEvent {
    Snapshot(PresentationSnapshot),
    Scroll(f64),
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PresentationStatus {
    pub active: bool,
    pub bound_path: Option<String>,
    pub file_name: String,
    pub url: String,
    pub realtime: bool,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartPresentationResult {
    pub token: String,
    pub url: String,
    pub file_name: String,
    pub bound_path: Option<String>,
    pub realtime: bool,
}

struct LiveSession {
    bound_path: Option<String>,
    file_name: String,
    body_markdown: String,
    body_html: String,
    active: bool,
    realtime: bool,
}

impl LiveSession {
    fn snapshot(&self) -> PresentationSnapshot {
        PresentationSnapshot {
            active: self.active,
            ended: !self.active,
            app_shutdown: false,
            file_name: self.file_name.clone(),
            body_html: self.body_html.clone(),
            realtime: self.realtime,
            theme_mode: String::new(),
            theme_preset: String::new(),
        }
    }
}

struct PresentationInner {
    port: Mutex<u16>,
    sessions: RwLock<HashMap<String, LiveSession>>,
    server_started: Mutex<bool>,
    viewer_token: Mutex<String>,
    display_key: RwLock<Option<String>>,
    theme_mode: RwLock<String>,
    theme_preset: RwLock<String>,
    theme_is_dark: RwLock<bool>,
    app_shutdown: RwLock<bool>,
    display_scroll_ratio: RwLock<f64>,
    notes_root: RwLock<Option<PathBuf>>,
    viewer_tx: broadcast::Sender<ViewerEvent>,
}

#[derive(Clone)]
pub(super) struct AppPresentation(Arc<PresentationInner>);

static PRESENTATION: OnceLock<AppPresentation> = OnceLock::new();

fn presentation() -> &'static AppPresentation {
    PRESENTATION.get_or_init(|| {
        let (viewer_tx, _) = broadcast::channel(32);
        AppPresentation(Arc::new(PresentationInner {
            port: Mutex::new(server::DEFAULT_PORT),
            sessions: RwLock::new(HashMap::new()),
            server_started: Mutex::new(false),
            viewer_token: Mutex::new(String::new()),
            display_key: RwLock::new(None),
            theme_mode: RwLock::new("system".to_string()),
            theme_preset: RwLock::new("default".to_string()),
            theme_is_dark: RwLock::new(false),
            app_shutdown: RwLock::new(false),
            display_scroll_ratio: RwLock::new(0.0),
            notes_root: RwLock::new(None),
            viewer_tx,
        }))
    })
}

fn memo_key(path: &Option<String>) -> String {
    path.clone().unwrap_or_else(|| UNSAVED_KEY.to_string())
}

fn note_body_to_html(body: &str) -> String {
    preview_render::render_note_body_html(body)
}

async fn build_viewer_html_from_markdown(body: &str, state: &AppPresentation) -> String {
    let html = note_body_to_html(body);
    let html = if *state.0.server_started.lock().await {
        let port = *state.0.port.lock().await;
        let token = state.0.viewer_token.lock().await.clone();
        let base = format!("http://127.0.0.1:{port}/view/{token}/attachments");
        let notes_root = state.0.notes_root.read().await.clone();
        attachments::rewrite_attachment_imgs_for_viewer(&html, &base, notes_root.as_deref())
    } else {
        html
    };
    preview_render::highlight_code_blocks_in_html(&html)
}

async fn note_body_to_viewer_html(body: &str, state: &AppPresentation) -> String {
    build_viewer_html_from_markdown(body, state).await
}

async fn cache_notes_root(state: &AppPresentation, app: &tauri::AppHandle) {
    if let Ok(root) = attachments::notes_root(app) {
        *state.0.notes_root.write().await = Some(root);
    }
}

pub(super) fn generate_token() -> String {
    rand::thread_rng()
        .gen::<[u8; 16]>()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

fn viewer_url(port: u16, token: &str) -> String {
    format!("http://127.0.0.1:{port}/view/{token}")
}

async fn viewer_url_for_state(state: &AppPresentation) -> String {
    let port = *state.0.port.lock().await;
    let token = state.0.viewer_token.lock().await.clone();
    viewer_url(port, &token)
}

fn status_from_session(session: &LiveSession, url: String) -> PresentationStatus {
    PresentationStatus {
        active: session.active,
        bound_path: session.bound_path.clone(),
        file_name: session.file_name.clone(),
        url,
        realtime: session.realtime,
    }
}

fn idle_viewer_snapshot() -> PresentationSnapshot {
    PresentationSnapshot {
        active: false,
        ended: false,
        app_shutdown: false,
        file_name: String::new(),
        body_html: String::new(),
        realtime: false,
        theme_mode: String::new(),
        theme_preset: String::new(),
    }
}

pub(super) async fn viewer_snapshot(state: &AppPresentation) -> PresentationSnapshot {
    let theme_mode = state.0.theme_mode.read().await.clone();
    let theme_preset = state.0.theme_preset.read().await.clone();
    if *state.0.app_shutdown.read().await {
        return PresentationSnapshot {
            active: false,
            ended: true,
            app_shutdown: true,
            file_name: String::new(),
            body_html: String::new(),
            realtime: false,
            theme_mode,
            theme_preset,
        };
    }
    let display_key = state.0.display_key.read().await.clone();
    let mut snap = match display_key {
        Some(key) => {
            let sessions = state.0.sessions.read().await;
            sessions
                .get(&key)
                .map(LiveSession::snapshot)
                .unwrap_or_else(idle_viewer_snapshot)
        }
        None => idle_viewer_snapshot(),
    };
    snap.theme_mode = theme_mode;
    snap.theme_preset = theme_preset;
    snap
}

/// アプリ終了時: 全提示セッションを終了し、viewer に停止を通知する。
pub async fn shutdown_on_app_exit() {
    let state = presentation();
    if !*state.0.server_started.lock().await {
        return;
    }

    {
        let mut sessions = state.0.sessions.write().await;
        for session in sessions.values_mut() {
            session.active = false;
        }
        sessions.clear();
    }
    *state.0.display_key.write().await = None;
    *state.0.app_shutdown.write().await = true;
    emit_viewer_snapshot(state).await;
}

async fn emit_viewer_snapshot(state: &AppPresentation) {
    let snapshot = viewer_snapshot(state).await;
    let _ = state.0.viewer_tx.send(ViewerEvent::Snapshot(snapshot));
}

async fn emit_viewer_scroll(state: &AppPresentation, ratio: f64) {
    let ratio = ratio.clamp(0.0, 1.0);
    *state.0.display_scroll_ratio.write().await = ratio;
    let _ = state.0.viewer_tx.send(ViewerEvent::Scroll(ratio));
}

async fn emit_viewer_if_displayed(state: &AppPresentation, memo_key: &str) {
    let display = state.0.display_key.read().await;
    if display.as_deref() == Some(memo_key) {
        emit_viewer_snapshot(state).await;
    }
}

async fn set_display_key(state: &AppPresentation, key: String) {
    *state.0.display_key.write().await = Some(key);
    *state.0.display_scroll_ratio.write().await = 0.0;
    emit_viewer_snapshot(state).await;
    emit_viewer_scroll(state, 0.0).await;
}

#[tauri::command]
pub async fn start_presentation(
    app: tauri::AppHandle,
    bound_path: Option<String>,
    file_name: String,
    body: String,
    open_browser: bool,
    realtime: bool,
) -> Result<StartPresentationResult, String> {
    let state = presentation().clone();
    server::ensure_server_running(state.clone()).await?;
    cache_notes_root(&state, &app).await;

    let key = memo_key(&bound_path);
    let body_html = note_body_to_viewer_html(&body, &state).await;
    let url = viewer_url_for_state(&state).await;
    let viewer_token = state.0.viewer_token.lock().await.clone();

    {
        let sessions = state.0.sessions.read().await;
        if let Some(existing) = sessions.get(&key) {
            if existing.active {
                set_display_key(&state, key.clone()).await;
                if open_browser {
                    app.opener()
                        .open_url(&url, None::<&str>)
                        .map_err(|e| io(app_error::BROWSER_OPEN_FAILED, e))?;
                }
                return Ok(StartPresentationResult {
                    token: viewer_token,
                    url,
                    file_name: existing.file_name.clone(),
                    bound_path: existing.bound_path.clone(),
                    realtime: existing.realtime,
                });
            }
        }
    }

    let session = LiveSession {
        bound_path: bound_path.clone(),
        file_name: file_name.clone(),
        body_markdown: body.clone(),
        body_html,
        active: true,
        realtime,
    };

    {
        let mut sessions = state.0.sessions.write().await;
        sessions.insert(key.clone(), session);
    }

    set_display_key(&state, key).await;

    if open_browser {
        app.opener()
            .open_url(&url, None::<&str>)
            .map_err(|e| io(app_error::BROWSER_OPEN_FAILED, e))?;
    }

    Ok(StartPresentationResult {
        token: viewer_token,
        url,
        file_name,
        bound_path,
        realtime,
    })
}

#[tauri::command]
pub async fn set_presentation_display(bound_path: Option<String>) -> Result<(), String> {
    let state = presentation();
    let key = memo_key(&bound_path);
    let sessions = state.0.sessions.read().await;
    let Some(session) = sessions.get(&key) else {
        return Err(err(app_error::PRESENTATION_SESSION_NOT_STARTED));
    };
    if !session.active {
        return Err(err(app_error::PRESENTATION_ALREADY_ENDED));
    }
    drop(sessions);
    set_display_key(state, key).await;
    Ok(())
}

#[tauri::command]
pub async fn get_presentation_viewer_url() -> Result<Option<String>, String> {
    let state = presentation();
    if !*state.0.server_started.lock().await {
        return Ok(None);
    }
    Ok(Some(viewer_url_for_state(state).await))
}

#[tauri::command]
pub async fn push_presentation_update(
    bound_path: Option<String>,
    body: String,
) -> Result<(), String> {
    let state = presentation();
    let key = memo_key(&bound_path);
    let mut sessions = state.0.sessions.write().await;
    let Some(session) = sessions.get_mut(&key) else {
        return Err(err(app_error::PRESENTATION_SESSION_NOT_STARTED));
    };
    if !session.active {
        return Err(err(app_error::PRESENTATION_ALREADY_ENDED));
    }
    session.body_markdown = body.clone();
    session.body_html = note_body_to_viewer_html(&body, state).await;
    drop(sessions);
    emit_viewer_if_displayed(state, &key).await;
    Ok(())
}

#[tauri::command]
pub async fn set_presentation_realtime(
    bound_path: Option<String>,
    realtime: bool,
) -> Result<bool, String> {
    let state = presentation();
    let key = memo_key(&bound_path);
    let mut sessions = state.0.sessions.write().await;
    let Some(session) = sessions.get_mut(&key) else {
        return Err(err(app_error::PRESENTATION_SESSION_NOT_STARTED));
    };
    if !session.active {
        return Err(err(app_error::PRESENTATION_ALREADY_ENDED));
    }
    session.realtime = realtime;
    drop(sessions);
    emit_viewer_if_displayed(state, &key).await;
    Ok(realtime)
}

#[tauri::command]
pub async fn end_presentation(bound_path: Option<String>) -> Result<(), String> {
    let state = presentation();
    let key = memo_key(&bound_path);
    let mut sessions = state.0.sessions.write().await;
    let Some(session) = sessions.get_mut(&key) else {
        return Ok(());
    };
    session.active = false;
    drop(sessions);
    emit_viewer_if_displayed(state, &key).await;
    Ok(())
}

#[tauri::command]
pub async fn list_presentation_statuses() -> Result<Vec<PresentationStatus>, String> {
    let state = presentation();
    let url = if *state.0.server_started.lock().await {
        viewer_url_for_state(state).await
    } else {
        String::new()
    };
    let sessions = state.0.sessions.read().await;
    let mut out: Vec<PresentationStatus> = sessions
        .values()
        .filter(|s| s.active)
        .map(|s| status_from_session(s, url.clone()))
        .collect();
    out.sort_by(|a, b| a.file_name.cmp(&b.file_name));
    Ok(out)
}

#[tauri::command]
pub async fn get_presentation_status(
    bound_path: Option<String>,
) -> Result<Option<PresentationStatus>, String> {
    let state = presentation();
    let key = memo_key(&bound_path);
    let sessions = state.0.sessions.read().await;
    let Some(session) = sessions.get(&key) else {
        return Ok(None);
    };
    if !session.active {
        return Ok(None);
    }
    let url = if *state.0.server_started.lock().await {
        viewer_url_for_state(state).await
    } else {
        String::new()
    };
    Ok(Some(status_from_session(session, url)))
}

fn validate_theme_mode(mode: &str) -> Result<(), String> {
    match mode {
        "system" | "light" | "dark" => Ok(()),
        _ => Err(with_detail(app_error::INVALID_THEME_MODE, mode)),
    }
}

fn validate_theme_preset(preset: &str) -> Result<(), String> {
    match preset {
        "default" | "sepia" | "high-contrast" => Ok(()),
        _ => Err(with_detail(app_error::INVALID_THEME_PRESET, preset)),
    }
}

#[tauri::command]
pub async fn set_presentation_scroll(
    bound_path: Option<String>,
    scroll_ratio: f64,
) -> Result<(), String> {
    let state = presentation();
    let key = memo_key(&bound_path);

    let display = state.0.display_key.read().await;
    if display.as_deref() != Some(key.as_str()) {
        return Ok(());
    }
    drop(display);

    let sessions = state.0.sessions.read().await;
    let Some(session) = sessions.get(&key) else {
        return Ok(());
    };
    if !session.active {
        return Ok(());
    }
    drop(sessions);

    emit_viewer_scroll(state, scroll_ratio).await;
    Ok(())
}

#[tauri::command]
pub async fn set_presentation_theme(
    theme_mode: String,
    theme_preset: String,
    theme_is_dark: bool,
) -> Result<(), String> {
    validate_theme_mode(&theme_mode)?;
    validate_theme_preset(&theme_preset)?;
    let state = presentation();
    *state.0.theme_mode.write().await = theme_mode;
    *state.0.theme_preset.write().await = theme_preset;
    *state.0.theme_is_dark.write().await = theme_is_dark;
    emit_viewer_snapshot(state).await;
    Ok(())
}
