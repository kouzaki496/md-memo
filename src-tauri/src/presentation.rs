//! ブラウザ提示（localhost HTTP + SSE）。メモごとに独立した token / タブ。

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
    pub file_name: String,
    pub body_html: String,
    pub realtime: bool,
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
    token: String,
    bound_path: Option<String>,
    file_name: String,
    body_html: String,
    active: bool,
    realtime: bool,
    update_tx: broadcast::Sender<PresentationSnapshot>,
}

impl LiveSession {
    fn snapshot(&self) -> PresentationSnapshot {
        PresentationSnapshot {
            active: self.active,
            ended: !self.active,
            file_name: self.file_name.clone(),
            body_html: self.body_html.clone(),
            realtime: self.realtime,
        }
    }
}

struct PresentationInner {
    port: Mutex<u16>,
    sessions: RwLock<HashMap<String, LiveSession>>,
    token_index: RwLock<HashMap<String, String>>,
    server_started: Mutex<bool>,
}

#[derive(Clone)]
struct AppPresentation(Arc<PresentationInner>);

static PRESENTATION: OnceLock<AppPresentation> = OnceLock::new();

fn presentation() -> &'static AppPresentation {
    PRESENTATION.get_or_init(|| {
        AppPresentation(Arc::new(PresentationInner {
            port: Mutex::new(DEFAULT_PORT),
            sessions: RwLock::new(HashMap::new()),
            token_index: RwLock::new(HashMap::new()),
            server_started: Mutex::new(false),
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

fn presentation_url(port: u16, token: &str) -> String {
    format!("http://127.0.0.1:{port}/p/{token}")
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

async fn snapshot_for_token(state: &AppPresentation, token: &str) -> Option<PresentationSnapshot> {
    let key = state.0.token_index.read().await.get(token)?.clone();
    let sessions = state.0.sessions.read().await;
    sessions.get(&key).map(|s| s.snapshot())
}

async fn emit_snapshot(state: &AppPresentation, memo_key: &str) {
    let sessions = state.0.sessions.read().await;
    let Some(session) = sessions.get(memo_key) else {
        return;
    };
    let snapshot = session.snapshot();
    let _ = session.update_tx.send(snapshot);
}

async fn ensure_server_running(state: AppPresentation) -> Result<(), String> {
    let mut started = state.0.server_started.lock().await;
    if *started {
        return Ok(());
    }

    let port = bind_port(DEFAULT_PORT).map_err(|e| format!("提示用サーバーを起動できません: {e}"))?;
    *state.0.port.lock().await = port;

    let router_state = state.clone();
    let app = Router::new()
        .route("/p/:token", get(page_handler))
        .route("/p/:token/snapshot", get(snapshot_handler))
        .route("/p/:token/events", get(events_handler))
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

async fn page_handler(
    State(state): State<AppPresentation>,
    Path(token): Path<String>,
) -> impl IntoResponse {
    if snapshot_for_token(&state, &token).await.is_none() {
        return (StatusCode::NOT_FOUND, Html(not_found_html())).into_response();
    }
    (StatusCode::OK, Html(present_html(&token))).into_response()
}

async fn snapshot_handler(
    State(state): State<AppPresentation>,
    Path(token): Path<String>,
) -> impl IntoResponse {
    match snapshot_for_token(&state, &token).await {
        Some(snapshot) => Json(snapshot).into_response(),
        None => (StatusCode::NOT_FOUND, Json(serde_json::json!({ "error": "not found" })))
            .into_response(),
    }
}

async fn events_handler(
    State(state): State<AppPresentation>,
    Path(token): Path<String>,
) -> impl IntoResponse {
    let update_tx = {
        let key = match state.0.token_index.read().await.get(&token) {
            Some(k) => k.clone(),
            None => {
                return Sse::new(stream::empty::<Result<Event, std::convert::Infallible>>())
                    .into_response()
            }
        };
        let sessions = state.0.sessions.read().await;
        match sessions.get(&key) {
            Some(s) => s.update_tx.clone(),
            None => {
                return Sse::new(stream::empty::<Result<Event, std::convert::Infallible>>())
                    .into_response()
            }
        }
    };

    let initial = snapshot_for_token(&state, &token).await.unwrap_or(PresentationSnapshot {
        active: false,
        ended: true,
        file_name: String::new(),
        body_html: String::new(),
        realtime: false,
    });

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
<body><p>提示セッションが見つかりません。</p></body></html>"#
    .to_string()
}

fn present_html(token: &str) -> String {
    format!(
        r#"<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>md-memo 提示</title>
  <style>
    :root {{ color-scheme: light dark; }}
    body {{ margin: 0; font-family: "Segoe UI", "Hiragino Sans", "Noto Sans JP", sans-serif; line-height: 1.65; }}
    header {{ padding: 0.75rem 1.25rem; border-bottom: 1px solid #ccc; font-size: 0.875rem; color: #555; background: #f8f8f8; }}
    @media (prefers-color-scheme: dark) {{
      header {{ background: #1a1a1a; border-color: #333; color: #aaa; }}
      body {{ background: #111; color: #eee; }}
    }}
    main {{ max-width: 48rem; margin: 0 auto; padding: 2rem 1.25rem 3rem; }}
    .ended {{ color: #888; font-style: italic; }}
    .prose h1, .prose h2, .prose h3 {{ line-height: 1.25; margin-top: 1.5em; }}
    .prose pre {{ overflow-x: auto; padding: 0.75rem 1rem; border-radius: 0.375rem; background: rgba(127,127,127,0.12); }}
    .prose code {{ font-family: ui-monospace, monospace; font-size: 0.9em; }}
    .prose table {{ border-collapse: collapse; width: 100%; }}
    .prose th, .prose td {{ border: 1px solid #ccc; padding: 0.35rem 0.6rem; }}
    @media (prefers-color-scheme: dark) {{ .prose th, .prose td {{ border-color: #444; }} }}
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
    @media (prefers-color-scheme: dark) {{
      .md-callout--info {{ background: #2a3d28; color: #d8ecd0; }}
      .md-callout--tip {{ background: #1e3d32; color: #c8ebe0; }}
      .md-callout--warn {{ background: #3d3418; color: #f1e2a9; }}
      .md-callout--alert {{ background: #3d2226; color: #f0c8cc; }}
    }}
  </style>
</head>
<body>
  <header id="hdr">読み込み中…</header>
  <main id="main" class="prose"><p>読み込み中…</p></main>
  <script>
    const TOKEN = {token_json};
    const hdr = document.getElementById("hdr");
    const main = document.getElementById("main");

    function applySnapshot(s) {{
      if (s.ended || !s.active) {{
        hdr.textContent = "提示は終了しました";
        main.innerHTML = '<p class="ended">この提示セッションは終了しています。</p>';
        return;
      }}
      hdr.textContent = "提示中: " + s.fileName;
      main.innerHTML = s.bodyHtml || "<p>（空）</p>";
    }}

    fetch("/p/" + TOKEN + "/snapshot")
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(applySnapshot)
      .catch(() => {{
        hdr.textContent = "エラー";
        main.innerHTML = '<p class="ended">提示内容を読み込めませんでした。</p>';
      }});

    const es = new EventSource("/p/" + TOKEN + "/events");
    es.onmessage = (ev) => {{
      try {{
        const data = JSON.parse(ev.data);
        applySnapshot(data);
        if (data.ended) es.close();
      }} catch {{ /* ignore */ }}
    }};
    es.onerror = () => {{ /* 自動再接続 */ }};
  </script>
</body>
</html>"#,
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
    let port = *state.0.port.lock().await;
    let body_html = note_body_to_html(&body);

    {
        let sessions = state.0.sessions.read().await;
        if let Some(existing) = sessions.get(&key) {
            if existing.active {
                let url = presentation_url(port, &existing.token);
                if open_browser {
                    app.opener()
                        .open_url(&url, None::<&str>)
                        .map_err(|e| format!("ブラウザを開けませんでした: {e}"))?;
                }
                return Ok(StartPresentationResult {
                    token: existing.token.clone(),
                    url,
                    file_name: existing.file_name.clone(),
                    bound_path: existing.bound_path.clone(),
                    realtime: existing.realtime,
                });
            }
        }
    }

    let token = generate_token();
    let url = presentation_url(port, &token);
    let (update_tx, _) = broadcast::channel(32);

    let session = LiveSession {
        token: token.clone(),
        bound_path: bound_path.clone(),
        file_name: file_name.clone(),
        body_html,
        active: true,
        realtime,
        update_tx,
    };

    {
        let mut sessions = state.0.sessions.write().await;
        let mut token_index = state.0.token_index.write().await;
        if let Some(old) = sessions.get(&key) {
            token_index.remove(&old.token);
        }
        token_index.insert(token.clone(), key.clone());
        sessions.insert(key, session);
    }

    emit_snapshot(&state, &memo_key(&bound_path)).await;

    if open_browser {
        app.opener()
            .open_url(&url, None::<&str>)
            .map_err(|e| format!("ブラウザを開けませんでした: {e}"))?;
    }

    Ok(StartPresentationResult {
        token,
        url,
        file_name,
        bound_path,
        realtime,
    })
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
    emit_snapshot(state, &key).await;
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
    emit_snapshot(state, &key).await;
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
    emit_snapshot(state, &key).await;
    Ok(())
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
    let port = *state.0.port.lock().await;
    Ok(Some(status_from_session(
        session,
        presentation_url(port, &session.token),
    )))
}
