import {
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
  type UIEvent,
  type WheelEvent,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Eye,
  ImagePlus,
  Lightbulb,
  Lock,
  Minus,
  Monitor,
  Pencil,
  Plus,
  SquareArrowOutUpRight,
  Trash2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { editorShortcutConfig, matchesShortcut } from "@/config/editorShortcuts";
import {
  buildEditorTagChips,
  getMarkdownBody,
  parseNoteContent,
} from "@/lib/noteTags";
import { isBuiltinReservedTagName } from "@/lib/reservedTags";
import { messages } from "@/lib/messages";
import { createMarkdownPreviewComponents } from "@/lib/markdownPreviewComponents";
import {
  buildImageMarkdown,
  clipboardMayContainImage,
  importImageFromDialog,
  importImagePath,
  insertTextAtSelection,
  readClipboardImageFile,
  saveImageFile,
  useTauriImageDrop,
} from "@/lib/noteImages";
import { cn } from "@/lib/utils";

const toolbarBtn =
  "rounded-md border border-border bg-background shadow-sm hover:bg-muted/80 hover:text-foreground";

const remarkPreviewPlugins = [remarkGfm, remarkBreaks];
const markdownPreviewComponents = createMarkdownPreviewComponents();

const TAGS_BAR_EXPANDED_KEY = "scriptax-editor-tags-bar-expanded";

function readTagsBarExpanded(): boolean {
  try {
    const v = localStorage.getItem(TAGS_BAR_EXPANDED_KEY);
    if (v === "0") return false;
    if (v === "1") return true;
  } catch {
    /* ignore */
  }
  return true;
}

function writeTagsBarExpanded(expanded: boolean) {
  try {
    localStorage.setItem(TAGS_BAR_EXPANDED_KEY, expanded ? "1" : "0");
  } catch {
    /* ignore */
  }
}

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
};

type CalloutKind = "info" | "warn" | "alert" | "tip";

type PreviewSegment =
  | { type: "markdown"; content: string; bodyStart: number; bodyEnd: number }
  | { type: "callout"; kind: CalloutKind; content: string; bodyStart: number; bodyEnd: number };

type ListKind = "plain" | "unordered" | "ordered" | "task";
type ShortcutUndoEntry = {
  beforeText: string;
  beforeStart: number;
  beforeEnd: number;
  afterText: string;
};

function normalizeCalloutKind(raw?: string): CalloutKind {
  const v = (raw ?? "").toLowerCase();
  if (v === "warn" || v === "alert" || v === "tip") return v;
  return "info";
}

function previewLineStarts(lines: string[]): number[] {
  const lineStarts: number[] = [];
  let acc = 0;
  for (let li = 0; li < lines.length; li += 1) {
    lineStarts[li] = acc;
    acc += lines[li].length + (li < lines.length - 1 ? 1 : 0);
  }
  return lineStarts;
}

function splitPreviewSegments(markdown: string): PreviewSegment[] {
  const lines = markdown.split("\n");
  const lineStarts = previewLineStarts(lines);
  const segments: PreviewSegment[] = [];
  const plainBuffer: string[] = [];
  let plainRange: { from: number; to: number } | null = null;

  const markPlainLine = (lineIdx: number) => {
    if (!plainRange) plainRange = { from: lineIdx, to: lineIdx };
    else plainRange.to = lineIdx;
  };

  const flushPlain = () => {
    if (plainBuffer.length === 0 || !plainRange) return;
    const bodyStart = lineStarts[plainRange.from];
    const bodyEnd = lineStarts[plainRange.to] + lines[plainRange.to].length;
    segments.push({ type: "markdown", content: plainBuffer.join("\n"), bodyStart, bodyEnd });
    plainBuffer.length = 0;
    plainRange = null;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const blockStart = line.match(/^:::\s*note(?:\s+(info|warn|alert|tip))?\s*$/i);
    if (blockStart) {
      flushPlain();
      const calloutLines: string[] = [];
      const startIdx = i;
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
        const bodyStart = lineStarts[startIdx];
        const bodyEnd = lineStarts[i] + lines[i].length;
        segments.push({
          type: "callout",
          kind: normalizeCalloutKind(blockStart[1]),
          content: calloutLines.join("\n").trim(),
          bodyStart,
          bodyEnd,
        });
      } else {
        markPlainLine(startIdx);
        plainBuffer.push(line);
        for (let k = 0; k < calloutLines.length; k += 1) {
          markPlainLine(startIdx + 1 + k);
          plainBuffer.push(calloutLines[k]);
        }
        break;
      }
      continue;
    }

    const single = line.match(/^note::(info|warn|alert|tip)\s+(.+)$/i);
    if (single) {
      flushPlain();
      const bodyStart = lineStarts[i];
      const bodyEnd = lineStarts[i] + lines[i].length;
      segments.push({
        type: "callout",
        kind: normalizeCalloutKind(single[1]),
        content: single[2],
        bodyStart,
        bodyEnd,
      });
      continue;
    }

    const multiStart = line.match(/^note::(info|warn|alert|tip)\s*$/i);
    if (!multiStart) {
      markPlainLine(i);
      plainBuffer.push(line);
      continue;
    }

    flushPlain();
    const startIdx = i;
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
      const bodyStart = lineStarts[startIdx];
      const bodyEnd = lineStarts[i] + lines[i].length;
      segments.push({
        type: "callout",
        kind: normalizeCalloutKind(multiStart[1]),
        content: calloutLines.join("\n").trim(),
        bodyStart,
        bodyEnd,
      });
    } else {
      markPlainLine(startIdx);
      plainBuffer.push(lines[startIdx]);
      for (let k = 0; k < calloutLines.length; k += 1) {
        markPlainLine(startIdx + 1 + k);
        plainBuffer.push(calloutLines[k]);
      }
      break;
    }
  }

  flushPlain();
  return segments;
}

