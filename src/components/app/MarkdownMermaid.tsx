import { useEffect, useId, useRef, useState } from "react";

function useDocumentDark(): boolean {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains("dark"));

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      setIsDark(root.classList.contains("dark"));
    });
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

type MarkdownMermaidProps = {
  chart: string;
};

export function MarkdownMermaid(props: MarkdownMermaidProps) {
  const { chart } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const isDark = useDocumentDark();
  const renderId = useId().replace(/:/g, "");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;

    void (async () => {
      const { default: mermaid } = await import("mermaid");
      if (cancelled) return;

      mermaid.initialize({
        startOnLoad: false,
        theme: isDark ? "dark" : "default",
        // strict は DOMPurify 連携で WebView 上で失敗することがある
        securityLevel: "loose",
      });

      try {
        const { svg } = await mermaid.render(`md-mermaid-${renderId}`, chart);
        if (cancelled) return;
        container.innerHTML = svg;
      } catch (err) {
        console.error("Mermaid render failed:", err);
        if (cancelled) return;
        container.replaceChildren();
        const pre = document.createElement("pre");
        pre.className = "mermaid mermaid--error";
        pre.textContent = chart;
        container.appendChild(pre);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chart, isDark, renderId]);

  return <div ref={containerRef} className="md-mermaid not-prose" />;
}
