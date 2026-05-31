import type { ReactNode } from "react";
import type { Components } from "react-markdown";
import { MarkdownCodeBlock } from "@/components/app/MarkdownCodeBlock";
import { MarkdownPreviewImage } from "@/components/app/MarkdownPreviewImage";
import { highlightReactChildren } from "@/lib/searchHighlight";
import type { ParsedBodyTerm } from "@/lib/searchQueryParse";
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

type PreviewComponentsOptions = {
  highlightTerms?: ParsedBodyTerm[];
};

function wrapHighlightChildren(children: ReactNode, terms: ParsedBodyTerm[] | undefined) {
  if (!terms?.length) return children;
  return highlightReactChildren(children, terms);
}

export function createMarkdownPreviewComponents(
  options: PreviewComponentsOptions = {}
): Partial<Components> {
  const highlightTerms = options.highlightTerms ?? [];

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
          {wrapHighlightChildren(children, highlightTerms)}
        </a>
      );
    },
    p({ children, ...props }) {
      return <p {...props}>{wrapHighlightChildren(children, highlightTerms)}</p>;
    },
    li({ children, ...props }) {
      return <li {...props}>{wrapHighlightChildren(children, highlightTerms)}</li>;
    },
    h1({ children, ...props }) {
      return <h1 {...props}>{wrapHighlightChildren(children, highlightTerms)}</h1>;
    },
    h2({ children, ...props }) {
      return <h2 {...props}>{wrapHighlightChildren(children, highlightTerms)}</h2>;
    },
    h3({ children, ...props }) {
      return <h3 {...props}>{wrapHighlightChildren(children, highlightTerms)}</h3>;
    },
    h4({ children, ...props }) {
      return <h4 {...props}>{wrapHighlightChildren(children, highlightTerms)}</h4>;
    },
    h5({ children, ...props }) {
      return <h5 {...props}>{wrapHighlightChildren(children, highlightTerms)}</h5>;
    },
    h6({ children, ...props }) {
      return <h6 {...props}>{wrapHighlightChildren(children, highlightTerms)}</h6>;
    },
    td({ children, ...props }) {
      return <td {...props}>{wrapHighlightChildren(children, highlightTerms)}</td>;
    },
    th({ children, ...props }) {
      return <th {...props}>{wrapHighlightChildren(children, highlightTerms)}</th>;
    },
    blockquote({ children, ...props }) {
      return (
        <blockquote {...props}>{wrapHighlightChildren(children, highlightTerms)}</blockquote>
      );
    },
    strong({ children, ...props }) {
      return <strong {...props}>{wrapHighlightChildren(children, highlightTerms)}</strong>;
    },
    em({ children, ...props }) {
      return <em {...props}>{wrapHighlightChildren(children, highlightTerms)}</em>;
    },
    del({ children, ...props }) {
      return <del {...props}>{wrapHighlightChildren(children, highlightTerms)}</del>;
    },
  };
}
