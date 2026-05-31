import {
  type KeyboardEvent,
  type RefObject,
  type WheelEvent,
  useCallback,
  useRef,
} from "react";
import { editorShortcutConfig, matchesShortcut } from "@/config/editorShortcuts";
import {
  applyBoldToggle,
  applyClearMarkdown,
  applyEnterListContinuation,
  applyHeading,
  applyInsertTable,
  applyListIndent,
  applyListTransform,
  detectListKind,
  findNextOccurrence,
} from "@/lib/editorMarkdownShortcuts";
import { duplicateLineBlock, swapLineBlockWithAdjacent } from "@/lib/editorLineOperations";

type ShortcutUndoEntry = {
  beforeText: string;
  beforeStart: number;
  beforeEnd: number;
  afterText: string;
};

type UseEditorMarkdownShortcutsOptions = {
  editorRef: RefObject<HTMLTextAreaElement | null>;
  onChangeInput: (value: string) => void;
  onAdjustContentScale: (delta: number) => void;
  onResetContentScale: () => void;
};

export function useEditorMarkdownShortcuts(options: UseEditorMarkdownShortcutsOptions) {
  const { editorRef, onChangeInput, onAdjustContentScale, onResetContentScale } = options;
  const shortcutUndoRef = useRef<ShortcutUndoEntry[]>([]);

  const clearShortcutUndo = useCallback(() => {
    shortcutUndoRef.current = [];
  }, []);

  const applyEditorTextAndSelection = useCallback(
    (
      textarea: HTMLTextAreaElement,
      nextText: string,
      selectionStart: number,
      selectionEnd: number
    ) => {
      const beforeText = textarea.value;
      const beforeStart = textarea.selectionStart;
      const beforeEnd = textarea.selectionEnd;
      if (
        beforeText === nextText &&
        beforeStart === selectionStart &&
        beforeEnd === selectionEnd
      ) {
        return;
      }
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
    },
    [editorRef, onChangeInput]
  );

  const applyEditorTextAndCursor = useCallback(
    (textarea: HTMLTextAreaElement, nextText: string, nextCursor: number) => {
      applyEditorTextAndSelection(textarea, nextText, nextCursor, nextCursor);
    },
    [applyEditorTextAndSelection]
  );

  const handleScaleShortcut = useCallback(
    (
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
    },
    []
  );

  const handleEditorKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
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

      const textarea = e.currentTarget;
      const text = textarea.value;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      if (!e.nativeEvent.isComposing && matchesShortcut(e, editorShortcutConfig.boldToggle)) {
        e.preventDefault();
        const res = applyBoldToggle(text, start, end);
        applyEditorTextAndSelection(textarea, res.text, res.selectionStart, res.selectionEnd);
        return;
      }

      if (!e.nativeEvent.isComposing && matchesShortcut(e, editorShortcutConfig.clearMarkdown)) {
        e.preventDefault();
        const res = applyClearMarkdown(text, start, end);
        if (res) applyEditorTextAndSelection(textarea, res.text, res.selectionStart, res.selectionEnd);
        return;
      }

      if (
        !e.nativeEvent.isComposing &&
        matchesShortcut(e, editorShortcutConfig.selectNextOccurrence)
      ) {
        const next = findNextOccurrence(text, start, end);
        if (next) {
          e.preventDefault();
          textarea.focus();
          textarea.setSelectionRange(next.selectionStart, next.selectionEnd);
        }
        return;
      }

      if (!e.nativeEvent.isComposing && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        const headingIndex = editorShortcutConfig.headingShortcutKeys.indexOf(
          e.key as (typeof editorShortcutConfig.headingShortcutKeys)[number]
        );
        if (headingIndex >= 0) {
          e.preventDefault();
          const res = applyHeading(text, start, end, headingIndex + 1);
          applyEditorTextAndSelection(textarea, res.text, res.selectionStart, res.selectionEnd);
          return;
        }
      }

      if (!e.nativeEvent.isComposing && matchesShortcut(e, editorShortcutConfig.listCycle)) {
        e.preventDefault();
        const startLineStart = text.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
        const effectiveEnd = end > start && text[end - 1] === "\n" ? end - 1 : end;
        const endLineEndIndex = text.indexOf("\n", effectiveEnd);
        const endLineEnd = endLineEndIndex === -1 ? text.length : endLineEndIndex;
        const block = text.slice(startLineStart, endLineEnd);

        const currentKind = detectListKind(block);
        const cycle = editorShortcutConfig.listCycleOrder;
        const currentIndex = currentKind == null ? -1 : cycle.indexOf(currentKind);
        const nextKind = cycle[(currentIndex + 1) % cycle.length];
        const res = applyListTransform(text, start, end, nextKind);
        applyEditorTextAndSelection(textarea, res.text, res.selectionStart, res.selectionEnd);
        return;
      }

      if (!e.nativeEvent.isComposing && matchesShortcut(e, editorShortcutConfig.insertTable)) {
        e.preventDefault();
        const res = applyInsertTable(text, start, end);
        applyEditorTextAndSelection(textarea, res.text, res.selectionStart, res.selectionEnd);
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
        const dir = e.key === "ArrowDown" ? "below" : "above";
        const res = duplicateLineBlock(text, start, end, dir);
        if (res) applyEditorTextAndSelection(textarea, res.text, res.selectionStart, res.selectionEnd);
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
        const res = swapLineBlockWithAdjacent(
          text,
          start,
          end,
          e.key === "ArrowUp" ? "up" : "down"
        );
        if (res) applyEditorTextAndSelection(textarea, res.text, res.selectionStart, res.selectionEnd);
        return;
      }

      if (
        e.key === editorShortcutConfig.listIndentKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.nativeEvent.isComposing
      ) {
        const res = applyListIndent(text, start, end, e.altKey, e.shiftKey, {
          outdentWithAltTab: editorShortcutConfig.outdentWithAltTab,
          outdentWithShiftTab: editorShortcutConfig.outdentWithShiftTab,
        });
        if (res) {
          e.preventDefault();
          applyEditorTextAndSelection(textarea, res.text, res.selectionStart, res.selectionEnd);
        }
        return;
      }

      if (
        e.key !== "Enter" ||
        e.shiftKey ||
        e.altKey ||
        e.ctrlKey ||
        e.metaKey ||
        e.nativeEvent.isComposing
      ) {
        return;
      }

      const res = applyEnterListContinuation(text, start, end);
      if (res) {
        e.preventDefault();
        applyEditorTextAndSelection(textarea, res.text, res.selectionStart, res.selectionEnd);
      }
    },
    [
      applyEditorTextAndSelection,
      editorRef,
      handleScaleShortcut,
      onAdjustContentScale,
      onChangeInput,
      onResetContentScale,
    ]
  );

  const handleScaleWheel = useCallback(
    (e: WheelEvent<HTMLElement>) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      onAdjustContentScale(e.deltaY < 0 ? 0.1 : -0.1);
    },
    [onAdjustContentScale]
  );

  return {
    handleEditorKeyDown,
    handleScaleShortcut,
    handleScaleWheel,
    applyEditorTextAndCursor,
    applyEditorTextAndSelection,
    clearShortcutUndo,
  };
}
