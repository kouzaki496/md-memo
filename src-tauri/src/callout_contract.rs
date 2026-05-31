//! `docs/callout-contract.json` を Rust 側から検証する契約テスト。

#[cfg(test)]
mod tests {
    use crate::preview_render::{
        normalize_callout_kind, render_note_body_html, split_preview_segments_contract,
    };
    use serde::Deserialize;

    const CONTRACT_JSON: &str = include_str!("../../docs/callout-contract.json");

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct CalloutContract {
        constants: ContractConstants,
        normalize_kind: Vec<NormalizeKindCase>,
        split_segments: Vec<SplitSegmentsCase>,
        render_body_html: Vec<RenderBodyHtmlCase>,
    }

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct ContractConstants {
        kinds: Vec<String>,
        default_kind: String,
        labels_ja: std::collections::HashMap<String, String>,
    }

    #[derive(Debug, Deserialize)]
    struct NormalizeKindCase {
        id: String,
        raw: Option<String>,
        kind: String,
    }

    #[derive(Debug, Deserialize)]
    struct SplitSegment {
        #[serde(rename = "type")]
        segment_type: String,
        #[serde(default)]
        kind: Option<String>,
        content: String,
    }

    #[derive(Debug, Deserialize)]
    struct SplitSegmentsCase {
        id: String,
        markdown: String,
        segments: Vec<SplitSegment>,
    }

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct RenderBodyHtmlCase {
        id: String,
        markdown: String,
        contains: Vec<String>,
    }

    fn load_contract() -> CalloutContract {
        serde_json::from_str(CONTRACT_JSON).expect("parse docs/callout-contract.json")
    }

    #[test]
    fn contract_constants_match_json() {
        let contract = load_contract();
        assert_eq!(contract.constants.default_kind, "info");
        assert_eq!(
            contract.constants.kinds,
            vec!["info", "warn", "alert", "tip"]
        );
        assert_eq!(contract.constants.labels_ja.get("warn").map(String::as_str), Some("注意"));
    }

    #[test]
    fn contract_normalize_kind() {
        let contract = load_contract();
        for case in contract.normalize_kind {
            let raw = case.raw.as_deref();
            assert_eq!(
                normalize_callout_kind(raw),
                case.kind.as_str(),
                "normalizeKind case {}",
                case.id
            );
        }
    }

    #[test]
    fn contract_split_segments() {
        let contract = load_contract();
        for case in contract.split_segments {
            let actual = split_preview_segments_contract(&case.markdown);
            let expected: Vec<(String, Option<String>, String)> = case
                .segments
                .into_iter()
                .map(|s| (s.segment_type, s.kind, s.content))
                .collect();
            assert_eq!(actual, expected, "splitSegments case {}", case.id);
        }
    }

    #[test]
    fn contract_render_body_html() {
        let contract = load_contract();
        for case in contract.render_body_html {
            let html = render_note_body_html(&case.markdown);
            for needle in case.contains {
                assert!(
                    html.contains(&needle),
                    "renderBodyHtml case {} missing {:?} in {}",
                    case.id,
                    needle,
                    html
                );
            }
        }
    }
}
