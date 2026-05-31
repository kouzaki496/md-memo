//! メモ検索（タグ / 本文 AND）

use super::match_strategy::{
    all_terms_match_lines, all_terms_match_tags, ExactMatcher, LineTermMatcher, MatchMode,
    TagTermMatcher,
};
use super::search_cache::{collect_cached_markdown_paths, load_parsed_note, ParsedNote};
use super::store::{file_timestamps_ms, resolve_notes_root};
use super::types::{SearchHit, SearchMode, SearchNotesResult};
use crate::app_error::{self, err};
use rayon::prelude::*;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::Instant;

fn parse_search_terms(query: &str) -> Vec<String> {
    query
        .split_whitespace()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .collect()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum QueryKind {
    Tag,
    Body,
    Mixed,
}

struct ParsedQuery {
    kind: QueryKind,
    tag_terms: Vec<String>,
    body_terms: Vec<String>,
}

/// `#` 始まりの語はタグ、それ以外は本文。両方あれば複合 AND。
fn parse_query(query: &str) -> ParsedQuery {
    let terms = parse_search_terms(query);
    if terms.is_empty() {
        return ParsedQuery {
            kind: QueryKind::Body,
            tag_terms: vec![],
            body_terms: vec![],
        };
    }

    let mut tag_terms = Vec::new();
    let mut body_terms = Vec::new();
    for term in &terms {
        if term.starts_with('#') {
            let tag = term.trim_start_matches('#').trim();
            if !tag.is_empty() {
                tag_terms.push(tag.to_string());
            }
        } else {
            body_terms.push(term.clone());
        }
    }

    let kind = if !tag_terms.is_empty() && !body_terms.is_empty() {
        QueryKind::Mixed
    } else if !tag_terms.is_empty() {
        QueryKind::Tag
    } else if terms.iter().any(|t| t.starts_with('#')) {
        QueryKind::Tag
    } else {
        QueryKind::Body
    };

    ParsedQuery {
        kind,
        tag_terms,
        body_terms,
    }
}

fn search_mode_for_kind(kind: QueryKind) -> SearchMode {
    match kind {
        QueryKind::Tag => SearchMode::Tag,
        QueryKind::Body => SearchMode::Body,
        QueryKind::Mixed => SearchMode::Mixed,
    }
}

fn tag_hit(path: String, text: String) -> SearchHit {
    SearchHit {
        path,
        line: 0,
        text,
        mode: SearchMode::Tag,
        score: None,
    }
}

fn body_hit(path: String, line: usize, text: String) -> SearchHit {
    SearchHit {
        path,
        line,
        text,
        mode: SearchMode::Body,
        score: None,
    }
}

fn mixed_hit(path: String, line: usize, text: String) -> SearchHit {
    SearchHit {
        path,
        line,
        text,
        mode: SearchMode::Mixed,
        score: None,
    }
}

fn sort_hits_by_recency(hits: &mut [SearchHit]) {
    hits.sort_by(|a, b| {
        let (au, ac) = file_timestamps_ms(Path::new(&a.path));
        let (bu, bc) = file_timestamps_ms(Path::new(&b.path));
        bu.cmp(&au)
            .then_with(|| bc.cmp(&ac))
            .then_with(|| a.path.cmp(&b.path))
    });
}

fn search_by_tags(
    notes_root: &Path,
    tag_terms: &[String],
    matcher: &ExactMatcher,
) -> Result<Vec<SearchHit>, String> {
    let paths = collect_cached_markdown_paths(notes_root)?;
    let mut hits: Vec<SearchHit> = paths
        .par_iter()
        .filter_map(|path| {
            let note = load_parsed_note(path).ok()?;
            if !all_terms_match_tags(matcher, tag_terms, &note.tags) {
                return None;
            }
            let matched: Vec<String> = note
                .tags
                .iter()
                .filter(|t| tag_terms.iter().any(|term| matcher.matches_tag(t, term)))
                .map(|t| format!("#{}", t))
                .collect();
            Some(tag_hit(
                path.to_string_lossy().into_owned(),
                matched.join(" "),
            ))
        })
        .collect();
    sort_hits_by_recency(&mut hits);
    Ok(hits)
}

fn search_by_body(
    notes_root: &Path,
    terms: &[String],
    matcher: &ExactMatcher,
) -> Result<Vec<SearchHit>, String> {
    let paths = collect_cached_markdown_paths(notes_root)?;
    let mut hits: Vec<SearchHit> = paths
        .par_iter()
        .filter_map(|path| {
            let note = load_parsed_note(path).ok()?;
            let path_str = path.to_string_lossy().into_owned();
            search_body_in_note(&path_str, &note, terms, matcher)
        })
        .collect();
    sort_hits_by_recency(&mut hits);
    Ok(hits)
}

fn search_by_mixed(
    notes_root: &Path,
    tag_terms: &[String],
    body_terms: &[String],
    tag_matcher: &ExactMatcher,
    line_matcher: &ExactMatcher,
) -> Result<Vec<SearchHit>, String> {
    let paths = collect_cached_markdown_paths(notes_root)?;
    let mut hits: Vec<SearchHit> = paths
        .par_iter()
        .filter_map(|path| {
            let note = load_parsed_note(path).ok()?;
            let path_str = path.to_string_lossy().into_owned();
            search_mixed_in_note(&path_str, &note, tag_terms, body_terms, tag_matcher, line_matcher)
        })
        .collect();
    sort_hits_by_recency(&mut hits);
    Ok(hits)
}

fn search_body_in_note(
    path_str: &str,
    note: &ParsedNote,
    terms: &[String],
    matcher: &ExactMatcher,
) -> Option<SearchHit> {
    let searchable = searchable_lines(&note.lines);
    if !all_terms_match_lines(matcher, &searchable, terms) {
        return None;
    }
    searchable.into_iter().find_map(|(line_no, line)| {
        if terms.iter().any(|t| matcher.matches_line(line, t)) {
            Some(body_hit(path_str.to_string(), line_no, line.clone()))
        } else {
            None
        }
    })
}

fn search_mixed_in_note(
    path_str: &str,
    note: &ParsedNote,
    tag_terms: &[String],
    body_terms: &[String],
    tag_matcher: &ExactMatcher,
    line_matcher: &ExactMatcher,
) -> Option<SearchHit> {
    if !all_terms_match_tags(tag_matcher, tag_terms, &note.tags) {
        return None;
    }

    let searchable = searchable_lines(&note.lines);
    if !all_terms_match_lines(line_matcher, &searchable, body_terms) {
        return None;
    }

    searchable.into_iter().find_map(|(line_no, line)| {
        if body_terms
            .iter()
            .any(|t| line_matcher.matches_line(line, t))
        {
            Some(mixed_hit(path_str.to_string(), line_no, line.clone()))
        } else {
            None
        }
    })
}

pub(crate) fn search_notes_in_root(
    notes_root: &Path,
    query: &str,
) -> Result<SearchNotesResult, String> {
    search_notes_in_root_with_mode(notes_root, query, MatchMode::Exact)
}

pub(crate) fn search_notes_in_root_with_mode(
    notes_root: &Path,
    query: &str,
    mode: MatchMode,
) -> Result<SearchNotesResult, String> {
    let q = query.trim();
    if q.is_empty() {
        return Ok(SearchNotesResult {
            mode: SearchMode::Body,
            hits: vec![],
        });
    }
    if !notes_root.exists() {
        return Err(err(app_error::NOTES_DIR_REQUIRED));
    }

    let parsed = parse_query(q);
    let result_mode = search_mode_for_kind(parsed.kind);

    let hits = match parsed.kind {
        QueryKind::Tag => {
            if parsed.tag_terms.is_empty() {
                return Ok(SearchNotesResult {
                    mode: SearchMode::Tag,
                    hits: vec![],
                });
            }
            let matcher = mode.tag_matcher();
            search_by_tags(notes_root, &parsed.tag_terms, &matcher)?
        }
        QueryKind::Body => {
            if parsed.body_terms.is_empty() {
                return Ok(SearchNotesResult {
                    mode: SearchMode::Body,
                    hits: vec![],
                });
            }
            let matcher = mode.line_matcher();
            search_by_body(notes_root, &parsed.body_terms, &matcher)?
        }
        QueryKind::Mixed => {
            let tag_matcher = mode.tag_matcher();
            let line_matcher = mode.line_matcher();
            search_by_mixed(
                notes_root,
                &parsed.tag_terms,
                &parsed.body_terms,
                &tag_matcher,
                &line_matcher,
            )?
        }
    };

    Ok(SearchNotesResult {
        mode: result_mode,
        hits,
    })
}

/// 本文検索対象の行（1 始まりの行番号付き）。先頭の `---` … `---` フロントマターは除外。
fn searchable_lines(lines: &[String]) -> Vec<(usize, &String)> {
    if lines.first().map(|l| l.trim()) != Some("---") {
        return lines
            .iter()
            .enumerate()
            .map(|(index, line)| (index + 1, line))
            .collect();
    }

    let mut in_frontmatter = true;
    let mut out = Vec::new();
    for (index, line) in lines.iter().enumerate() {
        if in_frontmatter {
            if index > 0 && line.trim() == "---" {
                in_frontmatter = false;
            }
            continue;
        }
        out.push((index + 1, line));
    }
    out
}

#[tauri::command]
pub fn search_notes(app: tauri::AppHandle, query: String) -> Result<SearchNotesResult, String> {
    let notes_root = resolve_notes_root(&app)?;
    search_notes_in_root(&notes_root, &query)
}

pub fn invalidate_search_cache() {
    super::search_cache::invalidate_search_cache();
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::search_cache::{
        collect_cached_markdown_paths, fresh_test_root, invalidate_search_cache,
        invalidate_search_cache_file,
    };

    fn write_note(dir: &Path, name: &str, content: &str) -> PathBuf {
        let path = dir.join(name);
        let mut file = fs::File::create(&path).expect("create note");
        file.write_all(content.as_bytes()).expect("write note");
        path
    }

    fn fresh_root(name: &str) -> super::super::search_cache::TestNotesRoot {
        fresh_test_root(name)
    }

    #[test]
    fn body_search_requires_all_terms_in_same_file() {
        let root = fresh_root("scriptax-search-body-test");

        write_note(
            &root,
            "a.md",
            "---\ntags: []\n---\n\nhello world\n",
        );
        write_note(
            &root,
            "b.md",
            "---\ntags: []\n---\n\nhello only\n",
        );

        let result = search_notes_in_root(&root, "hello world").expect("search");
        assert_eq!(result.mode, SearchMode::Body);
        assert_eq!(result.hits.len(), 1);
        assert!(result.hits[0].path.ends_with("a.md"));
        assert_eq!(result.hits[0].mode, SearchMode::Body);
        assert!(result.hits[0].score.is_none());

        let partial = search_notes_in_root(&root, "hello").expect("search");
        assert_eq!(partial.hits.len(), 2);

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn tag_search_matches_frontmatter_tags_only() {
        let root = fresh_root("scriptax-search-tag-test");

        write_note(
            &root,
            "tagged.md",
            "---\ntags: [work, draft]\n---\n\n#work mention in body\n",
        );
        write_note(
            &root,
            "body-only.md",
            "---\ntags: []\n---\n\n#work in body only\n",
        );

        let result = search_notes_in_root(&root, "#work").expect("search");
        assert_eq!(result.mode, SearchMode::Tag);
        assert_eq!(result.hits.len(), 1);
        assert!(result.hits[0].path.ends_with("tagged.md"));
        assert!(result.hits[0].text.contains("#work"));
        assert_eq!(result.hits[0].mode, SearchMode::Tag);

        let and_result = search_notes_in_root(&root, "#work #draft").expect("search");
        assert_eq!(and_result.mode, SearchMode::Tag);
        assert_eq!(and_result.hits.len(), 1);

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn body_search_ignores_frontmatter() {
        let root = fresh_root("scriptax-search-fm-exclude-test");

        write_note(
            &root,
            "fm-only.md",
            "---\ntags: [secretword]\n---\n\nvisible body\n",
        );
        write_note(
            &root,
            "body-hit.md",
            "---\ntags: []\n---\n\nsecretword in body\n",
        );

        let result = search_notes_in_root(&root, "secretword").expect("search");
        assert_eq!(result.hits.len(), 1);
        assert!(result.hits[0].path.ends_with("body-hit.md"));
        assert!(result.hits[0].text.contains("secretword"));

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn tag_search_is_case_insensitive() {
        let root = fresh_root("scriptax-search-tag-case-test");

        write_note(
            &root,
            "note.md",
            "---\ntags: [Work]\n---\n\n",
        );

        let result = search_notes_in_root(&root, "#work").expect("search");
        assert_eq!(result.mode, SearchMode::Tag);
        assert_eq!(result.hits.len(), 1);

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn empty_tag_query_returns_tag_mode_with_no_hits() {
        let root = fresh_root("scriptax-search-empty-tag-test");

        let result = search_notes_in_root(&root, "#").expect("search");
        assert_eq!(result.mode, SearchMode::Tag);
        assert!(result.hits.is_empty());

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn mixed_search_requires_tag_and_body_terms() {
        let root = fresh_root("scriptax-search-mixed-test");

        write_note(
            &root,
            "match.md",
            "---\ntags: [work]\n---\n\nmeeting notes about project\n",
        );
        write_note(
            &root,
            "tag-only.md",
            "---\ntags: [work]\n---\n\nunrelated content\n",
        );
        write_note(
            &root,
            "body-only.md",
            "---\ntags: []\n---\n\nmeeting notes\n",
        );

        let result = search_notes_in_root(&root, "#work meeting").expect("search");
        assert_eq!(result.mode, SearchMode::Mixed);
        assert_eq!(result.hits.len(), 1);
        assert!(result.hits[0].path.ends_with("match.md"));
        assert_eq!(result.hits[0].mode, SearchMode::Mixed);
        assert!(result.hits[0].text.contains("meeting"));

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn body_search_lowercase_term_is_case_insensitive() {
        let root = fresh_root("scriptax-search-body-case-lower-test");
        write_note(
            &root,
            "note.md",
            "---\ntags: []\n---\n\nHello World\n",
        );

        let lower = search_notes_in_root(&root, "hello").expect("search lower");
        assert_eq!(lower.hits.len(), 1);
        assert_eq!(lower.mode, SearchMode::Body);

        let upper_in_term = search_notes_in_root(&root, "Hello").expect("search Hello");
        assert_eq!(upper_in_term.hits.len(), 1);

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn body_search_uppercase_term_is_case_sensitive() {
        let root = fresh_root("scriptax-search-body-case-upper-test");
        write_note(
            &root,
            "lower.md",
            "---\ntags: []\n---\n\nhello world\n",
        );
        write_note(
            &root,
            "upper.md",
            "---\ntags: []\n---\n\nHello World\n",
        );

        let result = search_notes_in_root(&root, "Hello").expect("search");
        assert_eq!(result.hits.len(), 1);
        assert!(result.hits[0].path.ends_with("upper.md"));

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn empty_and_whitespace_queries_return_empty_results() {
        let root = fresh_root("scriptax-search-empty-query-test");
        write_note(
            &root,
            "note.md",
            "---\ntags: []\n---\n\ncontent\n",
        );

        for query in ["", "   ", "\t", "  \n  "] {
            let result = search_notes_in_root(&root, query).expect("search");
            assert_eq!(result.mode, SearchMode::Body, "query={query:?}");
            assert!(result.hits.is_empty(), "query={query:?}");
        }

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn hash_only_tag_queries_return_tag_mode_without_hits() {
        let root = fresh_root("scriptax-search-hash-only-test");
        write_note(
            &root,
            "note.md",
            "---\ntags: [work]\n---\n\nbody\n",
        );

        for query in ["#", "# ", "  #  "] {
            let result = search_notes_in_root(&root, query).expect("search");
            assert_eq!(result.mode, SearchMode::Tag, "query={query:?}");
            assert!(result.hits.is_empty(), "query={query:?}");
        }

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn mixed_search_with_short_body_term() {
        let root = fresh_root("scriptax-search-mixed-foo-test");
        write_note(
            &root,
            "match.md",
            "---\ntags: [work]\n---\n\nfoo bar\n",
        );
        write_note(
            &root,
            "tag-only.md",
            "---\ntags: [work]\n---\n\nno matching term\n",
        );
        write_note(
            &root,
            "body-only.md",
            "---\ntags: []\n---\n\nfoo bar\n",
        );

        let result = search_notes_in_root(&root, "#work foo").expect("search");
        assert_eq!(result.mode, SearchMode::Mixed);
        assert_eq!(result.hits.len(), 1);
        assert!(result.hits[0].path.ends_with("match.md"));
        assert!(result.hits[0].text.contains("foo"));

        let _ = fs::remove_dir_all(&root);
    }

    /// あいまい検索（将来）: typo 1 文字・日本語などは `MatchMode::Fuzzy` 実装後に有効化
    #[test]
    #[ignore = "fuzzy search not implemented"]
    fn fuzzy_search_placeholder() {
        let root = fresh_root("scriptax-search-fuzzy-placeholder-test");
        write_note(
            &root,
            "note.md",
            "---\ntags: []\n---\n\nmeetng notes\n",
        );

        let exact = search_notes_in_root_with_mode(&root, "meeting", MatchMode::Exact).expect("exact");
        assert!(exact.hits.is_empty());

        // TODO: MatchMode::Fuzzy で "meeting" がヒットし score > 0 になることを検証する
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn repeated_search_returns_same_hits_with_warm_cache() {
        let root = fresh_root("scriptax-search-warm-repeat-test");
        write_note(
            &root,
            "a.md",
            "---\ntags: []\n---\n\nfindme here\n",
        );
        write_note(
            &root,
            "b.md",
            "---\ntags: []\n---\n\nfindme there\n",
        );

        let first = search_notes_in_root(&root, "findme").expect("first search");
        let second = search_notes_in_root(&root, "findme").expect("second search");
        assert_eq!(first, second);
        assert_eq!(first.hits.len(), 2);

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn search_sees_updated_content_after_file_invalidation() {
        let root = fresh_root("scriptax-search-invalidate-content-test");
        let path = write_note(
            &root,
            "note.md",
            "---\ntags: []\n---\n\nbefore edit\n",
        );

        let before = search_notes_in_root(&root, "before").expect("before search");
        assert_eq!(before.hits.len(), 1);

        write_note(
            &root,
            "note.md",
            "---\ntags: []\n---\n\nafter edit\n",
        );
        invalidate_search_cache_file(&path);

        let still_before = search_notes_in_root(&root, "before").expect("stale term");
        assert!(still_before.hits.is_empty());

        let after = search_notes_in_root(&root, "after").expect("after search");
        assert_eq!(after.hits.len(), 1);
        assert!(after.hits[0].path.ends_with("note.md"));

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn search_finds_new_file_after_path_invalidation() {
        let root = fresh_root("scriptax-search-invalidate-paths-test");
        write_note(
            &root,
            "first.md",
            "---\ntags: []\n---\n\nalpha\n",
        );
        let _ = collect_cached_markdown_paths(&root);

        write_note(
            &root,
            "second.md",
            "---\ntags: []\n---\n\nbeta\n",
        );
        invalidate_search_cache();

        let result = search_notes_in_root(&root, "beta").expect("search");
        assert_eq!(result.hits.len(), 1);
        assert!(result.hits[0].path.ends_with("second.md"));

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn tag_search_uses_cache_across_queries() {
        let root = fresh_root("scriptax-search-tag-cache-test");
        write_note(
            &root,
            "tagged.md",
            "---\ntags: [work]\n---\n\nbody\n",
        );
        write_note(
            &root,
            "other.md",
            "---\ntags: [draft]\n---\n\nbody\n",
        );

        let work = search_notes_in_root(&root, "#work").expect("tag search work");
        let draft = search_notes_in_root(&root, "#draft").expect("tag search draft");
        assert_eq!(work.hits.len(), 1);
        assert_eq!(draft.hits.len(), 1);
        assert!(work.hits[0].path.ends_with("tagged.md"));
        assert!(draft.hits[0].path.ends_with("other.md"));

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn search_warm_cache_smoke_with_small_corpus() {
        let root = fresh_root("scriptax-search-warm-smoke-test");
        for i in 0..20 {
            write_note(
                &root,
                &format!("note-{i:02}.md"),
                &format!("---\ntags: []\n---\n\nneedle {i}\n"),
            );
        }

        let first = search_notes_in_root(&root, "needle").expect("first");
        let second = search_notes_in_root(&root, "needle").expect("second");
        assert_eq!(first.hits.len(), 20);
        assert_eq!(first.hits, second.hits);

        let _ = fs::remove_dir_all(&root);
    }

    /// 典型ボリューム（500 件）の検索時間。手動計測用: `cargo test search_warm_cache_benchmark -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn search_warm_cache_benchmark() {
        let root = fresh_root("scriptax-search-bench-test");
        for i in 0..500 {
            write_note(
                &root,
                &format!("note-{i:03}.md"),
                &format!("---\ntags: [work]\n---\n\nkeyword line {i}\n"),
            );
        }

        let cold = Instant::now();
        let first = search_notes_in_root(&root, "keyword").expect("cold search");
        let cold_ms = cold.elapsed().as_millis();
        assert_eq!(first.hits.len(), 500);

        let warm = Instant::now();
        let second = search_notes_in_root(&root, "keyword").expect("warm search");
        let warm_ms = warm.elapsed().as_millis();
        assert_eq!(second.hits.len(), 500);

        eprintln!("search benchmark (500 notes, body): cold={cold_ms}ms warm={warm_ms}ms");
        assert!(warm_ms <= cold_ms);

        let _ = fs::remove_dir_all(&root);
    }
}
