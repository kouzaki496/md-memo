import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { acquireEditLock, releaseEditLock } from "@/lib/editLock";
import { reportStatusError } from "@/lib/handleInvokeError";
import { messages } from "@/lib/messages";
import { getTagToggleBlockedMessage, toggleTagInContent } from "@/lib/noteTags";
import { startPaneResize } from "@/lib/paneResize";
import { clamp } from "@/lib/utils";
import { useEditLockDemotion } from "@/hooks/useEditLockDemotion";

const AUTO_SAVE_MS = 500;
const PREVIEW_MIN_WIDTH = 300;
const PREVIEW_MAX_WIDTH = 900;
const CONTENT_SCALE_MIN = 0.8;
const CONTENT_SCALE_MAX = 1.6;
const DEFAULT_PREVIEW_WIDTH = 420;

export type UseNoteEditorSessionOptions = {
  notePath: string | null;
  isReadOnly: boolean;
  setStatus: (status: string) => void;
  onSaved?: (savedPath: string) => void | Promise<void>;
  /** 編集ロック剥奪時など。未指定時は notePath から read_note して input を更新 */
  reloadFromDisk?: () => Promise<void>;
  getMaxPreviewWidth?: () => number;
  onEnterEditModeSuccess?: () => void;
  onEnterPreviewMode?: () => void;
  initialPreviewWidth?: number;
};

export type UseNoteEditorSessionResult = {
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  isEditMode: boolean;
  setIsEditMode: Dispatch<SetStateAction<boolean>>;
  previewWidth: number;
  contentScale: number;
  editorRef: RefObject<HTMLTextAreaElement | null>;
  flushSave: () => Promise<void>;
  enterEditMode: () => void;
  enterPreviewMode: () => void;
  toggleTemplateTag: (rawTag: string) => void;
  startPreviewResize: (startClientX: number) => void;
  adjustContentScale: (delta: number) => void;
  resetContentScale: () => void;
};

export function useNoteEditorSession(
  options: UseNoteEditorSessionOptions
): UseNoteEditorSessionResult {
  const {
    notePath,
    isReadOnly,
    setStatus,
    reloadFromDisk: reloadFromDiskOption,
    getMaxPreviewWidth,
    onEnterEditModeSuccess,
    onEnterPreviewMode,
    initialPreviewWidth = DEFAULT_PREVIEW_WIDTH,
  } = options;

  const [input, setInput] = useState("");
  const [isEditMode, setIsEditMode] = useState(false);
  const [previewWidth, setPreviewWidth] = useState(initialPreviewWidth);
  const [contentScale, setContentScale] = useState(1);
  const saveTimerRef = useRef<number | null>(null);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);

  const notePathRef = useRef(notePath);
  notePathRef.current = notePath;

  const editStateRef = useRef({ isEditMode, input, notePath, isReadOnly });
  editStateRef.current = { isEditMode, input, notePath, isReadOnly };

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const reloadFromDisk = useCallback(async () => {
    if (reloadFromDiskOption) {
      await reloadFromDiskOption();
      return;
    }
    const path = notePathRef.current;
    if (!path) return;
    try {
      const content = await invoke<string>("read_note", { path });
      setInput(content);
    } catch (err) {
      reportStatusError(setStatus, err, "reloadFromDisk");
    }
  }, [reloadFromDiskOption]);

  const flushSave = useCallback(async () => {
    if (saveTimerRef.current != null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const {
      isEditMode: editing,
      input: text,
      notePath: path,
      isReadOnly: readOnly,
    } = editStateRef.current;
    if (!editing || readOnly || !text) return;
    setStatus(messages.status.saving);
    try {
      const savedPath = await invoke<string>("save_note", {
        content: text,
        currentPath: path ?? undefined,
      });
      await optionsRef.current.onSaved?.(savedPath);
      setStatus(messages.status.saved);
    } catch (err) {
      reportStatusError(setStatus, err, "flushSave");
    }
  }, [setStatus]);

  useEditLockDemotion({
    getState: () => ({ isEditMode: editStateRef.current.isEditMode }),
    flushSave,
    reloadFromDisk,
    exitEditMode: () => {
      setIsEditMode(false);
      setStatus(messages.status.previewMode);
    },
  });

  useEffect(() => {
    if (isReadOnly && isEditMode) {
      setIsEditMode(false);
    }
  }, [isReadOnly, isEditMode]);

  useEffect(() => {
    if (saveTimerRef.current != null) {
      window.clearTimeout(saveTimerRef.current);
    }
    if (!isEditMode || isReadOnly || !input) return;

    saveTimerRef.current = window.setTimeout(() => {
      setStatus(messages.status.saving);
      void invoke<string>("save_note", {
        content: input,
        currentPath: notePath ?? undefined,
      })
        .then(async (savedPath) => {
          await optionsRef.current.onSaved?.(savedPath);
          setStatus(messages.status.saved);
        })
        .catch((err) => {
          reportStatusError(setStatus, err, "autoSave");
        });
    }, AUTO_SAVE_MS);

    return () => {
      if (saveTimerRef.current != null) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [input, notePath, isEditMode, isReadOnly, setStatus]);

  const startPreviewResize = useCallback(
    (startClientX: number) => {
      const maxWidth = getMaxPreviewWidth?.() ?? Math.min(PREVIEW_MAX_WIDTH, window.innerWidth - 280);
      startPaneResize({
        startClientX,
        startWidth: previewWidth,
        minWidth: PREVIEW_MIN_WIDTH,
        maxWidth,
        onResize: setPreviewWidth,
        direction: "grow-left",
      });
    },
    [getMaxPreviewWidth, previewWidth]
  );

  const toggleTemplateTag = useCallback(
    (rawTag: string) => {
      setInput((prev) => {
        const blocked = getTagToggleBlockedMessage(prev, rawTag);
        if (blocked) {
          queueMicrotask(() => setStatus(blocked));
          return prev;
        }
        return toggleTagInContent(prev, rawTag);
      });
    },
    [setStatus]
  );

  const enterEditMode = useCallback(() => {
    if (isReadOnly) {
      setStatus(messages.status.builtinReadOnly);
      return;
    }
    void (async () => {
      try {
        await acquireEditLock(notePath);
        setIsEditMode(true);
        onEnterEditModeSuccess?.();
        setStatus(messages.status.editMode);
      } catch (err) {
        reportStatusError(setStatus, err, "acquireEditLock");
      }
    })();
  }, [isReadOnly, notePath, onEnterEditModeSuccess, setStatus]);

  const enterPreviewMode = useCallback(() => {
    void (async () => {
      if (isEditMode) {
        await releaseEditLock();
      }
      setIsEditMode(false);
      onEnterPreviewMode?.();
      setStatus(messages.status.previewMode);
    })();
  }, [isEditMode, onEnterPreviewMode, setStatus]);

  const adjustContentScale = useCallback((delta: number) => {
    setContentScale((prev) => clamp(Number((prev + delta).toFixed(2)), CONTENT_SCALE_MIN, CONTENT_SCALE_MAX));
  }, []);

  const resetContentScale = useCallback(() => {
    setContentScale(1);
  }, []);

  return {
    input,
    setInput,
    isEditMode,
    setIsEditMode,
    previewWidth,
    contentScale,
    editorRef,
    flushSave,
    enterEditMode,
    enterPreviewMode,
    toggleTemplateTag,
    startPreviewResize,
    adjustContentScale,
    resetContentScale,
  };
}
