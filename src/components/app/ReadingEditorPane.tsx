import { type MouseEvent, type RefObject, useCallback, useMemo, useRef, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EditorEditToolbar } from "@/components/app/EditorEditToolbar";
import { EditorLineGutter } from "@/components/app/EditorLineGutter";
import { EditorTagsBar, persistTagsBarExpanded, readInitialTagsBarExpanded } from "@/components/app/EditorTagsBar";
import { MarkdownPreviewBody, ReadOnlyBadge } from "@/components/app/MarkdownPreviewBody";
import { PreviewPaneToolbar } from "@/components/app/PreviewPaneToolbar";
import { useEditorImageInsert } from "@/hooks/useEditorImageInsert";
import { useEditorMarkdownShortcuts } from "@/hooks/useEditorMarkdownShortcuts";
import { useEditorPreviewScrollSync } from "@/hooks/useEditorPreviewScrollSync";
import { useSearchHighlightTerms } from "@/hooks/useSearchHighlight";
import { getMarkdownBody, parseNoteContent, buildEditorTagChips } from "@/lib/noteTags";
import { messages } from "@/lib/messages";
import { memoPdfBasename, printMarkdownPreview } from "@/lib/printPreview";
import type { SearchMode } from "@/types/note";

type ReadingEditorPaneProps = {
  isEditMode: boolean;
  isReadOnly: boolean;
  /** 保存済みメモのパス。未保存の新規のみ null */
  currentPath: string | null;
  currentFileName: string;
  input: string;
  previewWidth: number;
  contentScale: number;
  templateTags: string[];
  onEnterEditMode: () => void;
  onEnterPreviewMode: () => void;
  onChangeInput: (v: string) => void;
  onToggleTemplateTag: (tag: string) => void;
  onStartPreviewResize: (clientX: number) => void;
  onAdjustContentScale: (delta: number) => void;
  onResetContentScale: () => void;
  onDeleteCurrentNote: () => void;
  onOpenInNewWindow?: () => void;
  onPresentInBrowser?: () => void;
  /** 提示中にプレビューのスクロール比率を viewer へ送る */
  onPresentationPreviewScroll?: (ratio: number) => void;
  editorRef: RefObject<HTMLTextAreaElement | null>;
  searchQuery?: string;
  searchMode?: SearchMode;
};

