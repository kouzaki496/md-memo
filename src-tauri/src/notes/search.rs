//! メモ検索（タグ / 本文 AND）

use super::match_strategy::{
    all_terms_match_tags, ExactMatcher, FuzzyMatcher, LineTermMatcher, MatchMode, TagTermMatcher,
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

/// 本文検索語。`exact: true` は `"` 囲み or 全語 exact モード。
#[derive(Debug, Clone, PartialEq, Eq)]
struct BodyTerm {
    text: String,
    exact: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum RawTerm {
    Tag(String),
    Body(BodyTerm),
}

fn push_classified(out: &mut Vec<RawTerm>, text: &str, quoted: bool, force_all_exact: bool) {
    let body_exact = quoted || force_all_exact;
    if !quoted && !body_exact && text.starts_with('#') {
        let tag = text.trim_start_matches('#').trim();
        if !tag.is_empty() {
            out.push(RawTerm::Tag(tag.to_string()));
            return;
        }
    }
    out.push(RawTerm::Body(BodyTerm {
        text: text.to_string(),
        exact: body_exact,
    }));
}

/// 空白区切り + `"` … `"` フレーズ。未閉じ `"` は末尾まで exact 語として扱う。
fn parse_raw_terms(query: &str, force_all_exact: bool) -> Vec<RawTerm> {
    let mut out = Vec::new();
    let chars: Vec<char> = query.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        while i < chars.len() && chars[i].is_whitespace() {
            i += 1;
        }
        if i >= chars.len() {
            break;
        }
        if chars[i] == '"' {
            i += 1;
            let start = i;
            let mut closed = false;
            while i < chars.len() {
                if chars[i] == '"' {
                    closed = true;
                    let content: String = chars[start..i].iter().collect();
                    i += 1;
                    if !content.is_empty() {
                        push_classified(&mut out, &content, true, force_all_exact);
                    }
                    break;
                }
                i += 1;
            }
            if !closed {
                let content: String = chars[start..].iter().collect();
                if !content.is_empty() {
                    push_classified(&mut out, &content, true, force_all_exact);
                }
                break;
            }
        } else {
            let start = i;
            while i < chars.len() && !chars[i].is_whitespace() {
                i += 1;
            }
            let word: String = chars[start..i].iter().collect();
            if !word.is_empty() {
                push_classified(&mut out, &word, false, force_all_exact);
            }
        }
    }
    out
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
    body_terms: Vec<BodyTerm>,
}

/// `#` 始まり（引用符外）の語はタグ、それ以外は本文。両方あれば複合 AND。
fn parse_query(query: &str, force_all_exact: bool) -> ParsedQuery {
    let raw = parse_raw_terms(query, force_all_exact);
    if raw.is_empty() {
        return ParsedQuery {
            kind: QueryKind::Body,
            tag_terms: vec![],
            body_terms: vec![],
        };
    }

    let mut tag_terms = Vec::new();
    let mut body_terms = Vec::new();
    let mut saw_hash_only = false;

    for term in raw {
        match term {
            RawTerm::Tag(tag) => tag_terms.push(tag),
            RawTerm::Body(body) => {
                if body.text.starts_with('#') {
                    saw_hash_only = true;
                }
                body_terms.push(body);
            }
        }
    }

    let kind = if !tag_terms.is_empty() && !body_terms.is_empty() {
        QueryKind::Mixed
    } else if !tag_terms.is_empty() {
        QueryKind::Tag
    } else if saw_hash_only {
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

struct SearchMatchCtx {
    /// true = 全本文語を exact（`MatchMode::Exact` テスト用）
    force_all_exact: bool,
}

fn body_term_matches(line: &str, term: &BodyTerm, ctx: &SearchMatchCtx) -> bool {
    if term.exact || ctx.force_all_exact {
        ExactMatcher.matches_line(line, &term.text)
    } else {
        FuzzyMatcher.matches_line(line, &term.text)
    }
}

fn body_term_score(line: &str, term: &BodyTerm, ctx: &SearchMatchCtx) -> Option<f32> {
    if term.exact || ctx.force_all_exact {
        if ExactMatcher.matches_line(line, &term.text) {
            Some(1.0)
        } else {
            None
        }
    } else {
        FuzzyMatcher.match_score(line, &term.text)
    }
}

fn all_body_terms_match(
    lines: &[(usize, &String)],
    terms: &[BodyTerm],
    ctx: &SearchMatchCtx,
) -> bool {
    terms.iter().all(|term| {
        lines
            .iter()
            .any(|(_, line)| body_term_matches(line, term, ctx))
    })
}

fn compute_body_hit_score(
    lines: &[(usize, &String)],
    terms: &[BodyTerm],
    ctx: &SearchMatchCtx,
) -> Option<f32> {
    if terms.is_empty() {
        return None;
    }
    let use_fuzzy = !ctx.force_all_exact;
    let mut min_score = 1.0f32;
    let mut any_fuzzy = false;

    for term in terms {
        let best = lines
            .iter()
            .filter_map(|(_, line)| body_term_score(line, term, ctx))
            .max_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal))?;
        if use_fuzzy && !term.exact && best < 1.0 - f32::EPSILON {
            any_fuzzy = true;
        }
        min_score = min_score.min(best);
    }

    if any_fuzzy {
        Some(min_score)
    } else {
        None
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

fn body_hit(path: String, line: usize, text: String, score: Option<f32>) -> SearchHit {
    SearchHit {
        path,
        line,
        text,
        mode: SearchMode::Body,
        score,
    }
}

fn mixed_hit(path: String, line: usize, text: String, score: Option<f32>) -> SearchHit {
    SearchHit {
        path,
        line,
        text,
        mode: SearchMode::Mixed,
        score,
    }
}

fn sort_hits(hits: &mut [SearchHit]) {
    hits.sort_by(|a, b| {
        let sa = a.score.unwrap_or(1.0);
        let sb = b.score.unwrap_or(1.0);
        sb.partial_cmp(&sa)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| {
                let (au, ac) = file_timestamps_ms(Path::new(&a.path));
                let (bu, bc) = file_timestamps_ms(Path::new(&b.path));
                bu.cmp(&au)
                    .then_with(|| bc.cmp(&ac))
                    .then_with(|| a.path.cmp(&b.path))
            })
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
    sort_hits(&mut hits);
    Ok(hits)
}

fn search_by_body(
    notes_root: &Path,
    terms: &[BodyTerm],
    ctx: &SearchMatchCtx,
) -> Result<Vec<SearchHit>, String> {
    let paths = collect_cached_markdown_paths(notes_root)?;
    let mut hits: Vec<SearchHit> = paths
        .par_iter()
        .filter_map(|path| {
            let note = load_parsed_note(path).ok()?;
            let path_str = path.to_string_lossy().into_owned();
            search_body_in_note(&path_str, &note, terms, ctx)
        })
        .collect();
    sort_hits(&mut hits);
    Ok(hits)
}

fn search_by_mixed(
    notes_root: &Path,
    tag_terms: &[String],
    body_terms: &[BodyTerm],
    ctx: &SearchMatchCtx,
) -> Result<Vec<SearchHit>, String> {
    let paths = collect_cached_markdown_paths(notes_root)?;
    let tag_matcher = ExactMatcher;
    let mut hits: Vec<SearchHit> = paths
        .par_iter()
        .filter_map(|path| {
            let note = load_parsed_note(path).ok()?;
            let path_str = path.to_string_lossy().into_owned();
            search_mixed_in_note(&path_str, &note, tag_terms, body_terms, &tag_matcher, ctx)
        })
        .collect();
    sort_hits(&mut hits);
    Ok(hits)
}

fn search_body_in_note(
    path_str: &str,
    note: &ParsedNote,
    terms: &[BodyTerm],
    ctx: &SearchMatchCtx,
) -> Option<SearchHit> {
    let searchable = searchable_lines(&note.lines);
    if !all_body_terms_match(&searchable, terms, ctx) {
        return None;
    }
    let score = compute_body_hit_score(&searchable, terms, ctx);
    searchable.into_iter().find_map(|(line_no, line)| {
        if terms
            .iter()
            .any(|t| body_term_matches(line, t, ctx))
        {
            Some(body_hit(
                path_str.to_string(),
                line_no,
                line.clone(),
                score,
            ))
        } else {
            None
        }
    })
}

fn search_mixed_in_note(
    path_str: &str,
    note: &ParsedNote,
    tag_terms: &[String],
    body_terms: &[BodyTerm],
    tag_matcher: &ExactMatcher,
    ctx: &SearchMatchCtx,
) -> Option<SearchHit> {
    if !all_terms_match_tags(tag_matcher, tag_terms, &note.tags) {
        return None;
    }

    let searchable = searchable_lines(&note.lines);
    if !all_body_terms_match(&searchable, body_terms, ctx) {
        return None;
    }

    let score = compute_body_hit_score(&searchable, body_terms, ctx);
    searchable.into_iter().find_map(|(line_no, line)| {
        if body_terms
            .iter()
            .any(|t| body_term_matches(line, t, ctx))
        {
            Some(mixed_hit(
                path_str.to_string(),
                line_no,
                line.clone(),
                score,
            ))
        } else {
            None
        }
    })
}

pub(crate) fn search_notes_in_root(
    notes_root: &Path,
    query: &str,
) -> Result<SearchNotesResult, String> {
    search_notes_in_root_impl(notes_root, query, false)
}

pub(crate) fn search_notes_in_root_with_mode(
    notes_root: &Path,
    query: &str,
    mode: MatchMode,
) -> Result<SearchNotesResult, String> {
    search_notes_in_root_impl(notes_root, query, mode == MatchMode::Exact)
}

fn search_notes_in_root_impl(
    notes_root: &Path,
    query: &str,
    force_all_exact: bool,
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

    let parsed = parse_query(q, force_all_exact);
    let result_mode = search_mode_for_kind(parsed.kind);
    let ctx = SearchMatchCtx { force_all_exact };

    let hits = match parsed.kind {
        QueryKind::Tag => {
            if parsed.tag_terms.is_empty() {
                return Ok(SearchNotesResult {
                    mode: SearchMode::Tag,
                    hits: vec![],
                });
            }
            search_by_tags(notes_root, &parsed.tag_terms, &ExactMatcher)?
        }
        QueryKind::Body => {
            if parsed.body_terms.is_empty() {
                return Ok(SearchNotesResult {
                    mode: SearchMode::Body,
                    hits: vec![],
                });
            }
            search_by_body(notes_root, &parsed.body_terms, &ctx)?
        }
        QueryKind::Mixed => {
            search_by_mixed(
                notes_root,
                &parsed.tag_terms,
                &parsed.body_terms,
                &ctx,
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
pub async fn search_notes(
    app: tauri::AppHandle,
    query: String,
) -> Result<SearchNotesResult, String> {
    let notes_root = resolve_notes_root(&app)?;
    tauri::async_runtime::spawn_blocking(move || search_notes_in_root(&notes_root, &query))
        .await
        .map_err(|e| format!("search_task_failed: {e}"))?
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

    #[test]
    fn fuzzy_search_matches_typo_in_body() {
        let root = fresh_root("scriptax-search-fuzzy-typo-test");
        write_note(
            &root,
            "note.md",
            "---\ntags: []\n---\n\nweekly meeting notes\n",
        );

        let result = search_notes_in_root(&root, "meetng").expect("search");
        assert_eq!(result.hits.len(), 1);
        assert!(result.hits[0].path.ends_with("note.md"));
        assert!(result.hits[0].score.is_some());

        let exact = search_notes_in_root_with_mode(&root, "meetng", MatchMode::Exact)
            .expect("exact");
        assert!(exact.hits.is_empty());

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn quoted_term_requires_exact_substring() {
        let root = fresh_root("scriptax-search-quoted-exact-test");
        write_note(
            &root,
            "note.md",
            "---\ntags: []\n---\n\nweekly meeting notes\n",
        );

        let fuzzy = search_notes_in_root(&root, "meetng").expect("fuzzy");
        assert_eq!(fuzzy.hits.len(), 1);

        let quoted = search_notes_in_root(&root, "\"meetng\"").expect("quoted");
        assert!(quoted.hits.is_empty());

        let phrase = search_notes_in_root(&root, "\"weekly meeting\"").expect("phrase");
        assert_eq!(phrase.hits.len(), 1);
        assert!(phrase.hits[0].score.is_none());

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn parse_raw_terms_handles_quoted_phrase_and_tags() {
        let terms = parse_raw_terms("#work \"weekly report\" meetng", false);
        assert_eq!(terms.len(), 3);
        assert!(matches!(&terms[0], RawTerm::Tag(t) if t == "work"));
        assert!(matches!(
            &terms[1],
            RawTerm::Body(BodyTerm { text, exact: true }) if text == "weekly report"
        ));
        assert!(matches!(
            &terms[2],
            RawTerm::Body(BodyTerm { text, exact: false }) if text == "meetng"
        ));
    }

    #[test]
    fn parse_raw_terms_unclosed_quote_to_end() {
        let terms = parse_raw_terms("\"hello world", false);
        assert_eq!(terms.len(), 1);
        assert!(matches!(
            &terms[0],
            RawTerm::Body(BodyTerm { text, exact: true }) if text == "hello world"
        ));
    }

    #[test]
    fn empty_quoted_term_is_skipped() {
        let terms = parse_raw_terms("\"\"", false);
        assert!(terms.is_empty());
    }

    #[test]
    fn quoted_hash_is_body_not_tag() {
        let terms = parse_raw_terms("\"#work\"", false);
        assert_eq!(terms.len(), 1);
        assert!(matches!(
            &terms[0],
            RawTerm::Body(BodyTerm { text, exact: true }) if text == "#work"
        ));
    }

    #[test]
    fn mixed_fuzzy_and_quoted_exact() {
        let root = fresh_root("scriptax-search-mixed-fuzzy-quoted-test");
        write_note(
            &root,
            "match.md",
            "---\ntags: [work]\n---\n\nstand up meeting\n",
        );
        write_note(
            &root,
            "wrong-phrase.md",
            "---\ntags: [work]\n---\n\nstandup meetng\n",
        );

        let result = search_notes_in_root(&root, "#work \"stand up\" meetng").expect("search");
        assert_eq!(result.mode, SearchMode::Mixed);
        assert_eq!(result.hits.len(), 1);
        assert!(result.hits[0].path.ends_with("match.md"));

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
