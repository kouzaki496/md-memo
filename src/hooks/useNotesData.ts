import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { NoteDetail, NoteMeta, SearchHit } from "@/types/note";
import { buildShortcutMemoContent } from "@/config/shortcutMemo";
import { isSystemNoteFileName, isSystemNotePath } from "@/lib/systemNotes";
import { formatAppError } from "@/lib/appError";
import { messages } from "@/lib/messages";

/** 語に大文字が含まれる場合は大小区別、それ以外は大小区別なし（Rust の search と同趣旨） */
function fieldMatchesQuery(haystack: string, needle: string): boolean {
  if (needle.length === 0) return true;
  const caseSensitive = /[\p{Lu}]/u.test(needle);
  if (caseSensitive) {
    return haystack.includes(needle);
  }
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function isEditorShortcutsNote(n: NoteMeta): boolean {
  return isSystemNoteFileName(n.title);
}

export function useNotesData(notesInitEnabled: boolean) {
  const [query, setQuery] = useState("");
  const [notes, setNotes] = useState<NoteMeta[]>([]);
  const [searchResults, setSearchResults] = useState<SearchHit[]>([]);
  const [status, setStatus] = useState<string>(messages.status.ready);
  const [isManageMode, setIsManageMode] = useState(false);
  const [noteDetails, setNoteDetails] = useState<NoteDetail[]>([]);
  const [managerQuery, setManagerQuery] = useState("");
  const [maxChars, setMaxChars] = useState("");
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

  const pinned = useMemo(() => notes.filter((n) => n.pinned), [notes]);
  const recent = useMemo(() => notes.filter((n) => !n.pinned).slice(0, 10), [notes]);

  const filteredDetails = useMemo(() => {
    const q = managerQuery.trim();
    const max = Number(maxChars);
    return noteDetails.filter((n) => {
      const queryOk =
        q.length === 0 ||
        fieldMatchesQuery(n.title, q) ||
        fieldMatchesQuery(n.preview, q) ||
        fieldMatchesQuery(n.path, q);
      const lengthOk = !Number.isFinite(max) || max <= 0 || n.charCount <= max;
      return queryOk && lengthOk;
    });
  }, [noteDetails, managerQuery, maxChars]);

  const loadNotes = async () => {
    const list = await invoke<NoteMeta[]>("list_notes");
    setNotes(list);
  };

  const loadNoteDetails = async () => {
    const list = await invoke<NoteDetail[]>("list_notes_detail");
    setNoteDetails(list);
  };

  const toggleSelect = (path: string) => {
    if (isSystemNotePath(path)) return;
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedPaths(
      new Set(filteredDetails.filter((n) => !isSystemNotePath(n.path)).map((n) => n.path))
    );
  };

  const clearSelection = () => {
    setSelectedPaths(new Set());
  };

  const deleteSelected = async () => {
    const paths = Array.from(selectedPaths).filter((p) => !isSystemNotePath(p));
    if (paths.length === 0) {
      if (selectedPaths.size > 0) {
        setStatus(messages.status.builtinNoDelete);
      }
      return 0;
    }
    const ok = window.confirm(messages.confirm.deleteSelected(paths.length));
    if (!ok) return 0;
    const deleted = await invoke<number>("delete_notes", { paths });
    if (deleted < selectedPaths.size) {
      setStatus(messages.status.deletedCountSkippedBuiltin(deleted));
    } else {
      setStatus(messages.status.deletedCount(deleted));
    }
    clearSelection();
    await Promise.all([loadNotes(), loadNoteDetails()]);
    return deleted;
  };

  const openManager = async () => {
    setIsManageMode(true);
    await loadNoteDetails();
  };

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
      console.error(err);
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
      console.error(err);
    }

    try {
      await loadNotes();
    } catch (err) {
      console.error(err);
      setStatus(formatAppError(err));
    }
  }, []);

  useEffect(() => {
    if (!notesInitEnabled) return;
    void initializeNotes();
  }, [notesInitEnabled, initializeNotes]);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }
    const dirPath = notes.length > 0 ? notes[0].path.replace(/[\\/][^\\/]+$/, "") : "";
    if (!dirPath) return;
    void invoke<SearchHit[]>("search_notes", { query: q, dirPath })
      .then(setSearchResults)
      .catch((err) => {
        console.error(err);
        setStatus(formatAppError(err));
      });
  }, [query, notes]);

  return {
    query,
    setQuery,
    notes,
    searchResults,
    status,
    setStatus,
    isManageMode,
    setIsManageMode,
    noteDetails,
    managerQuery,
    setManagerQuery,
    maxChars,
    setMaxChars,
    selectedPaths,
    pinned,
    recent,
    filteredDetails,
    loadNotes,
    loadNoteDetails,
    toggleSelect,
    selectAllFiltered,
    clearSelection,
    deleteSelected,
    openManager,
    initializeNotes,
  };
}
