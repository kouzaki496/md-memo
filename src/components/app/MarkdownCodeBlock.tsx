import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import css from "react-syntax-highlighter/dist/esm/languages/prism/css";
import go from "react-syntax-highlighter/dist/esm/languages/prism/go";
import java from "react-syntax-highlighter/dist/esm/languages/prism/java";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import markdown from "react-syntax-highlighter/dist/esm/languages/prism/markdown";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import rust from "react-syntax-highlighter/dist/esm/languages/prism/rust";
import sql from "react-syntax-highlighter/dist/esm/languages/prism/sql";
import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import yaml from "react-syntax-highlighter/dist/esm/languages/prism/yaml";

SyntaxHighlighter.registerLanguage("bash", bash);
SyntaxHighlighter.registerLanguage("css", css);
SyntaxHighlighter.registerLanguage("go", go);
SyntaxHighlighter.registerLanguage("java", java);
SyntaxHighlighter.registerLanguage("javascript", javascript);
SyntaxHighlighter.registerLanguage("js", javascript);
SyntaxHighlighter.registerLanguage("json", json);
SyntaxHighlighter.registerLanguage("markdown", markdown);
SyntaxHighlighter.registerLanguage("md", markdown);
SyntaxHighlighter.registerLanguage("python", python);
SyntaxHighlighter.registerLanguage("py", python);
SyntaxHighlighter.registerLanguage("rust", rust);
SyntaxHighlighter.registerLanguage("rs", rust);
SyntaxHighlighter.registerLanguage("sql", sql);
SyntaxHighlighter.registerLanguage("tsx", tsx);
SyntaxHighlighter.registerLanguage("typescript", typescript);
SyntaxHighlighter.registerLanguage("ts", typescript);
SyntaxHighlighter.registerLanguage("yaml", yaml);
SyntaxHighlighter.registerLanguage("yml", yaml);

const CODE_BLOCK_BG = "#1e1e1e";
const CODE_BLOCK_FG = "#d4d4d4";

const CODE_BLOCK_STYLE: React.CSSProperties = {
  margin: "0.75rem 0",
  borderRadius: "0.375rem",
  fontSize: "0.875em",
  lineHeight: 1.6,
  padding: "0.85rem 1rem",
  background: CODE_BLOCK_BG,
  color: CODE_BLOCK_FG,
};

type MarkdownCodeBlockProps = {
  language?: string;
  children: string;
};

function normalizeLanguage(language?: string): string {
  if (!language) return "text";
  const lower = language.toLowerCase();
  const aliases: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "tsx",
    py: "python",
    rb: "ruby",
    yml: "yaml",
    sh: "bash",
    shell: "bash",
    zsh: "bash",
    md: "markdown",
    rs: "rust",
    golang: "go",
  };
  return aliases[lower] ?? lower;
}

export function MarkdownCodeBlock(props: MarkdownCodeBlockProps) {
  const { language, children } = props;

  return (
    <SyntaxHighlighter
      language={normalizeLanguage(language)}
      style={vscDarkPlus}
      PreTag="div"
      className="md-code-block not-prose"
      customStyle={CODE_BLOCK_STYLE}
      codeTagProps={{ className: "font-mono", style: { color: CODE_BLOCK_FG, background: "transparent" } }}
    >
      {children}
    </SyntaxHighlighter>
  );
}
