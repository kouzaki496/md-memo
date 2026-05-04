import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { NoteDetail, NoteMeta, SearchHit } from "@/types/note";

export function useNotesData() {
  const [query, setQuery] = useState("");
  const [notes, setNotes] = useState<NoteMeta[]>([]);
  const [searchResults, setSearchResults] = useState<SearchHit[]>([]);
  const [status, setStatus] = useState("Ready");
  const [isManageMode, setIsManageMode] = useState(false);
  const [noteDetails, setNoteDetails] = useState<NoteDetail[]>([]);
  const [managerQuery, setManagerQuery] = useState("");
  const [maxChars, setMaxChars] = useState("");
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

  const pinned = useMemo(() => notes.filter((n) => n.pinned), [notes]);
  const recent = useMemo(() => notes.filter((n) => !n.pinned).slice(0, 10), [notes]);

  const filteredDetails = useMemo(() => {
    const q = managerQuery.trim().toLowerCase();
    const max = Number(maxChars);
    return noteDetails.filter((n) => {
      const queryOk =
        q.length === 0 ||
        n.title.toLowerCase().includes(q) ||
        n.preview.toLowerCase().includes(q) ||
        n.path.toLowerCase().includes(q);
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
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedPaths(new Set(filteredDetails.map((n) => n.path)));
  };

  const clearSelection = () => {
    setSelectedPaths(new Set());
  };

  const deleteSelected = async () => {
    if (selectedPaths.size === 0) return 0;
    const ok = window.confirm(`選択した ${selectedPaths.size} 件を削除しますか？`);
    if (!ok) return 0;
    const deleted = await invoke<number>("delete_notes", { paths: Array.from(selectedPaths) });
    setStatus(`Deleted ${deleted} notes`);
    clearSelection();
    await Promise.all([loadNotes(), loadNoteDetails()]);
    return deleted;
  };

  const openManager = async () => {
    setIsManageMode(true);
    await loadNoteDetails();
  };

  useEffect(() => {
    void loadNotes().catch((err) => {
      console.error(err);
      setStatus("メモ一覧の取得に失敗しました");
    });
  }, []);

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
        setStatus("検索に失敗しました");
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
  };
}
