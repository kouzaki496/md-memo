import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

const DEFAULT_APP_TITLE = "Scriptax";

const PRINT_STYLE = `
  @page {
    margin: 16mm;
  }
  html,
  body {
    margin: 0;
    padding: 0;
    background: var(--background);
    color: var(--foreground);
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  body {
    padding: 0;
  }
  .markdown-preview {
    font-size: 1rem !important;
    max-width: none;
    min-width: 0;
    overflow-wrap: break-word;
  }
  .markdown-preview :is(p, li, td, th, blockquote, dd, a) {
    overflow-wrap: break-word;
  }
  .markdown-preview :is(p, li, td, th, blockquote) > code,
  .markdown-preview .md-code-block pre,
  .markdown-preview .md-code-block code,
  .markdown-preview div[class*="language-"] pre,
  .markdown-preview div[class*="language-"] code {
    white-space: pre-wrap !important;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
  .markdown-preview img {
    max-width: 100%;
    height: auto;
  }
  .markdown-preview .md-table-wrap {
    max-width: 100%;
    overflow: visible;
    page-break-inside: avoid;
  }
  .markdown-preview .md-table-wrap table {
    display: table !important;
    min-width: 0 !important;
    width: 100% !important;
    table-layout: auto;
    border-collapse: collapse;
  }
  .markdown-preview .md-table-wrap th,
  .markdown-preview .md-table-wrap td {
    overflow-wrap: break-word;
    word-break: break-word;
  }
  .markdown-preview .md-mermaid svg {
    max-width: 100%;
    height: auto;
  }
  .markdown-preview .md-code-block,
  .markdown-preview div[class*="language-"] {
    max-width: 100%;
    overflow-x: visible;
    background: #1e1e1e !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  @media print {
    *, *::before, *::after {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
  }
`;

function copyDocumentStyles(target: Document): void {
  document.head.querySelectorAll('style').forEach((node) => {
    target.head.appendChild(node.cloneNode(true));
  });

  document.head.querySelectorAll('link[rel="stylesheet"]').forEach((node) => {
    const link = node as HTMLLinkElement;
    const copy = target.createElement("link");
    copy.rel = "stylesheet";
    copy.href = link.href;
    target.head.appendChild(copy);
  });
}

/** メモファイル名から PDF 保存時のベース名（.md を除く） */
export function memoPdfBasename(fileName: string): string {
  const trimmed = fileName.trim();
  if (!trimmed) return "memo";
  return trimmed.replace(/\.md$/i, "") || trimmed;
}

export type PrintMarkdownPreviewOptions = {
  /** 「PDF に保存」の初期ファイル名（拡張子なし） */
  suggestedFilename?: string;
};

/** 印刷用 iframe はアプリのテーマ設定に関わらずデフォルトのライトテーマに固定 */
function applyPrintLightTheme(target: Document): void {
  const html = target.documentElement;
  html.classList.remove("dark");
  html.removeAttribute("data-theme-preset");
}

function waitForStyles(target: Document): Promise<void> {
  const links = Array.from(target.querySelectorAll('link[rel="stylesheet"]'));
  if (links.length === 0) {
    return Promise.resolve();
  }

  return Promise.all(
    links.map(
      (node) =>
        new Promise<void>((resolve) => {
          const link = node as HTMLLinkElement;
          if (link.sheet) {
            resolve();
            return;
          }
          link.addEventListener("load", () => resolve(), { once: true });
          link.addEventListener("error", () => resolve(), { once: true });
        })
    )
  ).then(() => undefined);
}

/** プレビュー DOM の見た目（100% ズーム）だけを印刷する */
export async function printMarkdownPreview(
  previewRoot: HTMLElement,
  options: PrintMarkdownPreviewOptions = {}
): Promise<void> {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  // width/height 0 の iframe だと印刷レイアウト幅が 0 になりテーブル等が消える
  iframe.style.cssText =
    "position:fixed;left:0;top:0;width:100%;height:100%;border:0;visibility:hidden;pointer-events:none;z-index:-1;";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) {
    iframe.remove();
    return;
  }

  applyPrintLightTheme(doc);
  copyDocumentStyles(doc);

  const filename = options.suggestedFilename?.trim()
    ? memoPdfBasename(options.suggestedFilename)
    : DEFAULT_APP_TITLE;
  doc.title = filename;

  const priorDocTitle = document.title;
  let priorWinTitle: string | null = null;
  let titleChanged = false;
  if (isTauri()) {
    try {
      priorWinTitle = await getCurrentWindow().title();
      await getCurrentWindow().setTitle(filename);
      titleChanged = true;
    } catch {
      /* 権限不足など — 印刷自体は続行 */
    }
  }
  document.title = filename;

  const restoreTitles = async () => {
    document.title = priorDocTitle;
    if (isTauri() && titleChanged && priorWinTitle != null) {
      try {
        await getCurrentWindow().setTitle(priorWinTitle);
      } catch {
        /* ignore */
      }
    }
  };

  const extra = doc.createElement("style");
  extra.textContent = PRINT_STYLE;
  doc.head.appendChild(extra);

  const wrapper = doc.createElement("div");
  wrapper.className = previewRoot.className;
  wrapper.innerHTML = previewRoot.innerHTML;
  doc.body.appendChild(wrapper);

  let cleanupTimer: number | undefined;
  const cleanup = () => {
    if (cleanupTimer != null) {
      window.clearTimeout(cleanupTimer);
    }
    void restoreTitles();
    iframe.remove();
  };

  win.onafterprint = cleanup;
  cleanupTimer = window.setTimeout(cleanup, 120_000);

  try {
    await waitForStyles(doc);
    await doc.fonts?.ready;
    void doc.body.offsetHeight;
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    win.focus();
    win.print();
  } catch (err) {
    console.error("printMarkdownPreview failed:", err);
    cleanup();
  }
}
