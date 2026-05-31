import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { NoteDetail, NoteMeta, SearchHit, SearchMode } from "@/types/note";
import { acquireEditLock, releaseEditLock } from "@/lib/editLock";
import { DEFAULT_NEW_NOTE_TAG, toggleTagInContent } from "@/lib/noteTags";
import { isSystemNotePath } from "@/lib/systemNotes";
import { messages } from "@/lib/messages";
import { openNoteInNewWindow } from "@/lib/noteWindow";
import { reportStatusError } from "@/lib/handleInvokeError";
import { fileNameFromPath } from "@/lib/notePath";
import { noteMetaFromPath } from "@/lib/noteMeta";

export type PreviewSearchContext = { query: string; mode: SearchMode };

type UseNoteNavigationOptions = {
  setStatus: (status: string) => void;
  setInput: (value: string) => void;
  getIsEditMode: () => boolean;
  flushSave: () => Promise<void>;
  setIsEditMode: (value: boolean) => void;
  setIsManageMode: (value: boolean) => void;
  exitSettingsIfAllowed: () => Promise<boolean>;
  loadNotes: () => Promise<void>;
  loadNoteDetails: () => Promise<void>;
  notes: NoteMeta[];
  pinned: NoteMeta[];
  recent: NoteMeta[];
  filteredDetails: NoteDetail[];
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
};

export function useNoteNavigation(options: UseNoteNavigationOptions) {
  const {
    setStatus,
    setInput,
    getIsEditMode,
    flushSave,
    setIsEditMode,
    setIsManageMode,
    exitSettingsIfAllowed,
    loadNotes,
    loadNoteDetails,
    notes,
    pinned,
    recent,
    filteredDetails,
    isSidebarOpen,
    setIsSidebarOpen,
  } = options;

  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [activeHit, setActiveHit] = useState<SearchHit | null>(null);
  const [previewSearch, setPreviewSearch] = useState<PreviewSearchContext | null>(null);

  const currentFileName = currentPath ? fileNameFromPath(currentPath) : "新規メモ";

  const clearSearchContext = useCallback(() => {
    setActiveHit(null);
    setPreviewSearch(null);
  }, []);

  const createNew = useCallback(() => {
    void (async () => {
      if (!(await exitSettingsIfAllowed())) return;
      if (getIsEditMode()) {
        await flushSave();
        await releaseEditLock();
      }
      setInput(toggleTagInContent("", DEFAULT_NEW_NOTE_TAG));
      setCurrentPath(null);
      setActiveHit(null);
      setIsManageMode(false);
      try {
        await acquireEditLock(null);
        setIsEditMode(true);
        setStatus(messages.status.ready);
      } catch (err) {
        reportStatusError(setStatus, err, "createNew/acquireEditLock");
      }
    })();
  }, [exitSettingsIfAllowed, flushSave, getIsEditMode, setInput, setIsEditMode, setIsManageMode, setStatus]);

  const openNote = useCallback(
    async (
      path: string,
      hit?: SearchHit,
      highlight: PreviewSearchContext | null = null
    ) => {
      if (!(await exitSettingsIfAllowed())) return;
      if (getIsEditMode()) {
        await flushSave();
        await releaseEditLock();
      }
      try {
        const content = await invoke<string>("read_note", { path });
        setCurrentPath(path);
        setInput(content);
        setActiveHit(hit ?? null);
        setPreviewSearch(highlight);
        setIsEditMode(false);
        setIsManageMode(false);
        setStatus(messages.status.loaded);
      } catch (err) {
        reportStatusError(setStatus, err, "openNote");
        await loadNotes();
      }
    },
    [
      exitSettingsIfAllowed,
      flushSave,
      getIsEditMode,
      loadNotes,
      setInput,
      setIsEditMode,
      setIsManageMode,
      setStatus,
    ]
  );

  const pinOrUnpinNote = useCallback(
    async (note: NoteMeta, onComplete?: () => void) => {
      if (note.pinned && (note.systemNote || isSystemNotePath(note.path))) {
        onComplete?.();
        setStatus(messages.status.builtinNoUnpin);
        return;
      }
      await invoke("toggle_pin_note", { path: note.path, pinned: !note.pinned });
      await Promise.all([loadNotes(), loadNoteDetails()]);
      onComplete?.();
      setStatus(note.pinned ? messages.status.unpinned : messages.status.pinned);
    },
    [loadNoteDetails, loadNotes, setStatus]
  );

  const deleteNote = useCallback(
    async (note: NoteMeta, onComplete?: () => void) => {
      if (note.systemNote || isSystemNotePath(note.path)) {
        onComplete?.();
        setStatus(messages.status.builtinNoDelete);
        return;
      }
      const ok = window.confirm(messages.confirm.deleteNote(note.title));
      if (!ok) return;
      await invoke("delete_note", { path: note.path });
      if (currentPath === note.path) {
        setCurrentPath(null);
        setInput("");
        setActiveHit(null);
        setIsEditMode(false);
      }
      await Promise.all([loadNotes(), loadNoteDetails()]);
      onComplete?.();
      setStatus(messages.status.deleted);
    },
    [currentPath, loadNoteDetails, loadNotes, setInput, setIsEditMode, setStatus]
  );

  const deleteCurrentNote = useCallback(() => {
    if (!currentPath) return;
    const fromList =
      pinned.find((n) => n.path === currentPath) ?? recent.find((n) => n.path === currentPath);
    const meta: NoteMeta =
      fromList ??
      noteMetaFromPath(currentPath, notes, filteredDetails);
    void deleteNote(meta);
  }, [currentPath, deleteNote, filteredDetails, notes, pinned, recent]);

  const openInNewWindow = useCallback(
    (path: string, onComplete?: () => void) => {
      onComplete?.();
      void openNoteInNewWindow(path).catch((err) => {
        reportStatusError(setStatus, err, "openNoteInNewWindow");
      });
    },
    [setStatus]
  );

  const openNoteInNewWindowFromMeta = useCallback(
    (note: NoteMeta, onComplete?: () => void) => {
      openInNewWindow(note.path, onComplete);
    },
    [openInNewWindow]
  );

  const openCurrentInNewWindow = useCallback(() => {
    if (!currentPath) return;
    openInNewWindow(currentPath);
  }, [currentPath, openInNewWindow]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() !== "f") return;
      if (!e.shiftKey) return;

      e.preventDefault();
      if (!isSidebarOpen) {
        setIsSidebarOpen(true);
      }
      requestAnimationFrame(() => {
        const el = document.getElementById("app-search-input");
        if (el instanceof HTMLInputElement) {
          el.focus();
          el.select();
        }
      });
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isSidebarOpen, setIsSidebarOpen]);

  return {
    currentPath,
    setCurrentPath,
    currentFileName,
    activeHit,
    setActiveHit,
    previewSearch,
    clearSearchContext,
    createNew,
    openNote,
    pinOrUnpinNote,
    deleteNote,
    deleteCurrentNote,
    openNoteInNewWindowFromMeta,
    openCurrentInNewWindow,
  };
}
