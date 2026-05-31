import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ReadingEditorPane } from "@/components/app/ReadingEditorPane";
import type { AppConfig } from "@/types/config";
import { reportStatusError, handleInvokeError } from "@/lib/handleInvokeError";
import { messages } from "@/lib/messages";
import { releaseEditLock } from "@/lib/editLock";
import { isSystemNotePath } from "@/lib/systemNotes";
import { applyConfigTheme, normalizeAppConfig } from "@/lib/config";
import { fileNameFromPath } from "@/lib/notePath";
import { useNoteEditorSession } from "@/hooks/useNoteEditorSession";
import "./App.css";

type NoteWindowAppProps = {
  notePath: string;
};

export function NoteWindowApp({ notePath }: NoteWindowAppProps) {
  const [status, setStatus] = useState<string>(messages.status.ready);
  const [templateTags, setTemplateTags] = useState<string[]>([]);

  const currentFileName = useMemo(() => fileNameFromPath(notePath), [notePath]);
  const isReadOnly = isSystemNotePath(notePath);

  const {
    input,
    setInput,
    isEditMode,
    previewWidth,
    contentScale,
    editorRef,
    enterEditMode,
    enterPreviewMode,
    toggleTemplateTag,
    startPreviewResize,
    adjustContentScale,
    resetContentScale,
  } = useNoteEditorSession({
    notePath,
    isReadOnly,
    setStatus,
  });

  const loadConfig = async () => {
    const cfg = await invoke<AppConfig>("get_config");
    const merged = normalizeAppConfig(cfg);
    applyConfigTheme(merged);
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
        reportStatusError(setStatus, err, "loadNote");
      }
    },
    [notePath, currentFileName, isEditMode, setInput, setStatus]
  );

  useEffect(() => {
    void loadConfig().catch((err) => handleInvokeError(err, "loadConfig"));
    void loadNote({ force: true });
  }, [notePath]);

  useEffect(() => {
    const onFocus = () => {
      void loadNote();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadNote]);

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
        onAdjustContentScale={adjustContentScale}
        onResetContentScale={resetContentScale}
        onDeleteCurrentNote={() => void deleteCurrentNote()}
        editorRef={editorRef}
      />
      <div className="shrink-0 border-t bg-background/80 px-4 py-2 text-xs text-muted-foreground">
        {status}
      </div>
    </div>
  );
}
