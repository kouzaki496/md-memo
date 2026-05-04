import { type KeyboardEvent, type MouseEvent, type RefObject, type WheelEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AlertTriangle, CheckCircle2, Lightbulb, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

type ReadingEditorPaneProps = {
  isEditMode: boolean;
  currentFileName: string;
  input: string;
  previewWidth: number;
  editorScale: number;
  previewScale: number;
  onEnterEditMode: () => void;
  onEnterPreviewMode: () => void;
  onChangeInput: (v: string) => void;
  onStartPreviewResize: (clientX: number) => void;
  onAdjustEditorScale: (delta: number) => void;
  onAdjustPreviewScale: (delta: number) => void;
  onResetEditorScale: () => void;
  onResetPreviewScale: () => void;
  editorRef: RefObject<HTMLTextAreaElement | null>;
};

type CalloutKind = "info" | "warn" | "alert" | "tip";

type PreviewSegment =
  | { type: "markdown"; content: string }
  | { type: "callout"; kind: CalloutKind; content: string };

function normalizeCalloutKind(raw?: string): CalloutKind {
  const v = (raw ?? "").toLowerCase();
  if (v === "warn" || v === "alert" || v === "tip") return v;
  return "info";
}

function splitPreviewSegments(markdown: string): PreviewSegment[] {
  const lines = markdown.split("\n");
  const segments: PreviewSegment[] = [];
  const plainBuffer: string[] = [];

  const flushPlain = () => {
    if (plainBuffer.length === 0) return;
    segments.push({ type: "markdown", content: plainBuffer.join("\n") });
    plainBuffer.length = 0;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const blockStart = line.match(/^:::\s*note(?:\s+(info|warn|alert|tip))?\s*$/i);
    if (blockStart) {
      flushPlain();
      const calloutLines: string[] = [];
      let foundEnd = false;
      for (let j = i + 1; j < lines.length; j += 1) {
        if (/^:::\s*$/.test(lines[j])) {
          i = j;
          foundEnd = true;
          break;
        }
        calloutLines.push(lines[j]);
      }

      if (foundEnd) {
        segments.push({
          type: "callout",
          kind: normalizeCalloutKind(blockStart[1]),
          content: calloutLines.join("\n").trim(),
        });
      } else {
        plainBuffer.push(line, ...calloutLines);
        break;
      }
      continue;
    }

    const single = line.match(/^note::(info|warn|alert|tip)\s+(.+)$/i);
    if (single) {
      flushPlain();
      segments.push({
        type: "callout",
        kind: normalizeCalloutKind(single[1]),
        content: single[2],
      });
      continue;
    }

    const multiStart = line.match(/^note::(info|warn|alert|tip)\s*$/i);
    if (!multiStart) {
      plainBuffer.push(line);
      continue;
    }

    flushPlain();
    const calloutLines: string[] = [];
    let foundEnd = false;
    for (let j = i + 1; j < lines.length; j += 1) {
      if (/^::note\s*$/i.test(lines[j])) {
        i = j;
        foundEnd = true;
        break;
      }
      calloutLines.push(lines[j]);
    }

    if (foundEnd) {
      segments.push({
        type: "callout",
        kind: normalizeCalloutKind(multiStart[1]),
        content: calloutLines.join("\n").trim(),
      });
    } else {
      plainBuffer.push(line, ...calloutLines);
      break;
    }
  }

  flushPlain();
  return segments;
}

export function ReadingEditorPane(props: ReadingEditorPaneProps) {
  const {
    isEditMode,
    currentFileName,
    input,
    previewWidth,
    editorScale,
    previewScale,
    onEnterEditMode,
    onEnterPreviewMode,
    onChangeInput,
    onStartPreviewResize,
    onAdjustEditorScale,
    onAdjustPreviewScale,
    onResetEditorScale,
    onResetPreviewScale,
    editorRef,
  } = props;

  const handlePreviewResizeMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    onStartPreviewResize(e.clientX);
  };

  const handleScaleShortcut = (
    e: KeyboardEvent<HTMLElement>,
    onAdjust: (delta: number) => void,
    onReset: () => void
  ) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      onAdjust(0.1);
      return;
    }
    if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      onAdjust(-0.1);
      return;
    }
    if (e.key === "0") {
      e.preventDefault();
      onReset();
    }
  };

  const handleScaleWheel = (
    e: WheelEvent<HTMLElement>,
    onAdjust: (delta: number) => void
  ) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    onAdjust(e.deltaY < 0 ? 0.1 : -0.1);
  };

  const renderPreviewLines = () => {
    const segments = splitPreviewSegments(input || "*(empty)*");
    return segments.map((segment, index) => {
      if (segment.type === "markdown") {
        return (
          <ReactMarkdown key={`md-${index}`} remarkPlugins={[remarkGfm]}>
            {segment.content}
          </ReactMarkdown>
        );
      }

      const body = segment.content.trim();
      return (
        <div key={`callout-${index}`} className={`md-callout md-callout--${segment.kind}`}>
          <span className="md-callout__icon" aria-hidden="true">
            {segment.kind === "warn" ? (
              <AlertTriangle size={18} />
            ) : segment.kind === "alert" ? (
              <XCircle size={18} />
            ) : segment.kind === "tip" ? (
              <Lightbulb size={18} />
            ) : (
              <CheckCircle2 size={18} />
            )}
          </span>
          {body ? (
            <div className="md-callout__body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
            </div>
          ) : null}
        </div>
      );
    });
  };

  if (isEditMode) {
    return (
      <div className="flex h-full min-h-0 min-w-0">
        <main className="flex-1 min-h-0 flex flex-col bg-background">
          <div className="h-12 shrink-0 border-b flex items-center justify-between px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider bg-background/80">
            <span>Editor - {currentFileName}</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => onAdjustEditorScale(-0.1)}>
                A-
              </Button>
              <Button variant="outline" size="sm" onClick={() => onAdjustEditorScale(0.1)}>
                A+
              </Button>
              <Button variant="ghost" size="sm" onClick={onEnterPreviewMode}>
                プレビューのみ
              </Button>
            </div>
          </div>
          <textarea
            ref={editorRef}
            className="flex-1 w-full p-12 bg-transparent resize-none focus:outline-none font-mono leading-relaxed"
            placeholder="Type something..."
            value={input}
            onChange={(e) => onChangeInput(e.target.value)}
            onKeyDown={(e) => handleScaleShortcut(e, onAdjustEditorScale, onResetEditorScale)}
            onWheel={(e) => handleScaleWheel(e, onAdjustEditorScale)}
            style={{
              fontSize: `${1.125 * editorScale}rem`,
              lineHeight: `${1.8 * editorScale}rem`,
            }}
          />
        </main>

        <div
          role="separator"
          aria-orientation="vertical"
          className="pane-resizer hidden lg:flex"
          onMouseDown={handlePreviewResizeMouseDown}
        />
        <aside
          className="min-h-0 border-l bg-background/80 hidden lg:flex overflow-hidden flex-col"
          style={{ width: `${previewWidth}px` }}
        >
          <div className="h-12 shrink-0 border-b flex items-center justify-between px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <span>Preview</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => onAdjustPreviewScale(-0.1)}>
                A-
              </Button>
              <Button variant="outline" size="sm" onClick={() => onAdjustPreviewScale(0.1)}>
                A+
              </Button>
            </div>
          </div>
          <ScrollArea className="min-h-0 flex-1 p-8">
            <div
              className="markdown-preview prose prose-slate dark:prose-invert prose-headings:font-heading max-w-none"
              style={{ fontSize: `${previewScale}rem` }}
              tabIndex={0}
              onKeyDown={(e) => handleScaleShortcut(e, onAdjustPreviewScale, onResetPreviewScale)}
              onWheel={(e) => handleScaleWheel(e, onAdjustPreviewScale)}
            >
              {renderPreviewLines()}
            </div>
          </ScrollArea>
        </aside>
      </div>
    );
  }

  return (
    <main className="flex-1 min-h-0 flex flex-col bg-background">
      <div className="h-12 shrink-0 border-b flex items-center justify-between px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider bg-background/80">
        <span>Preview - {currentFileName}</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => onAdjustPreviewScale(-0.1)}>
            A-
          </Button>
          <Button variant="outline" size="sm" onClick={() => onAdjustPreviewScale(0.1)}>
            A+
          </Button>
          <Button variant="outline" size="sm" onClick={onEnterEditMode} className="shadow-sm">
            編集
          </Button>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1 p-8">
        <div
          className="markdown-preview prose prose-slate dark:prose-invert prose-headings:font-heading max-w-none"
          style={{ fontSize: `${previewScale}rem` }}
          tabIndex={0}
          onKeyDown={(e) => handleScaleShortcut(e, onAdjustPreviewScale, onResetPreviewScale)}
          onWheel={(e) => handleScaleWheel(e, onAdjustPreviewScale)}
        >
          {renderPreviewLines()}
        </div>
      </ScrollArea>
    </main>
  );
}
