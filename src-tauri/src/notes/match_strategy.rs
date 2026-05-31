//! 検索語の一致戦略。あいまい検索は `LineTermMatcher` の追加実装で差し込む。

/// 検索モード。コマンド引数化や設定連携は将来ここから拡張する。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum MatchMode {
    #[default]
    Exact,
    // Fuzzy { threshold: f32 },
}

/// 本文行に対する語一致（部分一致）。
pub trait LineTermMatcher {
    fn matches_line(&self, line: &str, term: &str) -> bool;
}

/// フロントマター tags に対する語一致（タグ名の完全一致）。
pub trait TagTermMatcher {
    fn matches_tag(&self, note_tag: &str, search_term: &str) -> bool;
}

/// 現在の exact 検索: 本文は部分一致、タグは大小区別なし完全一致。
#[derive(Debug, Clone, Copy, Default)]
pub struct ExactMatcher;

impl LineTermMatcher for ExactMatcher {
    /// 語に大文字が含まれる場合は大小区別、それ以外は大小区別なし。
    fn matches_line(&self, line: &str, term: &str) -> bool {
        if term.chars().any(|c| c.is_uppercase()) {
            line.contains(term)
        } else {
            line.to_lowercase().contains(&term.to_lowercase())
        }
    }
}

impl TagTermMatcher for ExactMatcher {
    fn matches_tag(&self, note_tag: &str, search_term: &str) -> bool {
        note_tag.to_lowercase() == search_term.to_lowercase()
    }
}

impl MatchMode {
    pub fn line_matcher(self) -> ExactMatcher {
        match self {
            MatchMode::Exact => ExactMatcher,
        }
    }

    pub fn tag_matcher(self) -> ExactMatcher {
        match self {
            MatchMode::Exact => ExactMatcher,
        }
    }
}

pub(crate) fn all_terms_match_lines<M: LineTermMatcher>(
    matcher: &M,
    lines: &[(usize, &String)],
    terms: &[String],
) -> bool {
    terms
        .iter()
        .all(|term| lines.iter().any(|(_, line)| matcher.matches_line(line, term)))
}

pub(crate) fn all_terms_match_tags<M: TagTermMatcher>(
    matcher: &M,
    search_terms: &[String],
    note_tags: &[String],
) -> bool {
    search_terms
        .iter()
        .all(|term| note_tags.iter().any(|tag| matcher.matches_tag(tag, term)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_line_matcher_case_insensitive_by_default() {
        let m = ExactMatcher;
        assert!(m.matches_line("Hello World", "hello"));
        assert!(!m.matches_line("hello world", "Hello"));
    }

    #[test]
    fn exact_line_matcher_case_sensitive_when_term_has_uppercase() {
        let m = ExactMatcher;
        assert!(m.matches_line("Hello World", "Hello"));
        assert!(!m.matches_line("hello world", "Hello"));
    }

    #[test]
    fn exact_tag_matcher_is_full_match_case_insensitive() {
        let m = ExactMatcher;
        assert!(m.matches_tag("Work", "work"));
        assert!(!m.matches_tag("work-in-progress", "work"));
    }

    #[test]
    fn all_terms_match_tags_requires_and() {
        let m = ExactMatcher;
        let tags = vec!["work".to_string(), "draft".to_string()];
        assert!(all_terms_match_tags(
            &m,
            &["work".to_string(), "draft".to_string()],
            &tags,
        ));
        assert!(!all_terms_match_tags(
            &m,
            &["work".to_string(), "missing".to_string()],
            &tags,
        ));
    }

    #[test]
    fn all_terms_match_lines_requires_and() {
        let m = ExactMatcher;
        let hello = "hello".to_string();
        let world = "world".to_string();
        let lines = vec![(1usize, &hello), (2, &world)];
        assert!(all_terms_match_lines(
            &m,
            &lines,
            &["hello".to_string(), "world".to_string()],
        ));
        assert!(!all_terms_match_lines(
            &m,
            &lines,
            &["hello".to_string(), "missing".to_string()],
        ));
    }

    /// あいまい検索（将来）: `FuzzyMatcher` 追加後に typo・部分スコアのケースをここへ
    #[test]
    #[ignore = "fuzzy matcher not implemented"]
    fn fuzzy_line_matcher_placeholder() {
        let _m = ExactMatcher;
        // TODO: "meetng" ~= "meeting" など
    }
}
