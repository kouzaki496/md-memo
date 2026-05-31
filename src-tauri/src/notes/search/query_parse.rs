//! 検索クエリのパース（タグ / 本文 / 引用符 exact）。

use crate::notes::types::SearchMode;

/// 本文検索語。`exact: true` は `"` 囲み or 全語 exact モード。
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct BodyTerm {
    pub(crate) text: String,
    pub(crate) exact: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum RawTerm {
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
pub(crate) fn parse_raw_terms(query: &str, force_all_exact: bool) -> Vec<RawTerm> {
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
pub(crate) enum QueryKind {
    Tag,
    Body,
    Mixed,
}

pub(crate) struct ParsedQuery {
    pub(crate) kind: QueryKind,
    pub(crate) tag_terms: Vec<String>,
    pub(crate) body_terms: Vec<BodyTerm>,
}

/// `#` 始まり（引用符外）の語はタグ、それ以外は本文。両方あれば複合 AND。
pub(crate) fn parse_query(query: &str, force_all_exact: bool) -> ParsedQuery {
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

pub(crate) fn search_mode_for_kind(kind: QueryKind) -> SearchMode {
    match kind {
        QueryKind::Tag => SearchMode::Tag,
        QueryKind::Body => SearchMode::Body,
        QueryKind::Mixed => SearchMode::Mixed,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
