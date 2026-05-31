//! メモ検索（タグ / 本文 AND）

mod query_parse;
mod scoring;

pub(crate) use query_parse::{parse_raw_terms, BodyTerm, RawTerm};

use super::match_strategy::{all_terms_match_tags, ExactMatcher, MatchMode, TagTermMatcher};
use query_parse::{parse_query, search_mode_for_kind, QueryKind};
use scoring::{
    all_body_terms_match, body_hit, body_term_matches, compute_body_hit_score, mixed_hit,
    sort_hits, tag_hit, SearchMatchCtx,
};
use super::search_cache::{collect_cached_markdown_paths, load_parsed_note, ParsedNote};
use super::store::resolve_notes_root;
use super::types::{SearchHit, SearchMode, SearchNotesResult};
use crate::app_error::{self, err};
use rayon::prelude::*;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::Instant;

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
    terms: &[query_parse::BodyTerm],
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
    body_terms: &[query_parse::BodyTerm],
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
    terms: &[query_parse::BodyTerm],
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
    body_terms: &[query_parse::BodyTerm],
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
        QueryKind::Mixed => search_by_mixed(
            notes_root,
            &parsed.tag_terms,
            &parsed.body_terms,
            &ctx,
        )?,
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
        .map_err(|e| app_error::with_detail(app_error::SEARCH_TASK_FAILED, e))?
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