function maxScrollTopFor(el: HTMLElement): number {
  return Math.max(0, el.scrollHeight - el.clientHeight);
}

function scrollRatioFor(el: HTMLElement): number {
  const max = maxScrollTopFor(el);
  return max <= 0 ? 0 : el.scrollTop / max;
}

/** 編集とプレビューでスクロール可能高さが違う前提で、スクロール位置を比率で写す */
function applyProportionalScrollTop(from: HTMLElement, to: HTMLElement): void {
  const fromMax = maxScrollTopFor(from);
  const ratio = fromMax <= 0 ? 0 : from.scrollTop / fromMax;
  const toMax = maxScrollTopFor(to);
  to.scrollTop = ratio * toMax;
}

/** 選択に含まれる行の先頭〜最終行末（行末の \\n は含まない）までをブロックとして取る（リスト操作と同じ境界） */
function getSelectedLineBlockBounds(
  text: string,
  selStart: number,
  selEnd: number
): { startLineStart: number; endLineEnd: number; block: string } | null {
  const lo = Math.min(selStart, selEnd);
  const hi = Math.max(selStart, selEnd);
  const startLineStart = text.lastIndexOf("\n", Math.max(0, lo - 1)) + 1;
  const effectiveEnd = hi > lo && text[hi - 1] === "\n" ? hi - 1 : hi;
  const endLineEndIndex = text.indexOf("\n", effectiveEnd);
  const endLineEnd = endLineEndIndex === -1 ? text.length : endLineEndIndex;
  if (startLineStart >= endLineEnd) return null;
  const block = text.slice(startLineStart, endLineEnd);
  return { startLineStart, endLineEnd, block };
}

/** Alt+↑/↓: 選択行ブロックと直上・直下の行（単一行）を入れ替え */
function swapLineBlockWithAdjacent(
  text: string,
  selStart: number,
  selEnd: number,
  dir: "up" | "down"
): { text: string; selectionStart: number; selectionEnd: number } | null {
  const bounds = getSelectedLineBlockBounds(text, selStart, selEnd);
  if (!bounds) return null;
  const { startLineStart, endLineEnd, block } = bounds;

  if (dir === "up") {
    if (startLineStart === 0) return null;
    const prevStart = text.lastIndexOf("\n", startLineStart - 2) + 1;
    const prevLine = text.slice(prevStart, startLineStart - 1);
    const before = text.slice(0, prevStart);
    const after = endLineEnd < text.length ? text.slice(endLineEnd + 1) : "";
    const nextText = `${before}${block}\n${prevLine}${endLineEnd < text.length ? "\n" : ""}${after}`;
    const newBlockStart = prevStart;
    return {
      text: nextText,
      selectionStart: newBlockStart,
      selectionEnd: newBlockStart + block.length,
    };
  }

  if (endLineEnd >= text.length) return null;
  const nextLineStart = endLineEnd + 1;
  let nextLineEnd = text.indexOf("\n", nextLineStart);
  if (nextLineEnd === -1) nextLineEnd = text.length;
  const nextLine = text.slice(nextLineStart, nextLineEnd);
  const before = text.slice(0, startLineStart);
  const after = nextLineEnd < text.length ? text.slice(nextLineEnd + 1) : "";
  const nextText = `${before}${nextLine}\n${block}${nextLineEnd < text.length ? "\n" : ""}${after}`;
  const newBlockStart = startLineStart + nextLine.length + 1;
  return {
    text: nextText,
    selectionStart: newBlockStart,
    selectionEnd: newBlockStart + block.length,
  };
}

