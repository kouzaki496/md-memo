//! アプリプレビュー相当の Markdown 本文 HTML（情報共有向け・完全一致は目指さない）

use pulldown_cmark::{html, Options, Parser};
use regex::Regex;
use std::sync::LazyLock;
use syntect::highlighting::ThemeSet;
use syntect::html::highlighted_html_for_string;
use syntect::parsing::SyntaxSet;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum CalloutKind {
    Info,
    Warn,
    Alert,
    Tip,
}

impl CalloutKind {
    fn from_str(raw: Option<&str>) -> Self {
        match raw.unwrap_or("info").to_lowercase().as_str() {
            "warn" => Self::Warn,
            "alert" => Self::Alert,
            "tip" => Self::Tip,
            _ => Self::Info,
        }
    }

    fn css_class(self) -> &'static str {
        match self {
            Self::Info => "info",
            Self::Warn => "warn",
            Self::Alert => "alert",
            Self::Tip => "tip",
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::Info => "情報",
            Self::Warn => "注意",
            Self::Alert => "警告",
            Self::Tip => "ヒント",
        }
    }
}

enum PreviewSegment {
    Markdown(String),
    Callout { kind: CalloutKind, content: String },
}

static RE_BLOCK_START: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)^:::\s*note(?:\s+(info|warn|alert|tip))?\s*$").unwrap());
static RE_BLOCK_END: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^:::\s*$").unwrap());
static RE_SINGLE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)^note::(info|warn|alert|tip)\s+(.+)$").unwrap());
static RE_MULTI_START: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)^note::(info|warn|alert|tip)\s*$").unwrap());
static RE_MULTI_END: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)^::note\s*$").unwrap());
static RE_ORDERED_LIST: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^\d+\.\s").unwrap());
static RE_UNORDERED_LIST: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^[-*+]\s").unwrap());
static RE_TASK_LIST: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[-*+]\s\[[ xX]\]\s").unwrap());
static RE_PRE_CODE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?s)<pre><code(?: class="language-([^"]*)")?>(.*?)</code></pre>"#).unwrap()
});
static SYNTAX_SET: LazyLock<SyntaxSet> = LazyLock::new(SyntaxSet::load_defaults_newlines);
static THEME_SET: LazyLock<ThemeSet> = LazyLock::new(ThemeSet::load_defaults);

/// remark-breaks 相当: 段落内の単一改行を hard break にする（コードブロック内は除外）
fn is_block_start(line: &str) -> bool {
    let t = line.trim_start();
    if t.is_empty() {
        return true;
    }
    t.starts_with('#')
        || t.starts_with("```")
        || t.starts_with('>')
        || t.starts_with('|')
        || RE_UNORDERED_LIST.is_match(t)
        || RE_TASK_LIST.is_match(t)
        || RE_ORDERED_LIST.is_match(t)
}

fn apply_remark_breaks(md: &str) -> String {
    let lines: Vec<&str> = md.lines().collect();
    if lines.is_empty() {
        return String::new();
    }

    let mut out = String::new();
    let mut in_fence = false;

    for (i, line) in lines.iter().enumerate() {
        if i > 0 {
            if in_fence {
                out.push('\n');
            } else {
                let prev = lines[i - 1];
                let hard_break = !prev.trim().is_empty()
                    && !line.trim().is_empty()
                    && !is_block_start(prev)
                    && !is_block_start(*line);
                if hard_break {
                    out.push_str("  \n");
                } else {
                    out.push('\n');
                }
            }
        }
        if line.trim_start().starts_with("```") {
            in_fence = !in_fence;
        }
        out.push_str(line);
    }
    out
}

