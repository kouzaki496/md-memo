//! ブラウザ提示（localhost HTTP + SSE）。表示は 1 タブ（viewer）に集約。

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{
        sse::{Event, KeepAlive, Sse},
        Html, IntoResponse, Json,
    },
    routing::get,
    Router,
};
use futures::stream::{self, StreamExt};
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    net::SocketAddr,
    sync::{Arc, OnceLock},
    time::Duration,
};
use tokio::sync::{broadcast, Mutex, RwLock};
use tauri_plugin_opener::OpenerExt;

const DEFAULT_PORT: u16 = 17340;
const MAX_PORT_ATTEMPTS: u16 = 20;
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
    app_shutdown: RwLock<bool>,
    viewer_tx: broadcast::Sender<PresentationSnapshot>,
}

#[derive(Clone)]
struct AppPresentation(Arc<PresentationInner>);

static PRESENTATION: OnceLock<AppPresentation> = OnceLock::new();

fn presentation() -> &'static AppPresentation {
    PRESENTATION.get_or_init(|| {
        let (viewer_tx, _) = broadcast::channel(32);
        AppPresentation(Arc::new(PresentationInner {
            port: Mutex::new(DEFAULT_PORT),
            sessions: RwLock::new(HashMap::new()),
            server_started: Mutex::new(false),
            viewer_token: Mutex::new(String::new()),
            display_key: RwLock::new(None),
            theme_mode: RwLock::new("system".to_string()),
            theme_preset: RwLock::new("default".to_string()),
            app_shutdown: RwLock::new(false),
            viewer_tx,
        }))
    })
}

fn memo_key(path: &Option<String>) -> String {
    path.clone().unwrap_or_else(|| UNSAVED_KEY.to_string())
}

fn note_body_to_html(body: &str) -> String {
    crate::preview_render::render_note_body_html(body)
}

fn generate_token() -> String {
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

async fn viewer_snapshot(state: &AppPresentation) -> PresentationSnapshot {
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
    let _ = state.0.viewer_tx.send(snapshot);
}

async fn emit_viewer_if_displayed(state: &AppPresentation, memo_key: &str) {
    let display = state.0.display_key.read().await;
    if display.as_deref() == Some(memo_key) {
        emit_viewer_snapshot(state).await;
    }
}

async fn set_display_key(state: &AppPresentation, key: String) {
    *state.0.display_key.write().await = Some(key);
    emit_viewer_snapshot(state).await;
}

async fn ensure_server_running(state: AppPresentation) -> Result<(), String> {
    let mut started = state.0.server_started.lock().await;
    if *started {
        return Ok(());
    }

    let port = bind_port(DEFAULT_PORT).map_err(|e| format!("提示用サーバーを起動できません: {e}"))?;
    *state.0.port.lock().await = port;
    *state.0.viewer_token.lock().await = generate_token();

    let router_state = state.clone();
    let app = Router::new()
        .route("/view/:token", get(viewer_page_handler))
        .route("/view/:token/snapshot", get(viewer_snapshot_handler))
        .route("/view/:token/events", get(viewer_events_handler))
        .with_state(router_state);

    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|e| format!("提示用サーバーを起動できません: {e}"))?;

    tauri::async_runtime::spawn(async move {
        if let Err(e) = axum::serve(listener, app).await {
            eprintln!("presentation server: {e}");
        }
    });

    *started = true;
    Ok(())
}

fn bind_port(start: u16) -> Result<u16, String> {
    for offset in 0..MAX_PORT_ATTEMPTS {
        let port = start.saturating_add(offset);
        let addr = SocketAddr::from(([127, 0, 0, 1], port));
        if std::net::TcpListener::bind(addr).is_ok() {
            return Ok(port);
        }
    }
    Err(format!(
        "ポート {start} 付近に空きがありません（{MAX_PORT_ATTEMPTS} 件試行）"
    ))
}

async fn viewer_token_valid(state: &AppPresentation, token: &str) -> bool {
    state.0.viewer_token.lock().await.as_str() == token
}

async fn viewer_page_handler(
    State(state): State<AppPresentation>,
    Path(token): Path<String>,
) -> impl IntoResponse {
    if !viewer_token_valid(&state, &token).await {
        return (StatusCode::NOT_FOUND, Html(not_found_html())).into_response();
    }
    (StatusCode::OK, Html(viewer_html(&token))).into_response()
}

async fn viewer_snapshot_handler(
    State(state): State<AppPresentation>,
    Path(token): Path<String>,
) -> impl IntoResponse {
    if !viewer_token_valid(&state, &token).await {
        return (StatusCode::NOT_FOUND, Json(serde_json::json!({ "error": "not found" })))
            .into_response();
    }
    Json(viewer_snapshot(&state).await).into_response()
}

