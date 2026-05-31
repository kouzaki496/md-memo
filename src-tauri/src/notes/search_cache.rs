//! 検索用キャッシュ（パス一覧 + 解析済みファイル内容、mtime/size で無効化）

use super::frontmatter::parse_tags_from_content;
use super::store::collect_markdown_paths;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex};
use std::time::UNIX_EPOCH;

#[derive(Clone, Debug)]
pub(crate) struct ParsedNote {
    pub lines: Vec<String>,
    pub tags: Vec<String>,
}

struct CacheEntry {
    modified_ms: i64,
    file_len: u64,
    note: ParsedNote,
}

struct SearchCache {
    notes_root: Option<PathBuf>,
    paths: Vec<PathBuf>,
    paths_fresh: bool,
    files: HashMap<PathBuf, CacheEntry>,
}

static CACHE: LazyLock<Mutex<SearchCache>> = LazyLock::new(|| {
    Mutex::new(SearchCache {
        notes_root: None,
        paths: Vec::new(),
        paths_fresh: false,
        files: HashMap::new(),
    })
});

fn cache_lock() -> Result<std::sync::MutexGuard<'static, SearchCache>, String> {
    CACHE
        .lock()
        .map_err(|_| "search_cache_lock_failed".to_string())
}

fn canonical_root(notes_root: &Path) -> PathBuf {
    notes_root
        .canonicalize()
        .unwrap_or_else(|_| notes_root.to_path_buf())
}

fn file_version(path: &Path) -> Option<(i64, u64)> {
    let meta = fs::metadata(path).ok()?;
    let modified_ms = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    Some((modified_ms, meta.len()))
}

fn parse_note_file(path: &Path) -> Result<ParsedNote, String> {
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    Ok(ParsedNote {
        tags: parse_tags_from_content(&content),
        lines: content.lines().map(str::to_string).collect(),
    })
}

/// パス一覧キャッシュとファイル内容キャッシュをすべて破棄する。
pub(crate) fn invalidate_search_cache() {
    if let Ok(mut cache) = cache_lock() {
        cache.paths_fresh = false;
        cache.files.clear();
    }
}

/// 1 ファイル分の内容キャッシュを破棄し、パス一覧も再取得する。
pub(crate) fn invalidate_search_cache_file(path: &Path) {
    if let Ok(mut cache) = cache_lock() {
        cache.files.remove(path);
        cache.paths_fresh = false;
    }
}

pub(crate) fn collect_cached_markdown_paths(notes_root: &Path) -> Result<Vec<PathBuf>, String> {
    let root = canonical_root(notes_root);
    let mut cache = cache_lock()?;

    if cache.notes_root.as_ref() != Some(&root) {
        cache.notes_root = Some(root.clone());
        cache.paths_fresh = false;
        cache.files.clear();
    }

    if !cache.paths_fresh {
        cache.paths = collect_markdown_paths(&root)?;
        cache.paths_fresh = true;
        let valid_paths: std::collections::HashSet<_> = cache.paths.iter().cloned().collect();
        cache.files.retain(|path, _| valid_paths.contains(path));
    }

    Ok(cache.paths.clone())
}

pub(crate) fn load_parsed_note(path: &Path) -> Result<ParsedNote, String> {
    let (modified_ms, file_len) = file_version(path).ok_or_else(|| {
        format!(
            "search_cache_metadata_failed:{}",
            path.to_string_lossy()
        )
    })?;

    if let Ok(cache) = cache_lock() {
        if let Some(entry) = cache.files.get(path) {
            if entry.modified_ms == modified_ms && entry.file_len == file_len {
                return Ok(entry.note.clone());
            }
        }
    }

    let note = parse_note_file(path)?;

    if let Ok(mut cache) = cache_lock() {
        cache.files.insert(
            path.to_path_buf(),
            CacheEntry {
                modified_ms,
                file_len,
                note: note.clone(),
            },
        );
    }

    Ok(note)
}

#[cfg(test)]
pub(crate) fn test_serial_lock() -> std::sync::MutexGuard<'static, ()> {
    static TEST_GUARD: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));
    TEST_GUARD.lock().expect("test lock")
}

#[cfg(test)]
pub(crate) struct TestNotesRoot {
    pub path: PathBuf,
    _guard: std::sync::MutexGuard<'static, ()>,
}

#[cfg(test)]
impl std::ops::Deref for TestNotesRoot {
    type Target = PathBuf;

    fn deref(&self) -> &Self::Target {
        &self.path
    }
}

#[cfg(test)]
impl AsRef<Path> for TestNotesRoot {
    fn as_ref(&self) -> &Path {
        &self.path
    }
}