fn split_preview_segments(markdown: &str) -> Vec<PreviewSegment> {
    let lines: Vec<&str> = markdown.lines().collect();
    let mut segments: Vec<PreviewSegment> = Vec::new();
    let mut plain_buffer: Vec<&str> = Vec::new();

    let flush_plain = |buffer: &mut Vec<&str>, segments: &mut Vec<PreviewSegment>| {
        if buffer.is_empty() {
            return;
        }
        segments.push(PreviewSegment::Markdown(buffer.join("\n")));
        buffer.clear();
    };

    let mut i = 0usize;
    while i < lines.len() {
        let line = lines[i];

        if let Some(caps) = RE_BLOCK_START.captures(line) {
            flush_plain(&mut plain_buffer, &mut segments);
            let kind = CalloutKind::from_str(caps.get(1).map(|m| m.as_str()));
            let mut callout_lines: Vec<&str> = Vec::new();
            let mut found_end = false;
            let mut j = i + 1;
            while j < lines.len() {
                if RE_BLOCK_END.is_match(lines[j]) {
                    i = j;
                    found_end = true;
                    break;
                }
                callout_lines.push(lines[j]);
                j += 1;
            }

            if found_end {
                segments.push(PreviewSegment::Callout {
                    kind,
                    content: callout_lines.join("\n").trim().to_string(),
                });
            } else {
                plain_buffer.push(line);
                plain_buffer.extend_from_slice(&callout_lines);
                break;
            }
            i += 1;
            continue;
        }

        if let Some(caps) = RE_SINGLE.captures(line) {
            flush_plain(&mut plain_buffer, &mut segments);
            segments.push(PreviewSegment::Callout {
                kind: CalloutKind::from_str(caps.get(1).map(|m| m.as_str())),
                content: caps.get(2).map(|m| m.as_str()).unwrap_or("").to_string(),
            });
            i += 1;
            continue;
        }

        if let Some(caps) = RE_MULTI_START.captures(line) {
            flush_plain(&mut plain_buffer, &mut segments);
            let kind = CalloutKind::from_str(caps.get(1).map(|m| m.as_str()));
            let mut callout_lines: Vec<&str> = Vec::new();
            let mut found_end = false;
            let mut j = i + 1;
            while j < lines.len() {
                if RE_MULTI_END.is_match(lines[j]) {
                    i = j;
                    found_end = true;
                    break;
                }
                callout_lines.push(lines[j]);
                j += 1;
            }

            if found_end {
                segments.push(PreviewSegment::Callout {
                    kind,
                    content: callout_lines.join("\n").trim().to_string(),
                });
            } else {
                plain_buffer.push(line);
                plain_buffer.extend_from_slice(&callout_lines);
                break;
            }
            i += 1;
            continue;
        }

        plain_buffer.push(line);
        i += 1;
    }

    flush_plain(&mut plain_buffer, &mut segments);
    segments
}

fn markdown_fragment_to_html(md: &str) -> String {
    if md.trim().is_empty() {
        return String::new();
    }
    let md = apply_remark_breaks(md);
    let mut options = Options::empty();
    options.insert(
        Options::ENABLE_STRIKETHROUGH
            | Options::ENABLE_TABLES
            | Options::ENABLE_TASKLISTS,
    );
    let parser = Parser::new_ext(&md, options);
    let mut html_out = String::new();
    html::push_html(&mut html_out, parser);
    html_out
}

fn render_callout(kind: CalloutKind, content: &str) -> String {
    let body = markdown_fragment_to_html(content);
    format!(
        r#"<div class="md-callout md-callout--{class}" role="note"><span class="md-callout__label">{label}</span><div class="md-callout__body">{body}</div></div>"#,
        class = kind.css_class(),
        label = kind.label(),
        body = if body.is_empty() { String::new() } else { body },
    )
}

/// メモ本文（フロントマター除去済み）を提示用 HTML に変換する。
pub fn render_note_body_html(body: &str) -> String {
    let segments = split_preview_segments(body);
    if segments.is_empty() {
        return String::from("<p>（空）</p>");
    }

    let mut out = String::new();
    for segment in segments {
        match segment {
            PreviewSegment::Markdown(md) => {
                let html = markdown_fragment_to_html(&md);
                if !html.is_empty() {
                    out.push_str(&html);
                }
            }
            PreviewSegment::Callout { kind, content } => {
                out.push_str(&render_callout(kind, &content));
            }
        }
    }

    if out.is_empty() {
        String::from("<p>（空）</p>")
    } else {
        out
    }
}

