//! 検索ヒットのマッチ判定・スコアリング・ソート。

use crate::notes::match_strategy::{ExactMatcher, FuzzyMatcher, LineTermMatcher};
use crate::notes::store::file_timestamps_ms;
use crate::notes::types::{SearchHit, SearchMode};
use super::query_parse::BodyTerm;
use std::path::Path;

pub(crate) struct SearchMatchCtx {
    /// true = 全本文語を exact（`MatchMode::Exact` テスト用）
    pub(crate) force_all_exact: bool,
}

pub(crate) fn body_term_matches(line: &str, term: &BodyTerm, ctx: &SearchMatchCtx) -> bool {
    if term.exact || ctx.force_all_exact {
        ExactMatcher.matches_line(line, &term.text)
    } else {
        FuzzyMatcher.matches_line(line, &term.text)
    }
}

pub(crate) fn body_term_score(line: &str, term: &BodyTerm, ctx: &SearchMatchCtx) -> Option<f32> {
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

pub(crate) fn all_body_terms_match(
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

pub(crate) fn compute_body_hit_score(
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

pub(crate) fn tag_hit(path: String, text: String) -> SearchHit {
    SearchHit {
        path,
        line: 0,
        text,
        mode: SearchMode::Tag,
        score: None,
    }
}

pub(crate) fn body_hit(path: String, line: usize, text: String, score: Option<f32>) -> SearchHit {
    SearchHit {
        path,
        line,
        text,
        mode: SearchMode::Body,
        score,
    }
}

pub(crate) fn mixed_hit(path: String, line: usize, text: String, score: Option<f32>) -> SearchHit {
    SearchHit {
        path,
        line,
        text,
        mode: SearchMode::Mixed,
        score,
    }
}

pub(crate) fn sort_hits(hits: &mut [SearchHit]) {
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