async fn viewer_events_handler(
    State(state): State<AppPresentation>,
    Path(token): Path<String>,
) -> impl IntoResponse {
    if !viewer_token_valid(&state, &token).await {
        return Sse::new(stream::empty::<Result<Event, std::convert::Infallible>>()).into_response();
    }

    let update_tx = state.0.viewer_tx.clone();
    let initial = viewer_snapshot(&state).await;

    let init_stream = stream::once(async move {
        Ok::<Event, std::convert::Infallible>(
            Event::default()
                .json_data(initial)
                .unwrap_or_else(|_| Event::default()),
        )
    });

    let rx = update_tx.subscribe();
    let update_stream = stream::unfold(rx, |mut rx| async move {
        loop {
            match rx.recv().await {
                Ok(snapshot) => {
                    let event = Event::default().json_data(snapshot).ok()?;
                    return Some((Ok::<Event, std::convert::Infallible>(event), rx));
                }
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(broadcast::error::RecvError::Closed) => return None,
            }
        }
    });

    Sse::new(init_stream.chain(update_stream))
        .keep_alive(KeepAlive::new().interval(Duration::from_secs(15)))
        .into_response()
}

fn not_found_html() -> String {
    r#"<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>見つかりません</title></head>
<body><p>提示ページが見つかりません。</p></body></html>"#
        .to_string()
}

fn viewer_theme_css() -> &'static str {
    r#"
    :root {
      --background: oklch(0.988 0.006 250);
      --foreground: oklch(0.24 0.018 255);
      --muted-foreground: oklch(0.52 0.025 255);
      --border: oklch(0.88 0.014 248);
      color-scheme: light;
    }
    html.dark {
      --background: oklch(0.21 0.018 260);
      --foreground: oklch(0.94 0.012 255);
      --muted-foreground: oklch(0.79 0.018 255);
      --border: oklch(0.4 0.024 252);
      color-scheme: dark;
    }
    html[data-theme-preset="sepia"] {
      --background: oklch(0.97 0.02 85);
      --foreground: oklch(0.32 0.03 68);
      --muted-foreground: oklch(0.48 0.025 66);
      --border: oklch(0.85 0.018 78);
    }
    html.dark[data-theme-preset="sepia"] {
      --background: oklch(0.24 0.02 70);
      --foreground: oklch(0.91 0.02 88);
      --muted-foreground: oklch(0.78 0.02 85);
      --border: oklch(0.43 0.02 74);
    }
    html[data-theme-preset="high-contrast"] {
      --background: oklch(0.995 0 0);
      --foreground: oklch(0.14 0 0);
      --muted-foreground: oklch(0.3 0 0);
      --border: oklch(0.2 0 0);
    }
    html.dark[data-theme-preset="high-contrast"] {
      --background: oklch(0.14 0 0);
      --foreground: oklch(0.97 0 0);
      --muted-foreground: oklch(0.8 0 0);
      --border: oklch(0.84 0 0);
    }
    "#
}