fn decode_html_entities(text: &str) -> String {
    text.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
}

fn pick_theme() -> syntect::highlighting::Theme {
    let ts = &*THEME_SET;
    for name in ["Visual Studio Dark+", "base16-ocean.dark", "InspiredGitHub"] {
        if let Some(theme) = ts.themes.get(name) {
            return theme.clone();
        }
    }
    ts.themes
        .values()
        .next()
        .cloned()
        .expect("default syntax themes missing")
}

fn normalize_lang(lang: &str) -> String {
    match lang.to_lowercase().as_str() {
        "ts" => "typescript".to_string(),
        "js" => "javascript".to_string(),
        "py" => "python".to_string(),
        "rb" => "ruby".to_string(),
        "yml" => "yaml".to_string(),
        "sh" | "shell" | "zsh" => "bash".to_string(),
        "md" => "markdown".to_string(),
        "rs" => "rust".to_string(),
        "golang" => "go".to_string(),
        other => other.to_string(),
    }
}

/// 提示 HTML 内の `<pre><code>` を syntect でハイライトする（常にダーク背景）。
pub fn highlight_code_blocks_in_html(html: &str) -> String {
    let theme = pick_theme();
    RE_PRE_CODE
        .replace_all(html, |caps: &regex::Captures| {
            let lang = caps.get(1).map(|m| m.as_str()).unwrap_or("");
            let code = decode_html_entities(&caps[2]);
            let normalized = normalize_lang(lang);
            let syntax = SYNTAX_SET
                .find_syntax_by_token(&normalized)
                .or_else(|| SYNTAX_SET.find_syntax_by_extension(&normalized))
                .unwrap_or_else(|| SYNTAX_SET.find_syntax_plain_text());
            match highlighted_html_for_string(&code, &SYNTAX_SET, syntax, &theme) {
                Ok(highlighted) => format!(r#"<div class="md-code-block">{highlighted}</div>"#),
                Err(_) => format!("<pre><code>{code}</code></pre>"),
            }
        })
        .into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn block_callout_renders() {
        let md = "before\n::: note warn\nline1\nline2\n:::\nafter";
        let html = render_note_body_html(md);
        assert!(html.contains("md-callout--warn"));
        assert!(html.contains("line1"));
        assert!(html.contains("before"));
        assert!(html.contains("after"));
    }

    #[test]
    fn single_line_callout_renders() {
        let md = "note::tip hello world";
        let html = render_note_body_html(md);
        assert!(html.contains("md-callout--tip"));
        assert!(html.contains("hello world"));
    }

    #[test]
    fn multi_line_callout_renders() {
        let md = "note::alert\nalert body\n::note";
        let html = render_note_body_html(md);
        assert!(html.contains("md-callout--alert"));
        assert!(html.contains("alert body"));
    }

    #[test]
    fn single_newlines_become_hard_breaks() {
        let html = markdown_fragment_to_html("line one\nline two");
        assert!(
            html.contains("<br") || html.contains("<br/>") || html.contains("<br />"),
            "expected br tag, got {html}"
        );
    }

    #[test]
    fn code_fence_preserves_newlines_without_extra_breaks() {
        let md = "```\na\nb\n```";
        let html = markdown_fragment_to_html(md);
        assert!(html.contains("<code") || html.contains("<pre"));
        assert!(html.contains("a\nb") || html.contains("a\r\nb") || (html.contains('a') && html.contains('b')));
    }

    #[test]
    fn highlight_rust_code_block() {
        let html = markdown_fragment_to_html("```rust\nfn main() {}\n```");
        let highlighted = highlight_code_blocks_in_html(&html);
        assert!(highlighted.contains("md-code-block"));
        assert!(highlighted.contains("fn") && highlighted.contains("main"));
    }
}
