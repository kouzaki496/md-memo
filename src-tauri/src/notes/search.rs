//! メモ検索（タグ / 本文 AND）

use super::frontmatter::parse_tags_from_content;
use super::store::{collect_markdown_paths, file_timestamps_ms, resolve_notes_root, sort_paths_by_recency};
use super::types::SearchHit;
use rayon::prelude::*;
use std::fs;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

/// 語に大文字が含まれる場合は大小区別、それ以外は大小区別なしで部分一致する。
/// 将来: あいまい検索（編集距離・n-gram 等）はこの関数を差し替えて実装する。
fn term_matches_line(line: &str, term: &str) -> bool {
    if term.chars().any(|c| c.is_uppercase()) {
        line.contains(term)
    } else {
        line.to_lowercase().contains(&term.to_lowercase())
    }
}

fn parse_search_terms(query: &str) -> Vec<String> {
    query
        .split_whitespace()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .collect()
}

/// すべての語が `#` で始まるときタグ検索
fn is_tag_search_query(query: &str) -> bool {
    let terms = parse_search_terms(query);
    !terms.is_empty() && terms.iter().all(|t| t.starts_with('#'))
}

fn parse_tag_search_terms(query: &str) -> Vec<String> {
    parse_search_terms(query)
        .into_iter()
        .map(|t| t.trim_start_matches('#').trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

fn note_tags_match(tag_terms: &[String], note_tags: &[String]) -> bool {
    let terms_lower: Vec<String> = tag_terms.iter().map(|t| t.to_lowercase()).collect();
    let tags_lower: Vec<String> = note_tags.iter().map(|t| t.to_lowercase()).collect();
    terms_lower
        .iter()
        .all(|term| tags_lower.iter().any(|t| t == term))
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

fn search_by_tags(notes_root: &Path, tag_terms: &[String]) -> Result<Vec<SearchHit>, String> {
    let mut paths = collect_markdown_paths(notes_root)?;
    sort_paths_by_recency(&mut paths);

    let terms_lower: Vec<String> = tag_terms.iter().map(|t| t.to_lowercase()).collect();
    let mut hits: Vec<SearchHit> = paths
        .into_iter()
        .filter_map(|path| {
            let content = fs::read_to_string(&path).ok()?;
            let tags = parse_tags_from_content(&content);
            if !note_tags_match(tag_terms, &tags) {
                return None;
            }
            let matched: Vec<String> = tags
                .iter()
                .filter(|t| terms_lower.contains(&t.to_lowercase()))
                .map(|t| format!("#{}", t))
                .collect();
            Some(SearchHit {
                path: path.to_string_lossy().into_owned(),
                line: 0,
                text: matched.join(" "),
            })
        })
        .collect();
    sort_hits_by_recency(&mut hits);
    Ok(hits)
}

fn search_by_body(notes_root: &Path, terms: &[String]) -> Result<Vec<SearchHit>, String> {
    let paths = collect_markdown_paths(notes_root)?;
    let mut hits: Vec<SearchHit> = paths
        .par_iter()
        .filter_map(|path| search_in_file(path, terms).ok())
        .flatten()
        .collect();
    sort_hits_by_recency(&mut hits);
    Ok(hits)
}

pub(crate) fn search_notes_in_root(notes_root: &Path, query: &str) -> Vec<SearchHit> {
    let q = query.trim();
    if q.is_empty() {
        return vec![];
    }
    if !notes_root.exists() {
        return vec![];
    }

    if is_tag_search_query(q) {
        let tag_terms = parse_tag_search_terms(q);
        if tag_terms.is_empty() {
            return vec![];
        }
        return search_by_tags(notes_root, &tag_terms).unwrap_or_default();
    }

    let terms = parse_search_terms(q);
    if terms.is_empty() {
        return vec![];
    }
    search_by_body(notes_root, &terms).unwrap_or_default()
}

fn search_in_file(path: &PathBuf, terms: &[String]) -> std::io::Result<Vec<SearchHit>> {
    let file = File::open(path)?;
    let reader = BufReader::new(file);
    let mut lines: Vec<String> = Vec::new();
    for line in reader.lines() {
        lines.push(line?);
    }

    // AND 条件: すべての語が「同一ファイル内」のどこかに存在すること
    let file_matches_all_terms = terms
        .iter()
        .all(|t| lines.iter().any(|line| term_matches_line(line, t)));
    if !file_matches_all_terms {
        return Ok(vec![]);
    }

    // 返却は 1 ファイル 1 件。代表行として最初に一致した行を使う。
    let first_hit = lines.into_iter().enumerate().find_map(|(index, line)| {
        if terms.iter().any(|t| term_matches_line(&line, t)) {
            Some(SearchHit {
                path: path.to_string_lossy().into_owned(),
                line: index + 1,
                text: line,
            })
        } else {
            None
        }
    });
    Ok(first_hit.into_iter().collect())
}

#[tauri::command]
pub fn search_notes(app: tauri::AppHandle, query: String) -> Vec<SearchHit> {
    let notes_root = match resolve_notes_root(&app) {
        Ok(root) => root,
        Err(_) => return vec![],
    };
    search_notes_in_root(&notes_root, &query)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn write_note(dir: &Path, name: &str, content: &str) -> PathBuf {
        let path = dir.join(name);
        let mut file = File::create(&path).expect("create note");
        file.write_all(content.as_bytes()).expect("write note");
        path
    }

    #[test]
    fn body_search_requires_all_terms_in_same_file() {
        let root = std::env::temp_dir().join("scriptax-search-body-test");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("mkdir");

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

        let hits = search_notes_in_root(&root, "hello world");
        assert_eq!(hits.len(), 1);
        assert!(hits[0].path.ends_with("a.md"));

        let partial = search_notes_in_root(&root, "hello");
        assert_eq!(partial.len(), 2);

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn tag_search_matches_frontmatter_tags_only() {
        let root = std::env::temp_dir().join("scriptax-search-tag-test");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("mkdir");

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

        let hits = search_notes_in_root(&root, "#work");
        assert_eq!(hits.len(), 1);
        assert!(hits[0].path.ends_with("tagged.md"));
        assert!(hits[0].text.contains("#work"));

        let and_hits = search_notes_in_root(&root, "#work #draft");
        assert_eq!(and_hits.len(), 1);

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn tag_search_is_case_insensitive() {
        let root = std::env::temp_dir().join("scriptax-search-tag-case-test");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("mkdir");

        write_note(
            &root,
            "note.md",
            "---\ntags: [Work]\n---\n\n",
        );

        let hits = search_notes_in_root(&root, "#work");
        assert_eq!(hits.len(), 1);

        let _ = fs::remove_dir_all(&root);
    }
}