fn viewer_html(token: &str) -> String {
    let theme_css = viewer_theme_css();
    format!(
        r#"<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>md-memo 提示</title>
  <style>
    {theme_css}
    body {{ margin: 0; font-family: "Segoe UI", "Hiragino Sans", "Noto Sans JP", sans-serif; line-height: 1.65; background: var(--background); color: var(--foreground); transition: background-color 0.15s, color 0.15s; }}
    header {{ padding: 0.75rem 1.25rem; border-bottom: 1px solid var(--border); font-size: 0.875rem; color: var(--muted-foreground); background: color-mix(in oklab, var(--background) 88%, var(--foreground)); }}
    main {{ max-width: 48rem; margin: 0 auto; padding: 2rem 1.25rem 3rem; }}
    .idle, .ended {{ color: var(--muted-foreground); font-style: italic; }}
    .prose h1, .prose h2, .prose h3 {{ line-height: 1.25; margin-top: 1.5em; }}
    .prose pre {{ overflow-x: auto; padding: 0.75rem 1rem; border-radius: 0.375rem; background: color-mix(in oklab, var(--foreground) 8%, var(--background)); }}
    .prose code {{ font-family: ui-monospace, monospace; font-size: 0.9em; }}
    .prose table {{ border-collapse: collapse; width: 100%; }}
    .prose th, .prose td {{ border: 1px solid var(--border); padding: 0.35rem 0.6rem; }}
    .md-callout {{ display: flex; gap: 0.65rem; margin: 1rem 0; padding: 0.85rem 1rem; border-radius: 0.5rem; border: 1px solid transparent; }}
    .md-callout__label {{ flex: 0 0 auto; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; margin-top: 0.15rem; }}
    .md-callout__body {{ flex: 1; min-width: 0; }}
    .md-callout__body > :first-child {{ margin-top: 0; }}
    .md-callout__body > :last-child {{ margin-bottom: 0; }}
    .md-callout--info {{ background: #cfe3c1; color: #1f331d; }}
    .md-callout--info .md-callout__label {{ color: #2b7e1f; }}
    .md-callout--tip {{ background: #cbe8dc; color: #17382d; }}
    .md-callout--tip .md-callout__label {{ color: #197a58; }}
    .md-callout--warn {{ background: #f1e2a9; color: #3f3208; }}
    .md-callout--warn .md-callout__label {{ color: #ad8600; }}
    .md-callout--alert {{ background: #edc8cc; color: #42161a; }}
    .md-callout--alert .md-callout__label {{ color: #bf0f0f; }}
    html.dark .md-callout--info {{ background: #2a3d28; color: #d8ecd0; }}
    html.dark .md-callout--tip {{ background: #1e3d32; color: #c8ebe0; }}
    html.dark .md-callout--warn {{ background: #3d3418; color: #f1e2a9; }}
    html.dark .md-callout--alert {{ background: #3d2226; color: #f0c8cc; }}
  </style>
</head>
<body>
  <header id="hdr">読み込み中…</header>
  <main id="main" class="prose"><p>読み込み中…</p></main>
  <script>
    const TOKEN = {token_json};
    let hdr = document.getElementById("hdr");
    const main = document.getElementById("main");
    let lastSnapshot = null;
    let systemThemeMedia = null;
    let eventSource = null;

    function closeEventSource() {{
      if (eventSource) {{
        eventSource.close();
        eventSource = null;
      }}
    }}

    function resolveIsDark(mode) {{
      if (mode === "dark") return true;
      if (mode === "light") return false;
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }}

    function applyTheme(s) {{
      const mode = s.themeMode || "system";
      const preset = s.themePreset || "default";
      const root = document.documentElement;
      root.classList.toggle("dark", resolveIsDark(mode));
      if (preset === "default") root.removeAttribute("data-theme-preset");
      else root.setAttribute("data-theme-preset", preset);

      if (systemThemeMedia) {{
        systemThemeMedia.removeEventListener("change", onSystemThemeChange);
        systemThemeMedia = null;
      }}
      if (mode === "system") {{
        systemThemeMedia = window.matchMedia("(prefers-color-scheme: dark)");
        systemThemeMedia.addEventListener("change", onSystemThemeChange);
      }}
    }}

    function onSystemThemeChange() {{
      if (lastSnapshot) applyTheme(lastSnapshot);
    }}

    function applySnapshot(s) {{
      lastSnapshot = s;
      applyTheme(s);
      if (s.appShutdown) {{
        hdr.textContent = "提示を停止しました";
        main.innerHTML = '<p class="ended">md-memo を終了したため、提示を終了しました。</p>';
        closeEventSource();
        return;
      }}
      if (!s.fileName && !s.active && !s.ended) {{
        hdr.textContent = "md-memo 提示";
        main.innerHTML = '<p class="idle">アプリで提示するメモを選ぶと、ここに表示されます。</p>';
        return;
      }}
      if (s.ended || !s.active) {{
        hdr.textContent = "提示は終了しました";
        main.innerHTML = '<p class="ended">このメモの提示は終了しています。</p>';
        return;
      }}
      hdr.textContent = "提示中: " + s.fileName;
      main.innerHTML = s.bodyHtml || "<p>（空）</p>";
      window.scrollTo({{ top: 0, behavior: "instant" in window ? "instant" : "auto" }});
    }}

    fetch("/view/" + TOKEN + "/snapshot")
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(applySnapshot)
      .catch(() => {{
        hdr.textContent = "エラー";
        main.innerHTML = '<p class="ended">提示内容を読み込めませんでした。</p>';
      }});

    eventSource = new EventSource("/view/" + TOKEN + "/events");
    eventSource.onmessage = (ev) => {{
      try {{
        applySnapshot(JSON.parse(ev.data));
      }} catch {{ /* ignore */ }}
    }};
    eventSource.onerror = () => {{ /* 自動再接続 */ }};
  </script>
</body>
</html>"#,
        theme_css = theme_css,
        token_json = serde_json::to_string(token).unwrap_or_else(|_| "\"\"".to_string())
    )
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
    ensure_server_running(state.clone()).await?;

    let key = memo_key(&bound_path);
    let body_html = note_body_to_html(&body);
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
                        .map_err(|e| format!("ブラウザを開けませんでした: {e}"))?;
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
            .map_err(|e| format!("ブラウザを開けませんでした: {e}"))?;
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
        return Err("このメモの提示セッションが開始されていません".into());
    };
    if !session.active {
        return Err("提示はすでに終了しています".into());
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
        return Err("このメモの提示セッションが開始されていません".into());
    };
    if !session.active {
        return Err("提示はすでに終了しています".into());
    }
    session.body_html = note_body_to_html(&body);
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
        return Err("このメモの提示セッションが開始されていません".into());
    };
    if !session.active {
        return Err("提示はすでに終了しています".into());
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
        _ => Err(format!("不正な themeMode: {mode}")),
    }
}

fn validate_theme_preset(preset: &str) -> Result<(), String> {
    match preset {
        "default" | "sepia" | "high-contrast" => Ok(()),
        _ => Err(format!("不正な themePreset: {preset}")),
    }
}

#[tauri::command]
pub async fn set_presentation_theme(theme_mode: String, theme_preset: String) -> Result<(), String> {
    validate_theme_mode(&theme_mode)?;
    validate_theme_preset(&theme_preset)?;
    let state = presentation();
    *state.0.theme_mode.write().await = theme_mode;
    *state.0.theme_preset.write().await = theme_preset;
    emit_viewer_snapshot(state).await;
    Ok(())
}
