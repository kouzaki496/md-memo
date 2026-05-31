//! localhost HTTP サーバーと Axum ルート。

use super::viewer_html::{not_found_html, viewer_html};
use super::{AppPresentation, ViewerEvent};
use crate::app_error::{self, io, with_detail};
use crate::attachments;
use axum::{
    extract::{Path, State},
    http::{header, StatusCode},
    response::{
        sse::{Event, KeepAlive, Sse},
        Html, IntoResponse, Json,
    },
    routing::get,
    Router,
};
use futures::stream::{self, StreamExt};
use std::{net::SocketAddr, time::Duration};
use tokio::sync::broadcast;

pub(super) const DEFAULT_PORT: u16 = 17340;
const MAX_PORT_ATTEMPTS: u16 = 20;
static VIEWER_FAVICON_PNG: &[u8] = include_bytes!("../../icons/32x32.png");

pub(super) async fn ensure_server_running(state: AppPresentation) -> Result<(), String> {
    let mut started = state.0.server_started.lock().await;
    if *started {
        return Ok(());
    }

    let port = bind_port(DEFAULT_PORT).map_err(|e| io(app_error::PRESENTATION_SERVER_START_FAILED, e))?;
    *state.0.port.lock().await = port;
    *state.0.viewer_token.lock().await = super::generate_token();

    let router_state = state.clone();
    let app = Router::new()
        .route("/view/:token", get(viewer_page_handler))
        .route("/view/:token/favicon.png", get(viewer_favicon_handler))
        .route("/view/:token/snapshot", get(viewer_snapshot_handler))
        .route("/view/:token/events", get(viewer_events_handler))
        .route("/view/:token/attachments/:file", get(viewer_attachment_handler))
        .with_state(router_state);

    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|e| io(app_error::PRESENTATION_SERVER_START_FAILED, e))?;

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
    Err(with_detail(
        app_error::PRESENTATION_PORT_UNAVAILABLE,
        format!("ポート {start} 付近に空きがありません（{MAX_PORT_ATTEMPTS} 件試行）"),
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

async fn viewer_favicon_handler(
    State(state): State<AppPresentation>,
    Path(token): Path<String>,
) -> impl IntoResponse {
    if !viewer_token_valid(&state, &token).await {
        return StatusCode::NOT_FOUND.into_response();
    }
    (
        StatusCode::OK,
        [(header::CONTENT_TYPE, "image/png")],
        VIEWER_FAVICON_PNG,
    )
        .into_response()
}

async fn viewer_attachment_handler(
    State(state): State<AppPresentation>,
    Path((token, file)): Path<(String, String)>,
) -> impl IntoResponse {
    if !viewer_token_valid(&state, &token).await {
        return StatusCode::NOT_FOUND.into_response();
    }
    let notes_root = state.0.notes_root.read().await.clone();
    let Some(notes_root) = notes_root else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let path = match attachments::resolve_attachment_file(&notes_root, &file) {
        Ok(p) => p,
        Err(_) => return StatusCode::NOT_FOUND.into_response(),
    };
    let bytes = match std::fs::read(&path) {
        Ok(b) => b,
        Err(_) => return StatusCode::NOT_FOUND.into_response(),
    };
    let mime = attachments::mime_from_path(&path);
    (
        StatusCode::OK,
        [(header::CONTENT_TYPE, mime)],
        bytes,
    )
        .into_response()
}

async fn viewer_snapshot_handler(
    State(state): State<AppPresentation>,
    Path(token): Path<String>,
) -> impl IntoResponse {
    if !viewer_token_valid(&state, &token).await {
        return (StatusCode::NOT_FOUND, Json(serde_json::json!({ "error": "not found" })))
            .into_response();
    }
    Json(super::viewer_snapshot(&state).await).into_response()
}

async fn viewer_events_handler(
    State(state): State<AppPresentation>,
    Path(token): Path<String>,
) -> impl IntoResponse {
    if !viewer_token_valid(&state, &token).await {
        return Sse::new(stream::empty::<Result<Event, std::convert::Infallible>>()).into_response();
    }

    let update_tx = state.0.viewer_tx.clone();
    let initial = super::viewer_snapshot(&state).await;

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
                Ok(ViewerEvent::Snapshot(snapshot)) => {
                    let event = Event::default().json_data(snapshot).ok()?;
                    return Some((Ok::<Event, std::convert::Infallible>(event), rx));
                }
                Ok(ViewerEvent::Scroll(ratio)) => {
                    let event = Event::default().event("scroll").data(ratio.to_string());
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bind_port_returns_port_in_attempt_range() {
        let start = 17340;
        let port = bind_port(start).expect("should find port");
        assert!((start..start + MAX_PORT_ATTEMPTS).contains(&port));
    }
}