function duplicateLineBlock(
  text: string,
  selStart: number,
  selEnd: number,
  dir: "above" | "below"
): { text: string; selectionStart: number; selectionEnd: number } | null {
  const bounds = getSelectedLineBlockBounds(text, selStart, selEnd);
  if (!bounds) return null;
  const { startLineStart, endLineEnd, block } = bounds;

  if (dir === "below") {
    const insertion = `\n${block}`;
    const nextText = `${text.slice(0, endLineEnd)}${insertion}${text.slice(endLineEnd)}`;
    const newBlockStart = endLineEnd + 1;
    return {
      text: nextText,
      selectionStart: newBlockStart,
      selectionEnd: newBlockStart + block.length,
    };
  }

  if (startLineStart === 0) {
    const nextText = `${block}\n${text}`;
    return {
      text: nextText,
      selectionStart: 0,
      selectionEnd: block.length,
    };
  }
  const nextText = `${text.slice(0, startLineStart)}${block}\n${text.slice(startLineStart)}`;
  const newBlockStart = startLineStart;
  return {
    text: nextText,
    selectionStart: newBlockStart,
    selectionEnd: newBlockStart + block.length,
  };
}

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
  } = props;

  const previewMarkdown = useMemo(() => getMarkdownBody(input), [input]);
  const editorLineCount = useMemo(() => Math.max(1, input.split("\n").length), [input]);
  const previewBodyLineCount = useMemo(
    () => Math.max(1, previewMarkdown.split("\n").length),
    [previewMarkdown]
  );

  const readOnlyBadge = isReadOnly ? (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/70 bg-muted/50 px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal text-muted-foreground">
      <Lock className="h-3 w-3" />
      {messages.tags.readOnlyBadge}
    </span>
  ) : null;
  const editorGutterInnerRef = useRef<HTMLDivElement>(null);
  const splitPreviewScrollHostRef = useRef<HTMLDivElement>(null);
  const previewOnlyScrollHostRef = useRef<HTMLDivElement>(null);
  const scrollSyncLockRef = useRef<"editor" | "preview" | null>(null);
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

  const [tagsBarExpanded, setTagsBarExpanded] = useState(readTagsBarExpanded);
  const shortcutUndoRef = useRef<ShortcutUndoEntry[]>([]);

  const toggleTagsBar = () => {
    setTagsBarExpanded((prev) => {
      const next = !prev;
      writeTagsBarExpanded(next);
      return next;
    });
  };

  const handlePreviewResizeMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    onStartPreviewResize(e.clientX);
  };

  const syncEditorGutterScroll = (scrollTop: number) => {
    const inner = editorGutterInnerRef.current;
    if (inner) inner.style.transform = `translateY(-${scrollTop}px)`;
  };

  const getSplitPreviewViewport = useCallback((): HTMLDivElement | null => {
    const host = splitPreviewScrollHostRef.current;
    return host?.querySelector<HTMLDivElement>('[data-slot="scroll-area-viewport"]') ?? null;
  }, []);

  const getPreviewScrollViewport = useCallback((): HTMLDivElement | null => {
    const splitHost = splitPreviewScrollHostRef.current;
    const previewHost = previewOnlyScrollHostRef.current;
    const host = splitHost ?? previewHost;
    return host?.querySelector<HTMLDivElement>('[data-slot="scroll-area-viewport"]') ?? null;
  }, []);

  useLayoutEffect(() => {
    if (!onPresentationPreviewScroll) return;

    let cancelled = false;
    let detach: (() => void) | undefined;
    let rafId = 0;

    const attach = () => {
      if (detach || cancelled) return;
      const vp = getPreviewScrollViewport();
      if (!vp) return;

      const report = () => {
        onPresentationPreviewScroll(scrollRatioFor(vp));
      };

      const onScroll = () => report();
      vp.addEventListener("scroll", onScroll, { passive: true });
      report();
      detach = () => vp.removeEventListener("scroll", onScroll);
    };

    attach();
    if (!detach) {
      rafId = requestAnimationFrame(() => {
        if (!cancelled) attach();
      });
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      detach?.();
    };
  }, [onPresentationPreviewScroll, isEditMode, previewWidth, contentScale, getPreviewScrollViewport]);

  const handleEditorScroll = (e: UIEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    syncEditorGutterScroll(ta.scrollTop);
    if (scrollSyncLockRef.current === "preview") return;
    const vp = getSplitPreviewViewport();
    if (!vp) return;
    scrollSyncLockRef.current = "editor";
    applyProportionalScrollTop(ta, vp);
    queueMicrotask(() => {
      scrollSyncLockRef.current = null;
    });
  };

  useLayoutEffect(() => {
    const ta = editorRef.current;
    if (ta) syncEditorGutterScroll(ta.scrollTop);
  }, [input, contentScale]);

  useLayoutEffect(() => {
    if (!isEditMode) return;
    let cancelled = false;
    let detach: (() => void) | undefined;
    let rafId = 0;
    const attach = () => {
      if (detach || cancelled) return;
      const vp = getSplitPreviewViewport();
      if (!vp) return;
      const onPreviewScroll = () => {
        if (scrollSyncLockRef.current === "editor") return;
        const ta = editorRef.current;
        if (!ta) return;
        scrollSyncLockRef.current = "preview";
        applyProportionalScrollTop(vp, ta);
        syncEditorGutterScroll(ta.scrollTop);
        queueMicrotask(() => {
          scrollSyncLockRef.current = null;
        });
      };
      vp.addEventListener("scroll", onPreviewScroll, { passive: true });
      detach = () => vp.removeEventListener("scroll", onPreviewScroll);
    };
    attach();
    if (!detach) {
      rafId = requestAnimationFrame(() => {
        if (!cancelled) attach();
      });
    }
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      detach?.();
    };
  }, [isEditMode, getSplitPreviewViewport, previewWidth, contentScale]);

  const handleScaleShortcut = (
    e: KeyboardEvent<HTMLElement>,
    onAdjust: (delta: number) => void,
    onReset: () => void
  ) => {
    if (
      matchesShortcut(e, editorShortcutConfig.zoomIn) ||
      matchesShortcut(e, editorShortcutConfig.zoomInAlt)
    ) {
      e.preventDefault();
      onAdjust(0.1);
      return;
    }
    if (
      matchesShortcut(e, editorShortcutConfig.zoomOut) ||
      matchesShortcut(e, editorShortcutConfig.zoomOutAlt)
    ) {
      e.preventDefault();
      onAdjust(-0.1);
      return;
    }
    if (matchesShortcut(e, editorShortcutConfig.zoomReset)) {
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

  const applyEditorTextAndCursor = (
    textarea: HTMLTextAreaElement,
    nextText: string,
    nextCursor: number
  ) => {
    applyEditorTextAndSelection(textarea, nextText, nextCursor, nextCursor);
  };

  const applyEditorTextAndSelection = (
    textarea: HTMLTextAreaElement,
    nextText: string,
    selectionStart: number,
    selectionEnd: number
  ) => {
    const beforeText = textarea.value;
    const beforeStart = textarea.selectionStart;
    const beforeEnd = textarea.selectionEnd;
    if (beforeText === nextText && beforeStart === selectionStart && beforeEnd === selectionEnd) return;
    shortcutUndoRef.current.push({
      beforeText,
      beforeStart,
      beforeEnd,
      afterText: nextText,
    });
    if (shortcutUndoRef.current.length > 200) {
      shortcutUndoRef.current.shift();
    }
    onChangeInput(nextText);
    requestAnimationFrame(() => {
      const ta = editorRef.current ?? textarea;
      ta.focus();
      ta.setSelectionRange(selectionStart, selectionEnd);
    });
  };

  const insertImageMarkdownAtCursor = (
    textarea: HTMLTextAreaElement,
    relativePath: string
  ) => {
    const markdown = buildImageMarkdown(relativePath);
    const { nextText, nextCursor } = insertTextAtSelection(
      textarea.value,
      textarea.selectionStart,
      textarea.selectionEnd,
      markdown
    );
    applyEditorTextAndCursor(textarea, nextText, nextCursor);
  };

  const handleInsertImageFromFile = async (
    file: File,
    textarea: HTMLTextAreaElement | null
  ) => {
    try {
      const relativePath = await saveImageFile(file);
      const ta = textarea ?? editorRef.current;
      if (!ta) return;
      insertImageMarkdownAtCursor(ta, relativePath);
    } catch {
      window.alert(messages.editor.imageInsertFailed);
    }
  };

  const handleInsertImageClick = async () => {
    const textarea = editorRef.current;
    if (!textarea || isReadOnly) return;
    try {
      const relativePath = await importImageFromDialog();
      if (!relativePath) return;
      insertImageMarkdownAtCursor(textarea, relativePath);
    } catch {
      window.alert(messages.editor.imageInsertFailed);
    }
  };

  const handleTauriImageDrop = useCallback(
    async (paths: string[]) => {
      const textarea = editorRef.current;
      if (!textarea || isReadOnly) return;
      for (const path of paths) {
        try {
          const relativePath = await importImagePath(path);
          insertImageMarkdownAtCursor(textarea, relativePath);
        } catch {
          window.alert(messages.editor.imageInsertFailed);
          break;
        }
      }
    },
    [isReadOnly]
  );

  useTauriImageDrop(isEditMode && !isReadOnly, handleTauriImageDrop);

  const handleEditorPaste = async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (isReadOnly) return;
    if (!clipboardMayContainImage(e.clipboardData)) return;
    e.preventDefault();
    const textarea = e.currentTarget;
    const file = await readClipboardImageFile(e.clipboardData);
    if (!file) {
      window.alert(messages.editor.imageInsertFailed);
      return;
    }
    await handleInsertImageFromFile(file, textarea);
  };

  const handleEditorDragOver = (e: DragEvent<HTMLTextAreaElement>) => {
    if (isReadOnly) return;
    const types = e.dataTransfer.types;
    if (types.includes("Files") || types.includes("application/x-moz-file")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  };

  const handleEditorDrop = async (e: DragEvent<HTMLTextAreaElement>) => {
    if (isReadOnly) return;
    e.preventDefault();
    const textarea = e.currentTarget;
    const files = e.dataTransfer.files;
    if (!files?.length) return;
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      if (!file.type.startsWith("image/") && !/\.(png|jpe?g|gif|webp|svg)$/i.test(file.name)) {
        continue;
      }
      await handleInsertImageFromFile(file, textarea);
    }
  };

  const handleBoldShortcut = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget;
    const text = textarea.value;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    if (start === end) {
      const leftOpen = text.lastIndexOf("**", Math.max(0, start - 1));
      const leftClose = text.indexOf("**", start);
      const inWrappedBold = leftOpen >= 0 && leftClose >= 0 && leftOpen < start && start <= leftClose;
      if (inWrappedBold) {
        const inner = text.slice(leftOpen + 2, leftClose);
        const nextText = `${text.slice(0, leftOpen)}${inner}${text.slice(leftClose + 2)}`;
        const nextCursor = Math.max(leftOpen, start - 2);
        applyEditorTextAndSelection(textarea, nextText, nextCursor, nextCursor);
        return;
      }
      const nextText = `${text.slice(0, start)}****${text.slice(end)}`;
      applyEditorTextAndSelection(textarea, nextText, start + 2, start + 2);
      return;
    }

    const selected = text.slice(start, end);
    const wrapped = selected.startsWith("**") && selected.endsWith("**") && selected.length >= 4;
    if (wrapped) {
      const unwrapped = selected.slice(2, -2);
      const nextText = `${text.slice(0, start)}${unwrapped}${text.slice(end)}`;
      applyEditorTextAndSelection(textarea, nextText, start, start + unwrapped.length);
      return;
    }

    const nextText = `${text.slice(0, start)}**${selected}**${text.slice(end)}`;
    applyEditorTextAndSelection(textarea, nextText, start + 2, end + 2);
  };

  const handleHeadingShortcut = (e: KeyboardEvent<HTMLTextAreaElement>, level: number) => {
    const textarea = e.currentTarget;
    const text = textarea.value;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    const startLineStart = text.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    const effectiveEnd = end > start && text[end - 1] === "\n" ? end - 1 : end;
    const endLineEndIndex = text.indexOf("\n", effectiveEnd);
    const endLineEnd = endLineEndIndex === -1 ? text.length : endLineEndIndex;
    const block = text.slice(startLineStart, endLineEnd);
    const lines = block.split("\n");

    const targetPrefix = `${"#".repeat(level)} `;
    const transformed = lines.map((line) => {
      if (line.trim().length === 0) return line;
      const indent = line.match(/^(\s*)/)?.[1] ?? "";
      const core = line.slice(indent.length);
      const headingMatch = core.match(/^(#{1,6})\s+(.*)$/);
      if (headingMatch) {
        const currentLevel = headingMatch[1].length;
        const rest = headingMatch[2];
        return currentLevel === level ? `${indent}${rest}` : `${indent}${targetPrefix}${rest}`;
      }
      return `${indent}${targetPrefix}${core}`;
    });

    const nextBlock = transformed.join("\n");
    const nextText = `${text.slice(0, startLineStart)}${nextBlock}${text.slice(endLineEnd)}`;
    applyEditorTextAndSelection(textarea, nextText, startLineStart, startLineStart + nextBlock.length);
  };

  const stripInlineMarkdown = (line: string): string => {
    let out = line;
    // links / images
    out = out.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1");
    out = out.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
    // inline code / emphasis / strike
    out = out.replace(/`([^`]+)`/g, "$1");
    out = out.replace(/\*\*([^*]+)\*\*/g, "$1");
    out = out.replace(/__([^_]+)__/g, "$1");
    out = out.replace(/~~([^~]+)~~/g, "$1");
    out = out.replace(/\*([^*]+)\*/g, "$1");
    out = out.replace(/_([^_]+)_/g, "$1");
    return out;
  };

  const handleClearMarkdownShortcut = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget;
    const text = textarea.value;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    if (start === end) return;

    const startLineStart = text.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    const effectiveEnd = end > start && text[end - 1] === "\n" ? end - 1 : end;
    const endLineEndIndex = text.indexOf("\n", effectiveEnd);
    const endLineEnd = endLineEndIndex === -1 ? text.length : endLineEndIndex;
    const block = text.slice(startLineStart, endLineEnd);
    const lines = block.split("\n");

    const transformed = lines.map((line) => {
      if (line.trim().length === 0) return line;
      const noPrefix = line
        .replace(/^(\s*)>\s?/, "$1")
        .replace(/^(\s*)#{1,6}\s+/, "$1")
        .replace(/^(\s*)[-+*]\s+\[[ xX]\]\s+/, "$1")
        .replace(/^(\s*)[-+*]\s+/, "$1")
        .replace(/^(\s*)\d+[.)]\s+/, "$1");
      return stripInlineMarkdown(noPrefix);
    });

    const nextBlock = transformed.join("\n");
    const nextText = `${text.slice(0, startLineStart)}${nextBlock}${text.slice(endLineEnd)}`;
    applyEditorTextAndSelection(textarea, nextText, startLineStart, startLineStart + nextBlock.length);
  };

  const handleSelectNextOccurrence = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget;
    const text = textarea.value;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    if (start === end) return;
    const needle = text.slice(start, end);
    if (!needle) return;

    let nextStart = text.indexOf(needle, end);
    if (nextStart < 0) nextStart = text.indexOf(needle, 0);
    if (nextStart < 0 || nextStart === start) return;

    e.preventDefault();
    textarea.focus();
    textarea.setSelectionRange(nextStart, nextStart + needle.length);
  };

  const handleListShortcut = (
    e: KeyboardEvent<HTMLTextAreaElement>,
    kind: ListKind
  ) => {
    const textarea = e.currentTarget;
    const text = textarea.value;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    const startLineStart = text.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    const effectiveEnd = end > start && text[end - 1] === "\n" ? end - 1 : end;
    const endLineEndIndex = text.indexOf("\n", effectiveEnd);
    const endLineEnd = endLineEndIndex === -1 ? text.length : endLineEndIndex;
    const block = text.slice(startLineStart, endLineEnd);
    const lines = block.split("\n");

    let orderCounter = 1;
    const transformed = lines.map((line) => {
      if (line.trim().length === 0) return line;

      const taskMatch = line.match(/^(\s*)[-+*]\s+\[([ xX])\]\s+(.*)$/);
      const unorderedMatch = line.match(/^(\s*)[-+*]\s+(.*)$/);
      const orderedMatch = line.match(/^(\s*)\d+[.)]\s+(.*)$/);

      if (kind === "plain") {
        if (taskMatch) return `${taskMatch[1]}${taskMatch[3]}`;
        if (unorderedMatch) return `${unorderedMatch[1]}${unorderedMatch[2]}`;
        if (orderedMatch) return `${orderedMatch[1]}${orderedMatch[2]}`;
        return line;
      }

      if (kind === "unordered") {
        if (taskMatch) return `${taskMatch[1]}- ${taskMatch[3]}`;
        if (unorderedMatch) return `${unorderedMatch[1]}- ${unorderedMatch[2]}`;
        if (orderedMatch) return `${orderedMatch[1]}- ${orderedMatch[2]}`;
        const indent = line.match(/^(\s*)/)?.[1] ?? "";
        const content = line.slice(indent.length);
        return `${indent}- ${content}`;
      }

      if (kind === "ordered") {
        const indent = orderedMatch?.[1] ?? unorderedMatch?.[1] ?? taskMatch?.[1] ?? line.match(/^(\s*)/)?.[1] ?? "";
        const raw = orderedMatch?.[2] ?? taskMatch?.[3] ?? unorderedMatch?.[2] ?? line.slice(indent.length);
        const next = `${indent}${orderCounter}. ${raw}`;
        orderCounter += 1;
        return next;
      }

      if (taskMatch) return `${taskMatch[1]}- [${taskMatch[2].toLowerCase() === "x" ? "x" : " "}] ${taskMatch[3]}`;
      if (unorderedMatch) return `${unorderedMatch[1]}- [ ] ${unorderedMatch[2]}`;
      if (orderedMatch) return `${orderedMatch[1]}- [ ] ${orderedMatch[2]}`;
      const indent = line.match(/^(\s*)/)?.[1] ?? "";
      const content = line.slice(indent.length);
      return `${indent}- [ ] ${content}`;
    });

    const nextBlock = transformed.join("\n");
    const nextText = `${text.slice(0, startLineStart)}${nextBlock}${text.slice(endLineEnd)}`;
    const nextSelectionStart = startLineStart;
    const nextSelectionEnd = startLineStart + nextBlock.length;
    applyEditorTextAndSelection(textarea, nextText, nextSelectionStart, nextSelectionEnd);
  };

  const detectListKind = (block: string): ListKind | null => {
    const lines = block.split("\n").filter((line) => line.trim().length > 0);
    if (lines.length === 0) return null;

    const isTask = lines.every((line) => /^(\s*)[-+*]\s+\[[ xX]\]\s+/.test(line));
    if (isTask) return "task";

    const isOrdered = lines.every((line) => /^(\s*)\d+[.)]\s+/.test(line));
    if (isOrdered) return "ordered";

    const isUnordered = lines.every((line) => /^(\s*)[-+*]\s+/.test(line));
    if (isUnordered) return "unordered";

    const isPlain = lines.every((line) => {
      const t = line.trim();
      if (t.length === 0) return true;
      return !/^[-+*]\s+/.test(t) && !/^\d+[.)]\s+/.test(t);
    });
    if (isPlain) return "plain";

    return null;
  };

  const handleEditorKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    handleScaleShortcut(e, onAdjustContentScale, onResetContentScale);
    if (e.defaultPrevented) return;

    if (
      !e.nativeEvent.isComposing &&
      (e.ctrlKey || e.metaKey) &&
      !e.shiftKey &&
      !e.altKey &&
      e.key.toLowerCase() === "z"
    ) {
      const last = shortcutUndoRef.current[shortcutUndoRef.current.length - 1];
      if (last && e.currentTarget.value === last.afterText) {
        e.preventDefault();
        shortcutUndoRef.current.pop();
        onChangeInput(last.beforeText);
        requestAnimationFrame(() => {
          const ta = editorRef.current ?? e.currentTarget;
          ta.focus();
          ta.setSelectionRange(last.beforeStart, last.beforeEnd);
        });
        return;
      }
    }

    if (!e.nativeEvent.isComposing && matchesShortcut(e, editorShortcutConfig.boldToggle)) {
      e.preventDefault();
      handleBoldShortcut(e);
      return;
    }

    if (!e.nativeEvent.isComposing && matchesShortcut(e, editorShortcutConfig.clearMarkdown)) {
      e.preventDefault();
      handleClearMarkdownShortcut(e);
      return;
    }

    if (!e.nativeEvent.isComposing && matchesShortcut(e, editorShortcutConfig.selectNextOccurrence)) {
      handleSelectNextOccurrence(e);
      return;
    }

    if (!e.nativeEvent.isComposing && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
      const headingIndex = editorShortcutConfig.headingShortcutKeys.indexOf(e.key as (typeof editorShortcutConfig.headingShortcutKeys)[number]);
      if (headingIndex >= 0) {
        e.preventDefault();
        handleHeadingShortcut(e, headingIndex + 1);
        return;
      }
    }

    if (!e.nativeEvent.isComposing && matchesShortcut(e, editorShortcutConfig.listCycle)) {
      e.preventDefault();

      const textarea = e.currentTarget;
      const text = textarea.value;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const startLineStart = text.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
      const effectiveEnd = end > start && text[end - 1] === "\n" ? end - 1 : end;
      const endLineEndIndex = text.indexOf("\n", effectiveEnd);
      const endLineEnd = endLineEndIndex === -1 ? text.length : endLineEndIndex;
      const block = text.slice(startLineStart, endLineEnd);

      const currentKind = detectListKind(block);
      const cycle = editorShortcutConfig.listCycleOrder;
      const currentIndex = currentKind == null ? -1 : cycle.indexOf(currentKind);
      const nextKind = cycle[(currentIndex + 1) % cycle.length];
      handleListShortcut(e, nextKind);
      return;
    }

    if (
      !e.nativeEvent.isComposing &&
      e.altKey &&
      e.shiftKey &&
      !e.ctrlKey &&
      !e.metaKey &&
      (e.key === "ArrowUp" || e.key === "ArrowDown")
    ) {
      e.preventDefault();
      const ta = e.currentTarget;
      const dir = e.key === "ArrowDown" ? "below" : "above";
      const res = duplicateLineBlock(ta.value, ta.selectionStart, ta.selectionEnd, dir);
      if (res) applyEditorTextAndSelection(ta, res.text, res.selectionStart, res.selectionEnd);
      return;
    }

    if (
      !e.nativeEvent.isComposing &&
      e.altKey &&
      !e.shiftKey &&
      !e.ctrlKey &&
      !e.metaKey &&
      (e.key === "ArrowUp" || e.key === "ArrowDown")
    ) {
      e.preventDefault();
      const ta = e.currentTarget;
      const res = swapLineBlockWithAdjacent(
        ta.value,
        ta.selectionStart,
        ta.selectionEnd,
        e.key === "ArrowUp" ? "up" : "down"
      );
      if (res) applyEditorTextAndSelection(ta, res.text, res.selectionStart, res.selectionEnd);
      return;
    }

    const textarea = e.currentTarget;
    const text = textarea.value;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    if (start !== end) return;

    const lineStart = text.lastIndexOf("\n", start - 1) + 1;
    const lineEnd = text.indexOf("\n", start) === -1 ? text.length : text.indexOf("\n", start);
    const line = text.slice(lineStart, lineEnd);

    if (
      e.key === editorShortcutConfig.listIndentKey &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.nativeEvent.isComposing
    ) {
      const listPrefix = line.match(/^(\s*)(?:[-+*]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)/);
      if (!listPrefix) return;

      e.preventDefault();
      const currentIndent = listPrefix[1];
      const shouldOutdent =
        (editorShortcutConfig.outdentWithAltTab && e.altKey) ||
        (editorShortcutConfig.outdentWithShiftTab && e.shiftKey);

      if (shouldOutdent) {
        if (currentIndent.length === 0) return;
        const removeCount = currentIndent.startsWith("\t") ? 1 : Math.min(2, currentIndent.length);
        const nextLine = `${line.slice(removeCount)}`;
        const nextText = `${text.slice(0, lineStart)}${nextLine}${text.slice(lineEnd)}`;
        const nextCursor = Math.max(lineStart, start - removeCount);
        applyEditorTextAndCursor(textarea, nextText, nextCursor);
        return;
      }

      const nextLine = `  ${line}`;
      const nextText = `${text.slice(0, lineStart)}${nextLine}${text.slice(lineEnd)}`;
      const nextCursor = start + 2;
      applyEditorTextAndCursor(textarea, nextText, nextCursor);
      return;
    }

    if (e.key !== "Enter" || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey || e.nativeEvent.isComposing) return;
    if (start !== lineEnd) return;

    const unordered = line.match(/^(\s*)([-+*])\s+(\[[ xX]\]\s+)?(.*)$/);
    if (unordered) {
      e.preventDefault();
      const indent = unordered[1];
      const bullet = unordered[2];
      const hasTask = Boolean(unordered[3]);
      const content = unordered[4].trim();

      if (content.length === 0) {
        const nextText = `${text.slice(0, lineStart)}${indent}${text.slice(lineEnd)}`;
        const nextCursor = lineStart + indent.length;
        applyEditorTextAndCursor(textarea, nextText, nextCursor);
        return;
      }

      const taskPrefix = hasTask ? "[ ] " : "";
      const prefix = `\n${indent}${bullet} ${taskPrefix}`;
      const nextText = `${text.slice(0, start)}${prefix}${text.slice(end)}`;
      const nextCursor = start + prefix.length;
      applyEditorTextAndCursor(textarea, nextText, nextCursor);
      return;
    }

    const ordered = line.match(/^(\s*)(\d+)([.)])\s+(.*)$/);
    if (ordered) {
      e.preventDefault();
      const indent = ordered[1];
      const num = Number(ordered[2]);
      const sep = ordered[3];
      const content = ordered[4].trim();

      if (content.length === 0) {
        const nextText = `${text.slice(0, lineStart)}${indent}${text.slice(lineEnd)}`;
        const nextCursor = lineStart + indent.length;
        applyEditorTextAndCursor(textarea, nextText, nextCursor);
        return;
      }

      const prefix = `\n${indent}${num + 1}${sep} `;
      const nextText = `${text.slice(0, start)}${prefix}${text.slice(end)}`;
      const nextCursor = start + prefix.length;
      applyEditorTextAndCursor(textarea, nextText, nextCursor);
    }
  };

  const renderMarkdownSegment = (
    segment: Extract<PreviewSegment, { type: "markdown" }>,
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

  if (isEditMode) {
    return (
      <div className="flex h-full min-h-0 min-w-0 flex-1">
        <main className="min-h-0 min-w-0 flex-1 flex flex-col bg-background">
          <div className="h-12 shrink-0 border-b flex items-center justify-between px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider bg-background/80">
            <span className="min-w-0 truncate">
              {messages.editor.editorTitle} — {currentFileName}
            </span>
            <div className="flex items-center gap-1">
              {!isReadOnly && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  className={toolbarBtn}
                  title={messages.editor.insertImage}
                  aria-label={messages.editor.insertImage}
                  onClick={() => void handleInsertImageClick()}
                >
                  <ImagePlus className="h-4 w-4" />
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className={toolbarBtn}
                title={messages.editor.zoomOut}
                aria-label={messages.editor.zoomOut}
                onClick={() => onAdjustContentScale(-0.1)}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className={toolbarBtn}
                title={messages.editor.zoomIn}
                aria-label={messages.editor.zoomIn}
                onClick={() => onAdjustContentScale(0.1)}
              >
                <Plus className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className={toolbarBtn}
                title={messages.editor.previewOnly}
                aria-label={messages.editor.previewOnly}
                onClick={onEnterPreviewMode}
              >
                <Eye className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex min-h-0 min-w-0 flex-1">
            <div
              className="relative shrink-0 overflow-hidden border-r border-border/15 bg-muted/5 pt-12 pb-12 pl-1.5 pr-1.5 select-none dark:bg-muted/10"
              style={{ minWidth: `${Math.max(1.75, String(editorLineCount).length * 0.65 + 0.65)}ch` }}
              aria-hidden
            >
              <div ref={editorGutterInnerRef} className="pointer-events-none font-mono tabular-nums">
                {Array.from({ length: editorLineCount }, (_, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-end text-muted-foreground/30"
                    style={{
                      height: `${editorLineHeightRem}rem`,
                      fontSize: `${Math.min(0.6875, editorFontSizeRem * 0.58)}rem`,
                    }}
                  >
                    {i + 1}
                  </div>
                ))}
              </div>
            </div>
            <textarea
              ref={editorRef}
              className="min-h-0 min-w-0 flex-1 resize-none overflow-y-auto bg-transparent px-12 py-12 font-mono focus:outline-none"
              placeholder={messages.editor.placeholder}
              value={input}
              onChange={(e) => {
                shortcutUndoRef.current = [];
                onChangeInput(e.target.value);
              }}
              onKeyDown={handleEditorKeyDown}
              onPaste={(e) => void handleEditorPaste(e)}
              onDragOver={handleEditorDragOver}
              onDrop={(e) => void handleEditorDrop(e)}
              onScroll={handleEditorScroll}
              onWheel={(e) => handleScaleWheel(e, onAdjustContentScale)}
              style={{
                fontSize: `${editorFontSizeRem}rem`,
                lineHeight: `${editorLineHeightRem}rem`,
              }}
            />
          </div>
          {editorTagChips.length > 0 && (
            <div className="shrink-0 border-t bg-background/80">
              <button
                type="button"
                id="editor-tags-bar-toggle"
                className="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-muted/50"
                aria-expanded={tagsBarExpanded}
                aria-controls="editor-tags-bar-panel"
                onClick={toggleTagsBar}
              >
                {tagsBarExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                )}
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground shrink-0">
                  {messages.editor.tagsBar}
                </span>
                {!tagsBarExpanded && (
                  <span className="min-w-0 truncate text-xs text-muted-foreground" title={previewFmTags.join(", ") || undefined}>
                    {previewFmTags.length > 0 ? previewFmTags.join(", ") : messages.editor.tagsNone}
                  </span>
                )}
              </button>
              {tagsBarExpanded && (
                <div
                  id="editor-tags-bar-panel"
                  className="flex flex-wrap items-center gap-2 border-t border-border/50 px-4 pb-2 pt-1"
                  role="group"
                  aria-labelledby="editor-tags-bar-toggle"
                >
                  {editorTagChips.map((tag) => {
                    const on = activeTagSet.has(tag.toLowerCase());
                    return (
                      <Button
                        key={tag}
                        type="button"
                        variant={on ? "default" : "outline"}
                        size="xs"
                        className={cn(
                          "rounded-full whitespace-nowrap font-medium",
                          on ? "shadow-sm" : "border-dashed text-muted-foreground hover:text-foreground"
                        )}
                        title={
                          on
                            ? `${messages.tags.detach(tag)}（${messages.tags.detachHint}）`
                            : `${messages.tags.attach(tag)}（${messages.tags.attachHint}）`
                        }
                        onClick={() => onToggleTemplateTag(tag)}
                      >
                        {tag}
                      </Button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
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
          <div className="h-12 shrink-0 border-b flex items-center justify-between gap-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="min-w-0 truncate">{messages.editor.previewTitle}</span>
              {readOnlyBadge}
              <span className="shrink-0 normal-case tabular-nums tracking-normal text-[11px] text-muted-foreground/90">
                {messages.editor.lineCount(previewBodyLineCount)}
              </span>
            </span>
            <div className="flex items-center gap-1">
              {onOpenInNewWindow && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  className={toolbarBtn}
                  title={messages.editor.openInNewWindow}
                  aria-label={messages.editor.openInNewWindow}
                  onClick={onOpenInNewWindow}
                >
                  <SquareArrowOutUpRight className="h-4 w-4" />
                </Button>
              )}
              {onPresentInBrowser && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  className={toolbarBtn}
                  title={messages.editor.presentInBrowser}
                  aria-label={messages.editor.presentInBrowser}
                  onClick={onPresentInBrowser}
                >
                  <Monitor className="h-4 w-4" />
                </Button>
              )}
              {!isReadOnly && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  className={cn(
                    toolbarBtn,
                    "text-destructive hover:bg-destructive/10 hover:text-destructive"
                  )}
                  title={
                    currentPath ? messages.editor.deleteNote : messages.editor.deleteNoteDisabled
                  }
                  aria-label={messages.editor.deleteNote}
                  disabled={!currentPath}
                  onClick={() => onDeleteCurrentNote()}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
          <div ref={splitPreviewScrollHostRef} className="flex min-h-0 min-w-0 flex-1 flex-col">
            <ScrollArea className="min-h-0 flex-1 overflow-hidden p-8">
              {renderPreviewTagsBar()}
              <div
                className="markdown-preview prose prose-slate dark:prose-invert prose-headings:font-heading max-w-none"
                style={{ fontSize: `${contentScale}rem` }}
                tabIndex={0}
                onKeyDown={(e) => handleScaleShortcut(e, onAdjustContentScale, onResetContentScale)}
                onWheel={(e) => handleScaleWheel(e, onAdjustContentScale)}
              >
                {renderPreviewLines()}
              </div>
            </ScrollArea>
          </div>
        </aside>
      </div>
    );
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="h-12 shrink-0 border-b flex items-center justify-between gap-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider bg-background/80">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="min-w-0 truncate">
            {messages.editor.previewTitle} — {currentFileName}
          </span>
          {readOnlyBadge}
          <span className="shrink-0 normal-case tabular-nums tracking-normal text-[11px] text-muted-foreground/90">
            {messages.editor.lineCount(previewBodyLineCount)}
          </span>
        </span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className={toolbarBtn}
            title={messages.editor.zoomOut}
            aria-label={messages.editor.zoomOut}
            onClick={() => onAdjustContentScale(-0.1)}
          >
            <Minus className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className={toolbarBtn}
            title={messages.editor.zoomIn}
            aria-label={messages.editor.zoomIn}
            onClick={() => onAdjustContentScale(0.1)}
          >
            <Plus className="h-4 w-4" />
          </Button>
          {onOpenInNewWindow && (
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className={toolbarBtn}
              title={messages.editor.openInNewWindow}
              aria-label={messages.editor.openInNewWindow}
              onClick={onOpenInNewWindow}
            >
              <SquareArrowOutUpRight className="h-4 w-4" />
            </Button>
          )}
          {onPresentInBrowser && (
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className={toolbarBtn}
              title={messages.editor.presentInBrowser}
              aria-label={messages.editor.presentInBrowser}
              onClick={onPresentInBrowser}
            >
              <Monitor className="h-4 w-4" />
            </Button>
          )}
          {!isReadOnly && (
            <>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className={toolbarBtn}
                title={messages.editor.editMode}
                aria-label={messages.editor.editMode}
                onClick={onEnterEditMode}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className={cn(
                  toolbarBtn,
                  "text-destructive hover:bg-destructive/10 hover:text-destructive"
                )}
                title={
                  currentPath ? messages.editor.deleteNote : messages.editor.deleteNoteDisabled
                }
                aria-label={messages.editor.deleteNote}
                disabled={!currentPath}
                onClick={() => onDeleteCurrentNote()}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>
      <div ref={previewOnlyScrollHostRef} className="flex min-h-0 min-w-0 flex-1 flex-col">
        <ScrollArea className="min-h-0 flex-1 overflow-hidden p-8">
          {renderPreviewTagsBar()}
          <div
            className="markdown-preview prose prose-slate dark:prose-invert prose-headings:font-heading max-w-none"
            style={{ fontSize: `${contentScale}rem` }}
            tabIndex={0}
            onKeyDown={(e) => handleScaleShortcut(e, onAdjustContentScale, onResetContentScale)}
            onWheel={(e) => handleScaleWheel(e, onAdjustContentScale)}
          >
            {renderPreviewLines()}
          </div>
        </ScrollArea>
      </div>
    </main>
  );
}
