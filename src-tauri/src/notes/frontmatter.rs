use crate::system_notes;
use regex::Regex;
use std::sync::OnceLock;

static NOTE_FRONTMATTER: OnceLock<Regex> = OnceLock::new();

pub(crate) fn note_frontmatter_regex() -> &'static Regex {
    NOTE_FRONTMATTER.get_or_init(|| {
        Regex::new(r"(?s)^---\r?\n(.*?)\r?\n---\s*(?:\r?\n(.*))?$").expect("note frontmatter regex")
    })
}

fn line_starts_with_tags_ci(line: &str) -> bool {
    let t = line.trim_start();
    t.len() >= 5 && t[..5].eq_ignore_ascii_case("tags:")
}

/// `tags:` 行の値部分（`work, draft` / `[work, draft]`）をパースする。
fn parse_tags_value(raw: &str) -> Vec<String> {
    let val = raw.trim();
    if val.is_empty() {
        return vec![];
    }
    if val.starts_with('[') && val.ends_with(']') {
        let inner = val[1..val.len() - 1].trim();
        if inner.is_empty() {
            return vec![];
        }
        return inner
            .split(',')
            .map(|s| {
                s.trim()
                    .trim_matches(|c| c == '"' || c == '\'')
                    .to_string()
            })
            .filter(|s| !s.is_empty())
            .collect();
    }
    val.split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

/// フロントマター内テキストから tags を読む（最初の `tags:` 行のみ）。
pub(crate) fn parse_tags_from_fm_inner(fm: &str) -> Vec<String> {
    for line in fm.lines() {
        let t = line.trim_start();
        if t.len() >= 5 && t[..5].eq_ignore_ascii_case("tags:") {
            return parse_tags_value(&t[5..]);
        }
    }
    vec![]
}

/// メモ全文から tags を読む（regex で FM を抽出 → `parse_tags_from_fm_inner`）。
pub(crate) fn parse_tags_from_content(content: &str) -> Vec<String> {
    note_frontmatter_regex()
        .captures(content)
        .map(|cap| parse_tags_from_fm_inner(cap.get(1).map(|m| m.as_str()).unwrap_or("")))
        .unwrap_or_default()
}

pub(crate) fn dedupe_tags_case_insensitive(tags: Vec<String>) -> Vec<String> {
    let mut out = Vec::new();
    let mut seen = std::collections::HashSet::<String>::new();
    for t in tags {
        let key = t.to_lowercase();
        if seen.insert(key) {
            out.push(t);
        }
    }
    out
}

pub(crate) const INBOX_TAG: &str = "inbox";

pub(crate) fn normalize_inbox_exclusive_tags(tags: Vec<String>) -> Vec<String> {
    let without_inbox: Vec<String> = tags
        .into_iter()
        .filter(|t| !t.eq_ignore_ascii_case(INBOX_TAG))
        .collect();
    if without_inbox.is_empty() {
        vec![INBOX_TAG.to_string()]
    } else {
        without_inbox
    }
}

pub(crate) fn apply_tag_rename(tags: Vec<String>, from: &str, to: &str) -> Vec<String> {
    let from_trim = from.trim();
    let to_trim = to.trim();
    tags.into_iter()
        .map(|t| {
            if t.eq_ignore_ascii_case(from_trim) {
                to_trim.to_string()
            } else {
                t
            }
        })
        .collect()
}

pub(crate) fn remove_tag_from_list(tags: Vec<String>, target: &str) -> Vec<String> {
    tags.into_iter()
        .filter(|t| !t.eq_ignore_ascii_case(target))
        .collect()
}

pub(crate) fn ensure_locked_inbox_first(tags: Vec<String>) -> Vec<String> {
    let rest: Vec<String> = tags
        .into_iter()
        .filter(|t| {
            !t.eq_ignore_ascii_case(INBOX_TAG)
                && !system_notes::is_builtin_reserved_tag_name(t)
        })
        .collect();
    let mut out = vec![INBOX_TAG.to_string()];
    out.extend(rest);
    out
}

pub(crate) fn rebuild_note_frontmatter_tags(content: &str, next_tags: Vec<String>) -> Option<String> {
    let cap = note_frontmatter_regex().captures(content)?;
    let fm_raw = cap.get(1)?.as_str();
    let body = cap.get(2).map(|m| m.as_str()).unwrap_or("");
    let fm_lines: Vec<&str> = fm_raw
        .lines()
        .filter(|l| !line_starts_with_tags_ci(l))
        .filter(|l| !l.trim().is_empty())
        .collect();
    let mut new_fm = fm_lines.join("\n");
    if !new_fm.is_empty() {
        new_fm.push('\n');
    }
    new_fm.push_str("tags: ");
    new_fm.push_str(&next_tags.join(", "));
    Some(format!("---\n{new_fm}\n---\n{body}"))
}

fn normalize_toggle_tag(tag: &str) -> &str {
    tag.trim().trim_start_matches('#')
}

/// エディタのタグ toggle と同等（結果 tags を契約テストで FE と同期）。
pub(crate) fn toggle_tag_in_content(content: &str, tag: &str) -> String {
    let normalized = normalize_toggle_tag(tag);
    if normalized.is_empty() {
        return content.to_string();
    }
    if system_notes::is_builtin_reserved_tag_name(normalized) {
        return content.to_string();
    }

    let has_fm = note_frontmatter_regex().captures(content).is_some();
    let mut next_tags = parse_tags_from_content(content);
    if let Some(idx) = next_tags
        .iter()
        .position(|t| t.eq_ignore_ascii_case(normalized))
    {
        next_tags.remove(idx);
    } else {
        next_tags.push(normalized.to_string());
    }
    next_tags = normalize_inbox_exclusive_tags(next_tags);

    if has_fm {
        return rebuild_note_frontmatter_tags(content, next_tags)
            .unwrap_or_else(|| content.to_string());
    }

    format!("---\ntags: {}\n---\n{}", next_tags.join(", "), content)
}

pub(crate) fn merge_required_tags(existing: Vec<String>, required: &[&str]) -> Vec<String> {
    use std::collections::HashSet;
    let mut out = Vec::new();
    let mut seen = HashSet::<String>::new();

    for required_tag in required {
        let tag = existing
            .iter()
            .find(|t| t.eq_ignore_ascii_case(required_tag))
            .cloned()
            .unwrap_or_else(|| (*required_tag).to_string());
        let key = tag.to_lowercase();
        if seen.insert(key) {
            out.push(tag);
        }
    }

    for tag in existing {
        let key = tag.to_lowercase();
        if seen.insert(key) {
            out.push(tag);
        }
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_tags_from_content_delegates_to_fm_inner() {
        let content = "---\ntags: work, draft\n---\n\n# Title\n";
        assert_eq!(parse_tags_from_content(content), vec!["work", "draft"]);
        assert_eq!(
            parse_tags_from_fm_inner("tags: work, draft"),
            parse_tags_from_content(content)
        );
    }

    #[test]
    fn parse_tags_uses_first_tags_line() {
        let fm = "tags: first\nTags: second";
        assert_eq!(parse_tags_from_fm_inner(fm), vec!["first"]);
    }

    #[test]
    fn parse_tags_from_content_without_closing_fm_returns_empty() {
        assert_eq!(parse_tags_from_content("---\ntags: work\n"), Vec::<String>::new());
    }

    #[test]
    fn toggle_tag_adds_frontmatter_when_missing() {
        let next = toggle_tag_in_content("hello", "work");
        assert_eq!(parse_tags_from_content(&next), vec!["work"]);
    }

    #[test]
    fn merge_required_tags_preserves_existing_casing() {
        let existing = vec!["Reference".into(), "draft".into()];
        let required = &["reference", "_builtin"];
        let out = merge_required_tags(existing, required);
        assert_eq!(out, vec!["Reference", "_builtin", "draft"]);
    }

    #[test]
    fn merge_required_tags_dedupes_case_insensitive() {
        let existing = vec!["Work".into(), "work".into(), "draft".into()];
        let required = &["work"];
        let out = merge_required_tags(existing, required);
        assert_eq!(out, vec!["Work", "draft"]);
    }
}
