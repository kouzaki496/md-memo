use serde::Serialize;

#[derive(Serialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase")]
pub enum SearchMode {
    Tag,
    Body,
    Mixed,
}

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

#[derive(Serialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub path: String,
    pub line: usize,
    pub text: String,
    pub mode: SearchMode,
    pub score: Option<f32>,
}

#[derive(Serialize, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SearchNotesResult {
    pub mode: SearchMode,
    pub hits: Vec<SearchHit>,
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
