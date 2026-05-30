use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteMeta {
    pub path: String,
    pub title: String,
    pub pinned: bool,
    pub system_note: bool,
    pub tags: Vec<String>,
    pub updated_ms: i64,
    pub created_ms: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub path: String,
    pub line: usize,
    pub text: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteDetail {
    pub path: String,
    pub title: String,
    pub pinned: bool,
    pub system_note: bool,
    pub tags: Vec<String>,
    pub char_count: usize,
    pub updated_ms: i64,
    pub created_ms: i64,
    pub preview: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceTagGloballyResult {
    pub files_changed: usize,
    pub changed_paths: Vec<String>,
    pub template_tags: Vec<String>,
}
