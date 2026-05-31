import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { NoteDetail, NoteMeta } from "@/types/note";
import { buildShortcutMemoContent } from "@/config/shortcutMemo";
import { compareNoteRecency } from "@/lib/noteRecency";
import { isSystemNoteFileName, isSystemNotePath } from "@/lib/systemNotes";
import { formatAppError } from "@/lib/appError";
import { messages } from "@/lib/messages";
import { useNoteSearch } from "@/hooks/useNoteSearch";
import { noteDetailsFromSearchHits } from "@/lib/managerSearchFilter";
import type { SearchHit } from "@/types/note";

function isEditorShortcutsNote(n: NoteMeta): boolean {
  return isSystemNoteFileName(n.title);
}

export function useNotesData(notesInitEnabled: boolean) {
  const [query, setQuery] = useState("");
  const [notes, setNotes] = useState<NoteMeta[]>([]);
  const [status, setStatus] = useState<string>(messages.status.ready);
  const [isManageMode, setIsManageMode] = useState(false);
  const [noteDetails, setNoteDetails] = useState<NoteDetail[]>([]);
  const [managerQuery, setManagerQuery] = useState("");
  const [managerSeedQuery, setManagerSeedQuery] = useState("");
  const [managerSeedHits, setManagerSeedHits] = useState<SearchHit[] | null>(null);
  const [maxChars, setMaxChars] = useState("");
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

  const handleSearchError = useCallback(() => {
    setStatus(messages.status.searchFailed);
  }, []);

  const sidebarSearch = useNoteSearch(query, { onError: handleSearchError });
  const [managerDetailsReady, setManagerDetailsReady] = useState(false);

  const managerSearch = useNoteSearch(managerQuery, {
    onError: handleSearchError,
    enabled: isManageMode && managerDetailsReady,
  });

  const managerActiveHits = useMemo((): SearchHit[] | null | undefined => {
    const q = managerQuery.trim();
    if (q.length === 0) return null;
    if (managerSearch.error) return undefined;

    if (!managerSearch.pending && managerSearch.searchedQuery === q) {
      return managerSearch.hits;
    }
    if (managerSeedQuery === q && managerSeedHits) {
      return managerSeedHits;
    }
    return undefined;
  }, [managerQuery, managerSearch, managerSeedQuery, managerSeedHits]);

  const managerSearchPending = useMemo(() => {
    const q = managerQuery.trim();
    return q.length > 0 && !managerSearch.error && managerActiveHits === undefined;
  }, [managerQuery, managerSearch.error, managerActiveHits]);

  useEffect(() => {
    const q = managerQuery.trim();
    if (
      managerSeedHits &&
      !managerSearch.pending &&
      !managerSearch.error &&
      managerSearch.searchedQuery === q
    ) {
      setManagerSeedHits(null);
      setManagerSeedQuery("");
    }
  }, [managerQuery, managerSearch, managerSeedHits]);

  const pinned = useMemo(
    () => notes.filter((n) => n.pinned).sort(compareNoteRecency),
    [notes]
  );
  const recent = useMemo(
    () => notes.filter((n) => !n.pinned).sort(compareNoteRecency).slice(0, 10),
    [notes]
  );

  const filteredDetails = useMemo(() => {
    const q = managerQuery.trim();
    const max = Number(maxChars);
    let rows: NoteDetail[];

    if (q.length === 0) {
      rows = noteDetails;
    } else if (managerActiveHits === undefined) {
      rows = [];
    } else if (managerActiveHits === null) {
      rows = noteDetails;
    } else {
      rows = noteDetailsFromSearchHits(noteDetails, notes, managerActiveHits);
    }

    return rows.filter((n) => {
      const lengthOk = !Number.isFinite(max) || max <= 0 || n.charCount <= max;
      return lengthOk;
    });
  }, [noteDetails, notes, managerQuery, maxChars, managerActiveHits]);

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

  const closeManager = useCallback(() => {
    setIsManageMode(false);
    setManagerQuery("");
    setManagerSeedQuery("");
    setManagerSeedHits(null);
    setManagerDetailsReady(false);
  }, []);

  const openManager = async (options?: { searchQuery?: string; initialHits?: SearchHit[] }) => {
    setManagerDetailsReady(false);
    if (options?.searchQuery !== undefined) {
      const q = options.searchQuery.trim();
      setManagerQuery(options.searchQuery);
      if (options.initialHits && q.length > 0) {
        setManagerSeedQuery(q);
        setManagerSeedHits(options.initialHits);
      } else {
        setManagerSeedQuery("");
        setManagerSeedHits(null);
      }
    } else {
      setManagerQuery("");
      setManagerSeedQuery("");
      setManagerSeedHits(null);
    }
    try {
      await loadNoteDetails();
    } finally {
      setManagerDetailsReady(true);
      setIsManageMode(true);
    }
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

  return {
    query,
    setQuery,
    notes,
    searchResults: sidebarSearch.hits,
    searchMode: sidebarSearch.mode,
    searchError: sidebarSearch.error,
    managerSearchError: managerSearch.error,
    managerSearchPending,
    status,
    setStatus,
    isManageMode,
    setIsManageMode,
    closeManager,
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
