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

pub(crate) fn parse_tags_from_content(content: &str) -> Vec<String> {
    let mut lines = content.lines();
    if lines.next().map(str::trim) != Some("---") {
        return vec![];
    }

    let mut tags_line = None;
    for line in lines.by_ref() {
        let t = line.trim();
        if t == "---" {
            break;
        }
        if t.to_ascii_lowercase().starts_with("tags:") {
            tags_line = Some(t["tags:".len()..].trim().to_string());
        }
    }

    let Some(raw) = tags_line else {
        return vec![];
    };

    let val = raw.trim();
    if val.is_empty() {
        return vec![];
    }
    if val.starts_with('[') && val.ends_with(']') {
        let inner = &val[1..val.len() - 1];
        return inner
            .split(',')
            .map(|s| s.trim().trim_matches('"').trim_matches('\''))
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .collect();
    }

    val.split(',')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .collect()
}

pub(crate) fn parse_tags_from_fm_inner(fm: &str) -> Vec<String> {
    let mut raw_val: Option<String> = None;
    for line in fm.lines() {
        let t = line.trim_start();
        if t.len() >= 5 && t[..5].eq_ignore_ascii_case("tags:") {
            raw_val = Some(t[5..].trim().to_string());
            break;
        }
    }
    let Some(raw) = raw_val else {
        return vec![];
    };
    if raw.is_empty() {
        return vec![];
    }
    if raw.starts_with('[') && raw.ends_with(']') {
        let inner = raw[1..raw.len() - 1].trim();
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
    raw.split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
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
    tags.into_iter()
        .map(|t| {
            if t.eq_ignore_ascii_case(from) {
                to.to_string()
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
