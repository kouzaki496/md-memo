//! `docs/frontmatter-contract.json` を Rust 側から検証する契約テスト。

#[cfg(test)]
mod tests {
    use crate::notes::frontmatter::{
        apply_tag_rename, dedupe_tags_case_insensitive, ensure_locked_inbox_first,
        normalize_inbox_exclusive_tags, parse_tags_from_content, parse_tags_from_fm_inner,
        rebuild_note_frontmatter_tags, toggle_tag_in_content, INBOX_TAG,
    };
    use crate::system_notes::{
        is_builtin_reserved_tag_name, BUILTIN_RESERVED_TAG, BUILTIN_TAGS_REFERENCE,
        BUILTIN_TAGS_SHORTCUTS, REFERENCE_PURPOSE_TAG, SHORTCUTS_PURPOSE_TAG,
    };
    use serde::Deserialize;

    const CONTRACT_JSON: &str = include_str!("../../../docs/frontmatter-contract.json");

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct FrontmatterContract {
        constants: ContractConstants,
        reserved_tags: ReservedTagsConstants,
        is_builtin_reserved_tag: Vec<ReservedTagCase>,
        parse_content_tags: Vec<TagsCase>,
        dedupe_tags: Vec<TagsTransformCase>,
        normalize_inbox_exclusive: Vec<TagsTransformCase>,
        ensure_locked_inbox_first: Vec<TagsTransformCase>,
        apply_tag_rename: Vec<RenameCase>,
        toggle_tag: Vec<ToggleTagCase>,
        rebuild_tags: Vec<RebuildTagsCase>,
    }

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct ContractConstants {
        inbox_tag: String,
    }

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct ReservedTagsConstants {
        builtin_reserved_tag: String,
        reference_purpose_tag: String,
        shortcuts_purpose_tag: String,
        builtin_tags_reference: Vec<String>,
        builtin_tags_shortcuts: Vec<String>,
    }

    #[derive(Debug, Deserialize)]
    struct ReservedTagCase {
        id: String,
        tag: String,
        reserved: bool,
    }

    #[derive(Debug, Deserialize)]
    struct TagsCase {
        id: String,
        content: String,
        tags: Vec<String>,
    }

    #[derive(Debug, Deserialize)]
    struct TagsTransformCase {
        id: String,
        input: Vec<String>,
        output: Vec<String>,
    }

    #[derive(Debug, Deserialize)]
    struct RenameCase {
        id: String,
        input: Vec<String>,
        from: String,
        to: String,
        output: Vec<String>,
    }

    #[derive(Debug, Deserialize)]
    struct ToggleTagCase {
        id: String,
        content: String,
        tag: String,
        tags: Vec<String>,
    }

    #[derive(Debug, Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct RebuildTagsCase {
        id: String,
        content: String,
        next_tags: Vec<String>,
        tags: Vec<String>,
    }

    fn load_contract() -> FrontmatterContract {
        serde_json::from_str(CONTRACT_JSON).expect("parse docs/frontmatter-contract.json")
    }

    #[test]
    fn contract_constants_match_json() {
        let c = load_contract();
        assert_eq!(INBOX_TAG, c.constants.inbox_tag);
    }

    #[test]
    fn contract_reserved_tags() {
        let c = load_contract();
        assert_eq!(BUILTIN_RESERVED_TAG, c.reserved_tags.builtin_reserved_tag);
        assert_eq!(REFERENCE_PURPOSE_TAG, c.reserved_tags.reference_purpose_tag);
        assert_eq!(SHORTCUTS_PURPOSE_TAG, c.reserved_tags.shortcuts_purpose_tag);
        assert_eq!(
            BUILTIN_TAGS_REFERENCE,
            c.reserved_tags.builtin_tags_reference.as_slice()
        );
        assert_eq!(
            BUILTIN_TAGS_SHORTCUTS,
            c.reserved_tags.builtin_tags_shortcuts.as_slice()
        );
    }

    #[test]
    fn contract_is_builtin_reserved_tag() {
        let c = load_contract();
        for case in &c.is_builtin_reserved_tag {
            assert_eq!(
                is_builtin_reserved_tag_name(&case.tag),
                case.reserved,
                "case {}",
                case.id
            );
        }
    }

    #[test]
    fn contract_parse_content_tags() {
        let c = load_contract();
        for case in &c.parse_content_tags {
            assert_eq!(
                parse_tags_from_content(&case.content),
                case.tags,
                "case {}",
                case.id
            );
        }
    }

    #[test]
    fn contract_parse_content_matches_fm_inner() {
        use crate::notes::frontmatter::note_frontmatter_regex;

        let c = load_contract();
        for case in &c.parse_content_tags {
            let Some(cap) = note_frontmatter_regex().captures(&case.content) else {
                assert!(case.tags.is_empty(), "case {}: expected empty tags", case.id);
                continue;
            };
            let fm = cap.get(1).map(|m| m.as_str()).unwrap_or("");
            assert_eq!(
                parse_tags_from_fm_inner(fm),
                parse_tags_from_content(&case.content),
                "case {}: content vs fm_inner",
                case.id
            );
        }
    }

    #[test]
    fn contract_dedupe_tags() {
        let c = load_contract();
        for case in &c.dedupe_tags {
            assert_eq!(
                dedupe_tags_case_insensitive(case.input.clone()),
                case.output,
                "case {}",
                case.id
            );
        }
    }

    #[test]
    fn contract_normalize_inbox_exclusive() {
        let c = load_contract();
        for case in &c.normalize_inbox_exclusive {
            assert_eq!(
                normalize_inbox_exclusive_tags(case.input.clone()),
                case.output,
                "case {}",
                case.id
            );
        }
    }

    #[test]
    fn contract_ensure_locked_inbox_first() {
        let c = load_contract();
        for case in &c.ensure_locked_inbox_first {
            assert_eq!(
                ensure_locked_inbox_first(case.input.clone()),
                case.output,
                "case {}",
                case.id
            );
        }
    }

    #[test]
    fn contract_apply_tag_rename() {
        let c = load_contract();
        for case in &c.apply_tag_rename {
            assert_eq!(
                apply_tag_rename(case.input.clone(), &case.from, &case.to),
                case.output,
                "case {}",
                case.id
            );
        }
    }

    #[test]
    fn contract_toggle_tag() {
        let c = load_contract();
        for case in &c.toggle_tag {
            let got = parse_tags_from_content(&toggle_tag_in_content(&case.content, &case.tag));
            assert_eq!(got, case.tags, "case {}", case.id);
        }
    }

    #[test]
    fn contract_rebuild_tags() {
        let c = load_contract();
        for case in &c.rebuild_tags {
            let rebuilt = rebuild_note_frontmatter_tags(&case.content, case.next_tags.clone())
                .unwrap_or_else(|| panic!("case {}: rebuild failed", case.id));
            assert_eq!(
                parse_tags_from_content(&rebuilt),
                case.tags,
                "case {}",
                case.id
            );
        }
    }
}
