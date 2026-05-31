import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { NoteDetail, NoteMeta } from "@/types/note";
import { buildShortcutMemoContent } from "@/config/shortcutMemo";
import { compareNoteRecency } from "@/lib/noteRecency";
import { isSystemNoteFileName } from "@/lib/systemNotes";
import { reportStatusError, handleInvokeError } from "@/lib/handleInvokeError";
import { messages } from "@/lib/messages";
import { useNoteSearch } from "@/hooks/useNoteSearch";
import { useManagerSearch } from "@/hooks/useManagerSearch";
import { useNoteSelection } from "@/hooks/useNoteSelection";

function isEditorShortcutsNote(n: NoteMeta): boolean {
  return isSystemNoteFileName(n.title);
}

export function useNotesData(notesInitEnabled: boolean) {
  const [query, setQuery] = useState("");
  const [notes, setNotes] = useState<NoteMeta[]>([]);
  const [status, setStatus] = useState<string>(messages.status.ready);
  const [noteDetails, setNoteDetails] = useState<NoteDetail[]>([]);

  const handleSearchError = useCallback(() => {
    setStatus(messages.status.searchFailed);
  }, []);

  const sidebarSearch = useNoteSearch(query, { onError: handleSearchError });

  const loadNotes = useCallback(async () => {
    const list = await invoke<NoteMeta[]>("list_notes");
    setNotes(list);
  }, []);

  const loadNoteDetails = useCallback(async () => {
    const list = await invoke<NoteDetail[]>("list_notes_detail");
    setNoteDetails(list);
  }, []);

  const manager = useManagerSearch({
    notes,
    noteDetails,
    setStatus,
    loadNoteDetails,
    onSearchError: handleSearchError,
  });

  const selection = useNoteSelection({
    filteredDetails: manager.filteredDetails,
    setStatus,
    loadNotes,
    loadNoteDetails,
  });

  const pinned = useMemo(
    () => notes.filter((n) => n.pinned).sort(compareNoteRecency),
    [notes]
  );
  const recent = useMemo(
    () => notes.filter((n) => !n.pinned).sort(compareNoteRecency).slice(0, 10),
    [notes]
  );

  const ensureShortcutMemo = async () => {
    const content = buildShortcutMemoContent();
    await invoke<string>("upsert_system_note", {
      fileName: "editor-shortcuts.md",
      content,
      pin: true,
    });
  };

  const ensureMarkdownReferenceMemo = async () => {
    await invoke("ensure_markdown_reference_note");
  };

  const initializeNotes = useCallback(async () => {
    try {
      await ensureShortcutMemo();
    } catch (err) {
      handleInvokeError(err, "ensureShortcutMemo");
      try {
        const list = await invoke<NoteMeta[]>("list_notes");
        if (!list.some(isEditorShortcutsNote)) {
          setStatus(messages.status.shortcutMemoFailed);
        }
      } catch {
        setStatus(messages.status.shortcutMemoFailed);
      }
    }

    try {
      await ensureMarkdownReferenceMemo();
    } catch (err) {
      handleInvokeError(err, "ensureMarkdownReferenceMemo");
    }

    try {
      await loadNotes();
    } catch (err) {
      reportStatusError(setStatus, err, "loadNotes");
    }
  }, [loadNotes]);

  useEffect(() => {
    if (!notesInitEnabled) return;
    void initializeNotes();
  }, [notesInitEnabled, initializeNotes]);

  return {
    query,
    setQuery,
    notes,
    noteDetails,
    searchResults: sidebarSearch.hits,
    searchMode: sidebarSearch.mode,
    searchError: sidebarSearch.error,
    searchPending: sidebarSearch.pending,
    status,
    setStatus,
    pinned,
    recent,
    loadNotes,
    loadNoteDetails,
    initializeNotes,
    ...manager,
    ...selection,
  };
}