#[cfg(test)]
pub(crate) fn fresh_test_root(name: &str) -> TestNotesRoot {
    let guard = test_serial_lock();
    invalidate_search_cache();
    let root = std::env::temp_dir().join(name);
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(&root).expect("mkdir");
    TestNotesRoot {
        path: root,
        _guard: guard,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn write_note(dir: &Path, name: &str, content: &str) -> PathBuf {
        let path = dir.join(name);
        let mut file = fs::File::create(&path).expect("create note");
        file.write_all(content.as_bytes()).expect("write note");
        path
    }

    #[test]
    fn cache_reuses_parsed_note_until_file_changes() {
        let env = fresh_test_root("scriptax-search-cache-reuse-test");
        let root = &env.path;
        let path = write_note(&root, "a.md", "---\ntags: [work]\n---\n\nhello\n");

        let first = load_parsed_note(&path).expect("load");
        assert_eq!(first.tags, vec!["work".to_string()]);
        assert_eq!(first.lines.len(), 5);

        let cached = load_parsed_note(&path).expect("cache hit");
        assert_eq!(cached.tags, first.tags);
        assert_eq!(cached.lines, first.lines);

        write_note(&root, "a.md", "---\ntags: [draft]\n---\n\nhello\n");
        let second = load_parsed_note(&path).expect("reload");
        assert_eq!(second.tags, vec!["draft".to_string()]);

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn collect_paths_uses_cache_until_invalidated() {
        let env = fresh_test_root("scriptax-search-cache-paths-test");
        let root = &env.path;
        write_note(&root, "a.md", "alpha\n");

        let first = collect_cached_markdown_paths(&root).expect("paths");
        assert_eq!(first.len(), 1);

        write_note(&root, "b.md", "beta\n");
        let cached = collect_cached_markdown_paths(&root).expect("cached paths");
        assert_eq!(cached.len(), 1, "新規ファイルはパス一覧が無効化されるまで見えない");

        invalidate_search_cache();
        let refreshed = collect_cached_markdown_paths(&root).expect("refreshed paths");
        assert_eq!(refreshed.len(), 2);

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn invalidate_file_refreshes_path_list() {
        let env = fresh_test_root("scriptax-search-cache-invalidate-file-test");
        let root = &env.path;
        let path = write_note(&root, "a.md", "alpha\n");
        let _ = collect_cached_markdown_paths(&root).expect("paths");

        write_note(&root, "b.md", "beta\n");
        invalidate_search_cache_file(&path);

        let paths = collect_cached_markdown_paths(&root).expect("paths after invalidate");
        assert_eq!(paths.len(), 2);

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn invalidate_all_clears_stale_file_cache() {
        let env = fresh_test_root("scriptax-search-cache-invalidate-all-test");
        let root = &env.path;
        let path = write_note(&root, "a.md", "version-one\n");
        let first = load_parsed_note(&path).expect("load");
        assert_eq!(first.lines[0], "version-one");

        write_note(&root, "a.md", "version-two\n");
        invalidate_search_cache();

        let second = load_parsed_note(&path).expect("reload");
        assert_eq!(second.lines[0], "version-two");

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn notes_root_change_resets_cache() {
        let _guard = test_serial_lock();
        invalidate_search_cache();
        let root_a = std::env::temp_dir().join("scriptax-search-cache-root-a-test");
        let root_b = std::env::temp_dir().join("scriptax-search-cache-root-b-test");
        let _ = fs::remove_dir_all(&root_a);
        let _ = fs::remove_dir_all(&root_b);
        fs::create_dir_all(&root_a).expect("mkdir a");
        fs::create_dir_all(&root_b).expect("mkdir b");
        write_note(&root_a, "a.md", "in a\n");
        write_note(&root_b, "b.md", "in b\n");

        let paths_a = collect_cached_markdown_paths(&root_a).expect("paths a");
        assert_eq!(paths_a.len(), 1);
        assert!(paths_a[0].ends_with("a.md"));

        let paths_b = collect_cached_markdown_paths(&root_b).expect("paths b");
        assert_eq!(paths_b.len(), 1);
        assert!(paths_b[0].ends_with("b.md"));

        let note_a = load_parsed_note(&paths_a[0]).expect("note a");
        assert_eq!(note_a.lines[0], "in a");

        let _ = fs::remove_dir_all(&root_a);
        let _ = fs::remove_dir_all(&root_b);
    }

    #[test]
    fn collect_paths_ignores_non_markdown_and_prunes_deleted() {
        let env = fresh_test_root("scriptax-search-cache-prune-test");
        let root = &env.path;
        let md = write_note(&root, "keep.md", "stay\n");
        write_note(&root, "skip.txt", "text file\n");
        let _ = collect_cached_markdown_paths(&root).expect("paths");
        let _ = load_parsed_note(&md).expect("warm cache");

        fs::remove_file(&md).expect("delete md");
        invalidate_search_cache();

        let paths = collect_cached_markdown_paths(&root).expect("paths after delete");
        assert!(paths.is_empty());
        assert!(cache_lock().expect("lock").files.is_empty());

        let _ = fs::remove_dir_all(&root);
    }
}
