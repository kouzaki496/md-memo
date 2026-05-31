//! `docs/search-contract.json` を Rust 側から検証する契約テスト。

#[cfg(test)]
mod tests {
    use crate::notes::match_strategy::{
        FuzzyMatcher, LineTermMatcher, MAX_EDIT_RATIO, MIN_FUZZY_SCORE, MIN_FUZZY_TERM_LEN,
    };
    use crate::notes::search::{parse_raw_terms, BodyTerm, RawTerm};
    use serde::Deserialize;

    const CONTRACT_JSON: &str = include_str!("../../../docs/search-contract.json");

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct SearchContract {
        constants: ContractConstants,
        raw_terms: Vec<RawTermsCase>,
        fuzzy_line_match: Vec<FuzzyLineCase>,
        fuzzy_scores: Vec<FuzzyScoreCase>,
    }

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct ContractConstants {
        min_fuzzy_term_len: u32,
        min_fuzzy_score: f32,
        max_edit_ratio: f32,
    }

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct RawTermsCase {
        id: String,
        query: String,
        #[serde(default)]
        force_all_exact: bool,
        terms: Vec<ExpectedRawTerm>,
    }

    #[derive(Debug, Deserialize)]
    struct ExpectedRawTerm {
        kind: String,
        text: String,
        #[serde(default)]
        exact: bool,
    }

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct FuzzyLineCase {
        id: String,
        line: String,
        term: String,
        matches: bool,
    }

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct FuzzyScoreCase {
        id: String,
        line: String,
        term: String,
        #[serde(default)]
        score: Option<f32>,
        #[serde(default)]
        score_min: Option<f32>,
        #[serde(default)]
        score_max: Option<f32>,
    }

    fn load_contract() -> SearchContract {
        serde_json::from_str(CONTRACT_JSON).expect("parse docs/search-contract.json")
    }

    fn assert_raw_terms(case: &RawTermsCase) {
        let parsed = parse_raw_terms(&case.query, case.force_all_exact);
        assert_eq!(
            parsed.len(),
            case.terms.len(),
            "case {}: term count",
            case.id
        );
        for (got, want) in parsed.iter().zip(case.terms.iter()) {
            match (got, want.kind.as_str()) {
                (RawTerm::Tag(tag), "tag") => {
                    assert_eq!(tag, &want.text, "case {}: tag text", case.id);
                }
                (RawTerm::Body(BodyTerm { text, exact }), "body") => {
                    assert_eq!(text, &want.text, "case {}: body text", case.id);
                    assert_eq!(*exact, want.exact, "case {}: body exact", case.id);
                }
                _ => panic!("case {}: kind mismatch {:?}", case.id, got),
            }
        }
    }

    #[test]
    fn contract_constants_match_json() {
        let c = load_contract();
        assert_eq!(MIN_FUZZY_TERM_LEN as u32, c.constants.min_fuzzy_term_len);
        assert!((MIN_FUZZY_SCORE - c.constants.min_fuzzy_score).abs() < f32::EPSILON);
        assert!((MAX_EDIT_RATIO - c.constants.max_edit_ratio).abs() < f32::EPSILON);
    }

    #[test]
    fn contract_raw_terms() {
        let c = load_contract();
        for case in &c.raw_terms {
            assert_raw_terms(case);
        }
    }

    #[test]
    fn contract_fuzzy_line_match() {
        let c = load_contract();
        let matcher = FuzzyMatcher;
        for case in &c.fuzzy_line_match {
            assert_eq!(
                matcher.matches_line(&case.line, &case.term),
                case.matches,
                "case {}",
                case.id
            );
        }
    }

    #[test]
    fn contract_fuzzy_scores() {
        let c = load_contract();
        let matcher = FuzzyMatcher;
        for case in &c.fuzzy_scores {
            let got = matcher.match_score(&case.line, &case.term);
            if let Some(score) = case.score {
                let got = got.unwrap_or_else(|| panic!("case {}: expected score", case.id));
                assert!(
                    (got - score).abs() < 1e-5,
                    "case {}: score got {got} want {score}",
                    case.id
                );
            }
            if let (Some(min), Some(max)) = (case.score_min, case.score_max) {
                let got = got.unwrap_or_else(|| panic!("case {}: expected score range", case.id));
                assert!(
                    got >= min && got <= max,
                    "case {}: score {got} not in [{min}, {max}]",
                    case.id
                );
            }
        }
    }

    #[test]
    fn contract_body_highlight_terms_align_with_raw_terms() {
        #[derive(Debug, Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct BodyCase {
            id: String,
            query: String,
            terms: Vec<BodyTermExpect>,
        }
        #[derive(Debug, Deserialize)]
        struct BodyTermExpect {
            text: String,
            exact: bool,
        }
        #[derive(Debug, Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct FullContract {
            body_highlight_terms: Vec<BodyCase>,
        }

        let full: FullContract = serde_json::from_str(CONTRACT_JSON).expect("parse contract");
        for case in &full.body_highlight_terms {
            let raw = parse_raw_terms(&case.query, false);
            let body_from_raw: Vec<BodyTermExpect> = raw
                .into_iter()
                .filter_map(|t| match t {
                    RawTerm::Body(BodyTerm { text, exact }) => Some(BodyTermExpect { text, exact }),
                    RawTerm::Tag(_) => None,
                })
                .collect();
            assert_eq!(
                body_from_raw.len(),
                case.terms.len(),
                "case {}: body term count",
                case.id
            );
            for (got, want) in body_from_raw.iter().zip(case.terms.iter()) {
                assert_eq!(got.text, want.text, "case {}: text", case.id);
                assert_eq!(got.exact, want.exact, "case {}: exact", case.id);
            }
        }
    }
}
