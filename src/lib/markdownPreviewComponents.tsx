import type { Components } from "react-markdown";
import { MarkdownCodeBlock } from "@/components/app/MarkdownCodeBlock";
import { MarkdownPreviewImage } from "@/components/app/MarkdownPreviewImage";
import { openUrl } from "@tauri-apps/plugin-opener";

async function openLinkInSystemBrowser(href: string) {
  try {
    await openUrl(href);
  } catch {
    window.open(href, "_blank", "noopener,noreferrer");
  }
}

function normalizeExternalBrowserHref(href: string): string | null {
  const t = href.trim();
  if (!t || t.startsWith("#")) return null;
  if (/^javascript:/i.test(t)) return null;
  if (/^https?:\/\//i.test(t)) return t;
  if (/^mailto:/i.test(t) || /^tel:/i.test(t)) return t;
  if (/^\/\//.test(t)) return `https:${t}`;
  return null;
}

export function createMarkdownPreviewComponents(): Partial<Components> {
  return {
    pre({ children }) {
      return <>{children}</>;
    },
    code({ className, children, ...props }) {
      const match = /language-(\w+)/.exec(className ?? "");
      const code = String(children).replace(/\n$/, "");
      const isBlock = Boolean(match) || code.includes("\n");

      if (!isBlock) {
        return (
          <code className={className} {...props}>
            {children}
          </code>
        );
      }

      return <MarkdownCodeBlock language={match?.[1]}>{code}</MarkdownCodeBlock>;
    },
    img({ src, alt, node: _n, ...props }) {
      if (!src) return null;
      return <MarkdownPreviewImage src={src} alt={alt} {...props} />;
    },
    a({ href, children, node: _n, ...props }) {
      return (
        <a
          {...props}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            if (!href) return;
            if (href.trim().startsWith("#")) return;
            e.preventDefault();
            const url = normalizeExternalBrowserHref(href);
            if (url) void openLinkInSystemBrowser(url);
          }}
        >
          {children}
        </a>
      );
    },
  };
}