export function ReadingEditorPane(props: ReadingEditorPaneProps) {
  const {
    isEditMode,
    isReadOnly,
    currentPath,
    currentFileName,
    input,
    previewWidth,
    contentScale,
    templateTags,
    onEnterEditMode,
    onEnterPreviewMode,
    onChangeInput,
    onToggleTemplateTag,
    onStartPreviewResize,
    onAdjustContentScale,
    onResetContentScale,
    onDeleteCurrentNote,
    onOpenInNewWindow,
    onPresentInBrowser,
    onPresentationPreviewScroll,
    editorRef,
    searchQuery = "",
    searchMode = "body",
  } = props;

  const highlightTerms = useSearchHighlightTerms(searchQuery, searchMode);
  const previewMarkdown = useMemo(() => getMarkdownBody(input), [input]);
  const editorLineCount = useMemo(() => Math.max(1, input.split("\n").length), [input]);
  const previewBodyLineCount = useMemo(
    () => Math.max(1, previewMarkdown.split("\n").length),
    [previewMarkdown]
  );

  const readOnlyBadge = isReadOnly ? <ReadOnlyBadge /> : null;
  const previewPrintRef = useRef<HTMLDivElement>(null);
  const editorFontSizeRem = 1.125 * contentScale;
  const editorLineHeightRem = 1.8 * contentScale;
  const previewFmTags = useMemo(() => parseNoteContent(input).tags, [input]);
  const editorTagChips = useMemo(
    () => buildEditorTagChips(templateTags, previewFmTags),
    [templateTags, previewFmTags]
  );
  const activeTagSet = useMemo(() => {
    const tags = parseNoteContent(input).tags;
    return new Set(tags.map((t) => t.toLowerCase()));
  }, [input]);

  const [tagsBarExpanded, setTagsBarExpanded] = useState(readInitialTagsBarExpanded);

  const {
    handleEditorKeyDown,
    handleScaleShortcut,
    handleScaleWheel,
    applyEditorTextAndCursor,
    clearShortcutUndo,
  } = useEditorMarkdownShortcuts({
    editorRef,
    onChangeInput,
    onAdjustContentScale,
    onResetContentScale,
  });

  const {
    editorGutterInnerRef,
    splitPreviewScrollHostRef,
    previewOnlyScrollHostRef,
    handleEditorScroll,
  } = useEditorPreviewScrollSync({
    editorRef,
    isEditMode,
    previewWidth,
    contentScale,
    input,
    onPresentationPreviewScroll,
  });

  const { handleInsertImageClick, handleEditorPaste, handleEditorDragOver, handleEditorDrop } =
    useEditorImageInsert({
      editorRef,
      isReadOnly,
      isEditMode,
      applyEditorTextAndCursor,
    });

  const handlePrintPreview = useCallback(() => {
    const root = previewPrintRef.current;
    if (!root) return;
    void printMarkdownPreview(root, {
      suggestedFilename: memoPdfBasename(currentFileName),
    });
  }, [currentFileName]);

  const toggleTagsBar = () => {
    setTagsBarExpanded((prev) => {
      const next = !prev;
      persistTagsBarExpanded(next);
      return next;
    });
  };

  const handlePreviewResizeMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    onStartPreviewResize(e.clientX);
  };

  const previewTitle = (
    <span className="flex min-w-0 items-baseline gap-2">
      <span className="min-w-0 truncate">{messages.editor.previewTitle}</span>
      {readOnlyBadge}
      <span className="shrink-0 normal-case tabular-nums tracking-normal text-[11px] text-muted-foreground/90">
        {messages.editor.lineCount(previewBodyLineCount)}
      </span>
    </span>
  );

  const previewBody = (
    <MarkdownPreviewBody
      previewMarkdown={previewMarkdown}
      contentScale={contentScale}
      highlightTerms={highlightTerms}
      previewFmTags={previewFmTags}
      templateTags={templateTags}
      previewPrintRef={previewPrintRef}
      onScaleKeyDown={(e) => handleScaleShortcut(e, onAdjustContentScale, onResetContentScale)}
      onScaleWheel={handleScaleWheel}
    />
  );

  if (isEditMode) {
    return (
      <div className="flex h-full min-h-0 min-w-0 flex-1">
        <main className="min-h-0 min-w-0 flex-1 flex flex-col bg-background">
          <EditorEditToolbar
            currentFileName={currentFileName}
            isReadOnly={isReadOnly}
            onInsertImage={() => void handleInsertImageClick()}
            onAdjustContentScale={onAdjustContentScale}
            onEnterPreviewMode={onEnterPreviewMode}
          />
          <div className="flex min-h-0 min-w-0 flex-1">
            <EditorLineGutter
              lineCount={editorLineCount}
              fontSizeRem={editorFontSizeRem}
              lineHeightRem={editorLineHeightRem}
              innerRef={editorGutterInnerRef}
            />
            <textarea
              ref={editorRef}
              className="min-h-0 min-w-0 flex-1 resize-none overflow-y-auto bg-transparent px-12 py-12 font-mono focus:outline-none"
              placeholder={messages.editor.placeholder}
              value={input}
              onChange={(e) => {
                clearShortcutUndo();
                onChangeInput(e.target.value);
              }}
              onKeyDown={handleEditorKeyDown}
              onPaste={(e) => void handleEditorPaste(e)}
              onDragOver={handleEditorDragOver}
              onDrop={(e) => void handleEditorDrop(e)}
              onScroll={handleEditorScroll}
              onWheel={handleScaleWheel}
              style={{
                fontSize: `${editorFontSizeRem}rem`,
                lineHeight: `${editorLineHeightRem}rem`,
              }}
            />
          </div>
          <EditorTagsBar
            editorTagChips={editorTagChips}
            previewFmTags={previewFmTags}
            activeTagSet={activeTagSet}
            tagsBarExpanded={tagsBarExpanded}
            onToggleTagsBar={toggleTagsBar}
            onToggleTemplateTag={onToggleTemplateTag}
          />
        </main>

        <div
          role="separator"
          aria-orientation="vertical"
          className="pane-resizer hidden shrink-0 self-stretch lg:flex"
          onMouseDown={handlePreviewResizeMouseDown}
        />
        <aside
          className="min-h-0 shrink-0 border-l bg-background/80 hidden flex-col overflow-hidden lg:flex"
          style={{ width: `${previewWidth}px`, minWidth: `${previewWidth}px` }}
        >
          <PreviewPaneToolbar
            title={previewTitle}
            currentPath={currentPath}
            isReadOnly={isReadOnly}
            onPrint={handlePrintPreview}
            onOpenInNewWindow={onOpenInNewWindow}
            onPresentInBrowser={onPresentInBrowser}
            onDeleteCurrentNote={onDeleteCurrentNote}
          />
          <div ref={splitPreviewScrollHostRef} className="flex min-h-0 min-w-0 flex-1 flex-col">
            <ScrollArea className="min-h-0 flex-1 overflow-hidden p-8">{previewBody}</ScrollArea>
          </div>
        </aside>
      </div>
    );
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <PreviewPaneToolbar
        title={
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="min-w-0 truncate">
              {messages.editor.previewTitle} — {currentFileName}
            </span>
            {readOnlyBadge}
            <span className="shrink-0 normal-case tabular-nums tracking-normal text-[11px] text-muted-foreground/90">
              {messages.editor.lineCount(previewBodyLineCount)}
            </span>
          </span>
        }
        currentPath={currentPath}
        isReadOnly={isReadOnly}
        showZoom
        showEdit
        onPrint={handlePrintPreview}
        onAdjustContentScale={onAdjustContentScale}
        onOpenInNewWindow={onOpenInNewWindow}
        onPresentInBrowser={onPresentInBrowser}
        onEnterEditMode={onEnterEditMode}
        onDeleteCurrentNote={onDeleteCurrentNote}
      />
      <div ref={previewOnlyScrollHostRef} className="flex min-h-0 min-w-0 flex-1 flex-col">
        <ScrollArea className="min-h-0 flex-1 overflow-hidden p-8">{previewBody}</ScrollArea>
      </div>
    </main>
  );
}
