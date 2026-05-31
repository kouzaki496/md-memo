//! 検索語の一致戦略。本文はデフォルト fuzzy、`"` 囲みは exact。

/// 全語 exact に強制するモード（テスト・後方互換用）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum MatchMode {
    #[default]
    Exact,
}

/// 本文行に対する語一致。
pub trait LineTermMatcher {
    fn matches_line(&self, line: &str, term: &str) -> bool;
}

/// フロントマター tags に対する語一致（タグ名の完全一致）。
pub trait TagTermMatcher {
    fn matches_tag(&self, note_tag: &str, search_term: &str) -> bool;
}

/// 本文 exact: 部分一致（語に大文字があれば大小区別）。
#[derive(Debug, Clone, Copy, Default)]
pub struct ExactMatcher;

/// 本文 fuzzy: 部分一致 or 編集距離（typo 許容）。
#[derive(Debug, Clone, Copy, Default)]
pub struct FuzzyMatcher;

/// fuzzy を有効にする最小語長（これ未満は exact のみ）。
pub const MIN_FUZZY_TERM_LEN: usize = 3;

/// fuzzy ヒットとして採用する最低スコア（`1 - dist/max_len`）。
pub const MIN_FUZZY_SCORE: f32 = 0.75;

/// 長語向けの許容編集距離比率。
pub const MAX_EDIT_RATIO: f32 = 0.34;

impl LineTermMatcher for ExactMatcher {
    fn matches_line(&self, line: &str, term: &str) -> bool {
        if term.is_empty() {
            return false;
        }
        if term.chars().any(|c| c.is_uppercase()) {
            line.contains(term)
        } else {
            line.to_lowercase().contains(&term.to_lowercase())
        }
    }
}

impl FuzzyMatcher {
    /// 1.0 = 部分一致、それ未満 = fuzzy。不一致は `None`。
    pub fn match_score(&self, line: &str, term: &str) -> Option<f32> {
        if term.is_empty() {
            return None;
        }
        if ExactMatcher.matches_line(line, term) {
            return Some(1.0);
        }
        // 大文字を含む語は exact のみ（fuzzy で別ケースへ広げない）
        if term.chars().any(|c| c.is_uppercase()) {
            return None;
        }
        if term.chars().count() < MIN_FUZZY_TERM_LEN {
            return None;
        }

        let mut best: Option<f32> = None;

        for word in split_words(line) {
            if let Some(score) = fuzzy_word_score(word, term) {
                best = Some(best.map_or(score, |b: f32| b.max(score)));
            }
        }

        best
    }
}

impl LineTermMatcher for FuzzyMatcher {
    fn matches_line(&self, line: &str, term: &str) -> bool {
        self.match_score(line, term).is_some()
    }
}

impl TagTermMatcher for ExactMatcher {
    fn matches_tag(&self, note_tag: &str, search_term: &str) -> bool {
        note_tag.to_lowercase() == search_term.to_lowercase()
    }
}

pub(crate) fn split_words(line: &str) -> impl Iterator<Item = &str> {
    line.split(|c: char| c.is_whitespace() || c == '-' || c == '_' || c == '/')
        .filter(|w| !w.is_empty())
}

fn fuzzy_word_score(word: &str, term: &str) -> Option<f32> {
    let wl = word.to_lowercase();
    let tl = term.to_lowercase();
    fuzzy_word_score_inner(&wl, &tl)
}

fn max_allowed_edits(max_len: usize) -> usize {
    if max_len < MIN_FUZZY_TERM_LEN {
        return 0;
    }
    if max_len <= 4 {
        return 1;
    }
    ((max_len as f32) * MAX_EDIT_RATIO).ceil() as usize
}

fn fuzzy_word_score_inner(word: &str, term: &str) -> Option<f32> {
    let max_len = word.chars().count().max(term.chars().count());
    if max_len == 0 {
        return None;
    }
    let dist = levenshtein_chars(word, term);
    let allowed = max_allowed_edits(max_len);
    if dist <= allowed {
        let score = 1.0 - (dist as f32 / max_len as f32);
        if score >= MIN_FUZZY_SCORE {
            Some(score)
        } else {
            None
        }
    } else {
        None
    }
}

fn levenshtein_chars(a: &str, b: &str) -> usize {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    let n = a.len();
    let m = b.len();
    if n == 0 {
        return m;
    }
    if m == 0 {
        return n;
    }

    let mut prev: Vec<usize> = (0..=m).collect();
    let mut curr = vec![0; m + 1];

    for i in 1..=n {
        curr[0] = i;
        for j in 1..=m {
            let cost = if a[i - 1] == b[j - 1] { 0 } else { 1 };
            curr[j] = (prev[j] + 1)
                .min(curr[j - 1] + 1)
                .min(prev[j - 1] + cost);
        }
        std::mem::swap(&mut prev, &mut curr);
    }
    prev[m]
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

    #[test]
    fn fuzzy_line_matcher_matches_typo() {
        let m = FuzzyMatcher;
        assert!(m.matches_line("weekly meeting notes", "meetng"));
        assert!(!m.matches_line("weekly meeting notes", "meetngs"));
    }

    #[test]
    fn fuzzy_line_matcher_short_term_requires_exact_substring() {
        let m = FuzzyMatcher;
        assert!(m.matches_line("go to it", "it"));
        assert!(!m.matches_line("go to at", "it"));
    }

    #[test]
    fn fuzzy_line_matcher_respects_case_when_term_has_uppercase() {
        let m = FuzzyMatcher;
        assert!(m.matches_line("Hello World", "Hello"));
        assert!(!m.matches_line("hello world", "Hello"));
    }

    #[test]
    fn fuzzy_score_is_lower_for_typo_than_exact() {
        let m = FuzzyMatcher;
        let exact = m.match_score("team meeting", "meeting").unwrap();
        let typo = m.match_score("team meeting", "meetng").unwrap();
        assert!((exact - 1.0).abs() < f32::EPSILON);
        assert!(typo < exact);
    }
}
