const VIEWER_THEME_BASE_CSS: &str = include_str!("../../../shared/theme-viewer-base.css");
const THEME_PRESETS_CSS: &str = include_str!("../../../shared/theme-presets.css");
const VIEWER_LAYOUT_CSS: &str = include_str!("viewer.css");
const MD_CALLOUT_CSS: &str = include_str!("../../../shared/md-callout.css");
const MD_MARKDOWN_EXTRAS_CSS: &str = include_str!("../../../shared/md-markdown-extras.css");
const MD_PROSE_VIEWER_CSS: &str = include_str!("../../../shared/md-prose-viewer.css");

fn viewer_stylesheet() -> String {
    format!(
        "{VIEWER_THEME_BASE_CSS}\n{THEME_PRESETS_CSS}\n{MD_CALLOUT_CSS}\n{MD_MARKDOWN_EXTRAS_CSS}\n{MD_PROSE_VIEWER_CSS}\n{VIEWER_LAYOUT_CSS}"
    )
}

pub(super) fn not_found_html() -> String {
    r#"<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>見つかりません</title></head>
<body><p>提示ページが見つかりません。</p></body></html>"#
        .to_string()
}

pub(super) fn viewer_html(token: &str) -> String {
    let theme_css = viewer_stylesheet();
    format!(
        r#"<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" type="image/png" href="/view/{token}/favicon.png">
  <title>Scriptax 提示</title>
  <style>
    {theme_css}
  </style>
</head>
<body>
  <header id="hdr">読み込み中…</header>
  <main id="main" class="prose"><p>読み込み中…</p></main>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@11.15.0/dist/mermaid.min.js"></script>
  <script>
    const TOKEN = {token_json};
    let hdr = document.getElementById("hdr");
    let main = document.getElementById("main");
    let lastSnapshot = null;
    let lastDisplayedKey = null;
    let systemThemeMedia = null;
    let eventSource = null;

    function closeEventSource() {{
      if (eventSource) {{
        eventSource.close();
        eventSource = null;
      }}
    }}

    function applyScrollRatio(ratio) {{
      const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const top = Math.max(0, Math.min(max, ratio * max));
      window.scrollTo({{ top, behavior: "instant" in window ? "instant" : "auto" }});
    }}

    function resolveIsDark(mode) {{
      if (mode === "dark") return true;
      if (mode === "light") return false;
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }}

    function applyTheme(s) {{
      const wasDark = document.documentElement.classList.contains("dark");
      const mode = s.themeMode || "system";
      const preset = s.themePreset || "default";
      const root = document.documentElement;
      root.classList.toggle("dark", resolveIsDark(mode));
      if (preset === "default") root.removeAttribute("data-theme-preset");
      else root.setAttribute("data-theme-preset", preset);

      if (systemThemeMedia) {{
        systemThemeMedia.removeEventListener("change", onSystemThemeChange);
        systemThemeMedia = null;
      }}
      if (mode === "system") {{
        systemThemeMedia = window.matchMedia("(prefers-color-scheme: dark)");
        systemThemeMedia.addEventListener("change", onSystemThemeChange);
      }}

      const isDark = root.classList.contains("dark");
      if (wasDark !== isDark && lastSnapshot?.bodyHtml?.includes("md-mermaid")) {{
        main.innerHTML = lastSnapshot.bodyHtml;
        requestAnimationFrame(() => {{ void renderMermaid(); }});
      }}
    }}

    async function mermaidReady() {{
      if (window.mermaid) return window.mermaid;
      if (!window.__mermaidReadyPromise) {{
        window.__mermaidReadyPromise = new Promise((resolve, reject) => {{
          const script = document.querySelector('script[src*="mermaid"]');
          if (!script) {{
            reject(new Error("Mermaid script tag missing"));
            return;
          }}
          const done = () => {{
            if (window.mermaid) resolve(window.mermaid);
            else reject(new Error("Mermaid failed to initialize"));
          }};
          if (script.dataset.loaded === "true" || window.mermaid) {{
            script.dataset.loaded = "true";
            done();
            return;
          }}
          script.addEventListener("load", () => {{
            script.dataset.loaded = "true";
            done();
          }}, {{ once: true }});
          script.addEventListener("error", () => reject(new Error("Mermaid script load failed")), {{ once: true }});
        }});
      }}
      return window.__mermaidReadyPromise;
    }}

    async function renderMermaid() {{
      const nodes = main.querySelectorAll(".md-mermaid pre.mermaid");
      if (!nodes.length) return;
      try {{
        const mermaid = await mermaidReady();
        const isDark = document.documentElement.classList.contains("dark");
        mermaid.initialize({{
          startOnLoad: false,
          theme: isDark ? "dark" : "default",
          securityLevel: "strict",
        }});
        await mermaid.run({{ nodes: Array.from(nodes) }});
      }} catch (err) {{
        console.error("Mermaid render failed:", err);
      }}
    }}

    function onSystemThemeChange() {{
      if (lastSnapshot) applyTheme(lastSnapshot);
    }}

    function applySnapshot(s) {{
      const prev = lastSnapshot;
      lastSnapshot = s;
      applyTheme(s);
      if (s.appShutdown) {{
        lastDisplayedKey = null;
        hdr.textContent = "提示を停止しました";
        main.innerHTML = '<p class="ended">Scriptax を終了したため、提示を終了しました。</p>';
        closeEventSource();
        return;
      }}
      if (!s.fileName && !s.active && !s.ended) {{
        lastDisplayedKey = null;
        hdr.textContent = "Scriptax 提示";
        main.innerHTML = '<p class="idle">アプリで提示するメモを選ぶと、ここに表示されます。</p>';
        return;
      }}
      if (s.ended || !s.active) {{
        lastDisplayedKey = null;
        hdr.textContent = "提示は終了しました";
        main.innerHTML = '<p class="ended">このメモの提示は終了しています。</p>';
        return;
      }}
      const displayKey = s.fileName;
      const displayChanged = lastDisplayedKey !== displayKey;
      const bodyChanged = !prev || prev.bodyHtml !== s.bodyHtml;
      hdr.textContent = "提示中: " + s.fileName;
      if (bodyChanged || displayChanged) {{
        main.innerHTML = s.bodyHtml || "<p>（空）</p>";
        requestAnimationFrame(() => {{ void renderMermaid(); }});
      }}
      if (displayChanged) {{
        lastDisplayedKey = displayKey;
        requestAnimationFrame(() => applyScrollRatio(0));
      }}
    }}

    fetch("/view/" + TOKEN + "/snapshot")
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(applySnapshot)
      .catch(() => {{
        hdr.textContent = "エラー";
        main.innerHTML = '<p class="ended">提示内容を読み込めませんでした。</p>';
      }});

    eventSource = new EventSource("/view/" + TOKEN + "/events");
    eventSource.addEventListener("scroll", (ev) => {{
      const ratio = parseFloat(ev.data);
      if (!Number.isNaN(ratio)) {{
        requestAnimationFrame(() => applyScrollRatio(ratio));
      }}
    }});
    eventSource.onmessage = (ev) => {{
      try {{
        applySnapshot(JSON.parse(ev.data));
      }} catch {{ /* ignore */ }}
    }};
    eventSource.onerror = () => {{ /* 自動再接続 */ }};
  </script>
</body>
</html>"#,
        theme_css = theme_css,
        token_json = serde_json::to_string(token).unwrap_or_else(|_| "\"\"".to_string())
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn viewer_html_includes_token_and_stylesheets() {
        let html = viewer_html("abc123");
        assert!(html.contains("/view/abc123/favicon.png"));
        assert!(html.contains("const TOKEN = \"abc123\""));
        assert!(html.contains("--background: oklch(0.988 0.006 250)"));
        assert!(html.contains("--md-callout-info-bg"));
        assert!(html.contains("html[data-theme-preset=\"sepia\"]"));
        assert!(html.contains(".md-callout--info"));
        assert!(html.contains("mermaid.min.js"));
        assert!(html.contains("mermaidReady"));
        assert!(html.contains(".prose h1"));
        assert!(html.contains("md-table-wrap"));
    }

    #[test]
    fn not_found_html_is_minimal_page() {
        let html = not_found_html();
        assert!(html.contains("見つかりません"));
    }
}
