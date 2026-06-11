import { type KeyboardEvent, type RefObject, type WheelEvent, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { AlertTriangle, CheckCircle2, Lightbulb, Lock, XCircle } from "lucide-react";
import { createMarkdownPreviewComponents } from "@/lib/markdownPreviewComponents";
import { messages } from "@/lib/messages";
import { isBuiltinReservedTagName } from "@/lib/reservedTags";
import { splitPreviewSegments } from "@/lib/previewSegments";
import type { ParsedBodyTerm } from "@/lib/searchQueryParse";
import { cn } from "@/lib/utils";

const remarkPreviewPlugins = [remarkGfm, remarkBreaks];

const previewMarkdownClassName =
  "markdown-preview prose prose-slate dark:prose-invert prose-headings:font-heading max-w-none min-w-0 w-full";

type MarkdownPreviewBodyProps = {
  previewMarkdown: string;
  contentScale: number;
  highlightTerms: ParsedBodyTerm[];
  previewFmTags: string[];
  templateTags: string[];
  previewPrintRef: RefObject<HTMLDivElement | null>;
  readOnlyBadge?: React.ReactNode;
  onScaleKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
  onScaleWheel: (e: WheelEvent<HTMLElement>) => void;
};

export function MarkdownPreviewBody(props: MarkdownPreviewBodyProps) {
  const {
    previewMarkdown,
    contentScale,
    highlightTerms,
    previewFmTags,
    templateTags,
    previewPrintRef,
    onScaleKeyDown,
    onScaleWheel,
  } = props;

  const markdownPreviewComponents = useMemo(
    () => createMarkdownPreviewComponents({ highlightTerms }),
    [highlightTerms]
  );

  const renderMarkdownSegment = (
    segment: Extract<ReturnType<typeof splitPreviewSegments>[number], { type: "markdown" }>,
    index: number
  ) => (
    <ReactMarkdown
      key={`md-${index}`}
      remarkPlugins={remarkPreviewPlugins}
      components={markdownPreviewComponents}
    >
      {segment.content}
    </ReactMarkdown>
  );

  const renderPreviewLines = () => {
    const segments = splitPreviewSegments(previewMarkdown || messages.manager.emptyPreview);
    return segments.map((segment, index) => {
      if (segment.type === "markdown") {
        return renderMarkdownSegment(segment, index);
      }

      const body = segment.content.trim();
      return (
        <div key={`callout-${index}`} className={cn(`md-callout md-callout--${segment.kind}`)}>
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
              <ReactMarkdown
                remarkPlugins={remarkPreviewPlugins}
                components={markdownPreviewComponents}
              >
                {body}
              </ReactMarkdown>
            </div>
          ) : null}
        </div>
      );
    });
  };

  const renderPreviewTagsBar = () => {
    if (previewFmTags.length === 0) return null;
    return (
      <div className="mb-5 flex flex-wrap items-center gap-2" aria-label={messages.tags.previewLabel}>
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground shrink-0">
          {messages.tags.previewLabel}
        </span>
        {previewFmTags.map((tag, i) => {
          const listed = templateTags.some((t) => t.toLowerCase() === tag.toLowerCase());
          const reserved = isBuiltinReservedTagName(tag);
          return (
            <span
              key={`${tag}-${i}`}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs font-medium",
                reserved
                  ? "border-border bg-muted/40 text-muted-foreground"
                  : listed
                    ? "border-primary/35 bg-primary/12 text-primary"
                    : "border-border bg-muted/55 text-muted-foreground"
              )}
              title={reserved ? messages.tags.builtinLabel : undefined}
            >
              {tag}
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <>
      {renderPreviewTagsBar()}
      <div
        ref={previewPrintRef}
        className={previewMarkdownClassName}
        style={{ fontSize: `${contentScale}rem` }}
        tabIndex={0}
        onKeyDown={onScaleKeyDown}
        onWheel={onScaleWheel}
      >
        {renderPreviewLines()}
      </div>
    </>
  );
}

export function ReadOnlyBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/70 bg-muted/50 px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal text-muted-foreground">
      <Lock className="h-3 w-3" />
      {messages.tags.readOnlyBadge}
    </span>
  );
}

export { previewMarkdownClassName };
