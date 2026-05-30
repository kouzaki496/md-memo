import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ReadingEditorPane } from "@/components/app/ReadingEditorPane";
import type { AppConfig } from "@/types/config";
import {
  ensureLockedInboxInTemplateTags,
  getTagToggleBlockedMessage,
  toggleTagInContent,
} from "@/lib/noteTags";
import { formatAppError } from "@/lib/appError";
import { messages } from "@/lib/messages";
import { acquireEditLock, releaseEditLock } from "@/lib/editLock";
import { applyTheme, applyThemePreset } from "@/lib/theme";
import { isSystemNotePath } from "@/lib/systemNotes";
import { useEditLockDemotion } from "@/hooks/useEditLockDemotion";
import "./App.css";

type NoteWindowAppProps = {
  notePath: string;
};

function fileNameFromPath(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

export function NoteWindowApp({ notePath }: NoteWindowAppProps) {
  const [input, setInput] = useState("");
  const [isEditMode, setIsEditMode] = useState(false);
  const [previewWidth, setPreviewWidth] = useState(420);
  const [contentScale, setContentScale] = useState(1);
  const [templateTags, setTemplateTags] = useState<string[]>([]);
  const [status, setStatus] = useState<string>(messages.status.ready);
  const saveTimerRef = useRef<number | null>(null);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);

  const currentFileName = useMemo(() => fileNameFromPath(notePath), [notePath]);
  const isReadOnly = isSystemNotePath(notePath);

  const editStateRef = useRef({ isEditMode, input, isReadOnly });
  editStateRef.current = { isEditMode, input, isReadOnly };

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  const loadConfig = async () => {
    const cfg = await invoke<AppConfig>("get_config");
    const merged = {
      ...cfg,
      templateTags: ensureLockedInboxInTemplateTags(cfg.templateTags ?? []),
      themeMode: cfg.themeMode ?? (cfg.darkMode ? "dark" : "light"),
      themePreset: cfg.themePreset ?? "default",
    };
    applyTheme(merged.themeMode);
    applyThemePreset(merged.themePreset);
    setTemplateTags(merged.templateTags);
    return merged;
  };

  const loadNote = useCallback(
    async (opts?: { force?: boolean }) => {
      if (isEditMode && !opts?.force) return;
      try {
        const content = await invoke<string>("read_note", { path: notePath });
        setInput(content);
        setStatus(messages.status.loaded);
        await getCurrentWindow().setTitle(currentFileName);
      } catch (err) {
        console.error(err);
        setStatus(formatAppError(err));
      }
    },
    [notePath, currentFileName, isEditMode]
  );

  const flushSave = async () => {
    if (saveTimerRef.current != null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const { isEditMode: editing, input: text, isReadOnly: readOnly } = editStateRef.current;
    if (!editing || readOnly || !text) return;
    setStatus(messages.status.saving);
    try {
      await invoke<string>("save_note", { content: text, currentPath: notePath });
      setStatus(messages.status.saved);
    } catch (err) {
      console.error(err);
      setStatus(formatAppError(err));
    }
  };

  useEditLockDemotion({
    getState: () => ({ isEditMode: editStateRef.current.isEditMode }),
    flushSave,
    reloadFromDisk: () => loadNote({ force: true }),
    exitEditMode: () => {
      setIsEditMode(false);
      setStatus(messages.status.previewMode);
    },
  });

  useEffect(() => {
    void loadConfig().catch(console.error);
    void loadNote({ force: true });
  }, [notePath]);

  useEffect(() => {
    const onFocus = () => {
      void loadNote();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadNote]);

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
      void invoke<string>("save_note", { content: input, currentPath: notePath })
        .then(() => {
          setStatus(messages.status.saved);
        })
        .catch((err) => {
          console.error(err);
          setStatus(formatAppError(err));
        });
    }, 500);

    return () => {
      if (saveTimerRef.current != null) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [input, notePath, isEditMode, isReadOnly]);

  const startPreviewResize = (startClientX: number) => {
    const startWidth = previewWidth;
    const minWidth = 300;
    const maxWidth = Math.min(900, window.innerWidth - 280);

    const onMouseMove = (e: globalThis.MouseEvent) => {
      const next = clamp(startWidth - (e.clientX - startClientX), minWidth, maxWidth);
      setPreviewWidth(next);
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  const toggleTemplateTag = (rawTag: string) => {
    setInput((prev) => {
      const blocked = getTagToggleBlockedMessage(prev, rawTag);
      if (blocked) {
        queueMicrotask(() => setStatus(blocked));
        return prev;
      }
      return toggleTagInContent(prev, rawTag);
    });
  };

  const deleteCurrentNote = async () => {
    if (isReadOnly) return;
    const ok = window.confirm(messages.confirm.deleteNote(currentFileName));
    if (!ok) return;
    if (isEditMode) {
      await releaseEditLock();
    }
    await invoke("delete_note", { path: notePath });
    await getCurrentWindow().close();
  };

  const enterEditMode = () => {
    if (isReadOnly) {
      setStatus(messages.status.builtinReadOnly);
      return;
    }
    void (async () => {
      try {
        await acquireEditLock(notePath);
        setIsEditMode(true);
        setStatus(messages.status.editMode);
      } catch (err) {
        console.error(err);
      }
    })();
  };

  const enterPreviewMode = () => {
    void (async () => {
      if (isEditMode) {
        await releaseEditLock();
      }
      setIsEditMode(false);
      setStatus(messages.status.previewMode);
    })();
  };

  return (
    <div className="flex h-screen w-full min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <ReadingEditorPane
        isEditMode={isEditMode}
        isReadOnly={isReadOnly}
        currentPath={notePath}
        currentFileName={currentFileName}
        input={input}
        previewWidth={previewWidth}
        contentScale={contentScale}
        templateTags={templateTags}
        onEnterEditMode={enterEditMode}
        onEnterPreviewMode={enterPreviewMode}
        onChangeInput={setInput}
        onToggleTemplateTag={toggleTemplateTag}
        onStartPreviewResize={startPreviewResize}
        onAdjustContentScale={(delta) =>
          setContentScale((prev) => clamp(Number((prev + delta).toFixed(2)), 0.8, 1.6))
        }
        onResetContentScale={() => setContentScale(1)}
        onDeleteCurrentNote={() => void deleteCurrentNote()}
        editorRef={editorRef}
      />
      <div className="shrink-0 border-t bg-background/80 px-4 py-2 text-xs text-muted-foreground">
        {status}
      </div>
    </div>
  );
}
