import {
  type ClipboardEvent,
  type DragEvent,
  type RefObject,
  useCallback,
} from "react";
import { messages } from "@/lib/messages";
import { useTauriImageDrop } from "@/hooks/useTauriImageDrop";
import {
  buildImageMarkdown,
  clipboardMayContainImage,
  importImageFromDialog,
  importImagePath,
  insertTextAtSelection,
  readClipboardImageFile,
  saveImageFile,
} from "@/lib/noteImages";

type UseEditorImageInsertOptions = {
  editorRef: RefObject<HTMLTextAreaElement | null>;
  isReadOnly: boolean;
  isEditMode: boolean;
  applyEditorTextAndCursor: (
    textarea: HTMLTextAreaElement,
    nextText: string,
    nextCursor: number
  ) => void;
};

export function useEditorImageInsert(options: UseEditorImageInsertOptions) {
  const { editorRef, isReadOnly, isEditMode, applyEditorTextAndCursor } = options;

  const insertImageMarkdownAtCursor = useCallback(
    (textarea: HTMLTextAreaElement, relativePath: string) => {
      const markdown = buildImageMarkdown(relativePath);
      const { nextText, nextCursor } = insertTextAtSelection(
        textarea.value,
        textarea.selectionStart,
        textarea.selectionEnd,
        markdown
      );
      applyEditorTextAndCursor(textarea, nextText, nextCursor);
    },
    [applyEditorTextAndCursor]
  );

  const handleInsertImageFromFile = useCallback(
    async (file: File, textarea: HTMLTextAreaElement | null) => {
      try {
        const relativePath = await saveImageFile(file);
        const ta = textarea ?? editorRef.current;
        if (!ta) return;
        insertImageMarkdownAtCursor(ta, relativePath);
      } catch {
        window.alert(messages.editor.imageInsertFailed);
      }
    },
    [editorRef, insertImageMarkdownAtCursor]
  );

  const handleInsertImageClick = useCallback(async () => {
    const textarea = editorRef.current;
    if (!textarea || isReadOnly) return;
    try {
      const relativePath = await importImageFromDialog();
      if (!relativePath) return;
      insertImageMarkdownAtCursor(textarea, relativePath);
    } catch {
      window.alert(messages.editor.imageInsertFailed);
    }
  }, [editorRef, insertImageMarkdownAtCursor, isReadOnly]);

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
    [editorRef, insertImageMarkdownAtCursor, isReadOnly]
  );

  useTauriImageDrop(isEditMode && !isReadOnly, handleTauriImageDrop);

  const handleEditorPaste = useCallback(
    async (e: ClipboardEvent<HTMLTextAreaElement>) => {
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
    },
    [handleInsertImageFromFile, isReadOnly]
  );

  const handleEditorDragOver = useCallback(
    (e: DragEvent<HTMLTextAreaElement>) => {
      if (isReadOnly) return;
      const types = e.dataTransfer.types;
      if (types.includes("Files") || types.includes("application/x-moz-file")) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }
    },
    [isReadOnly]
  );

  const handleEditorDrop = useCallback(
    async (e: DragEvent<HTMLTextAreaElement>) => {
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
    },
    [handleInsertImageFromFile, isReadOnly]
  );

  return {
    handleInsertImageClick,
    handleEditorPaste,
    handleEditorDragOver,
    handleEditorDrop,
  };
}
