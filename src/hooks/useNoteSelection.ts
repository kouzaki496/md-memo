import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ManagerNoteRow } from "@/lib/managerSearchFilter";
import { isSystemNotePath } from "@/lib/systemNotes";
import { messages } from "@/lib/messages";

type UseNoteSelectionOptions = {
  filteredDetails: ManagerNoteRow[];
  setStatus: (status: string) => void;
  loadNotes: () => Promise<void>;
  loadNoteDetails: () => Promise<void>;
};

export function useNoteSelection(options: UseNoteSelectionOptions) {
  const { filteredDetails, setStatus, loadNotes, loadNoteDetails } = options;
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

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

  return {
    selectedPaths,
    toggleSelect,
    selectAllFiltered,
    clearSelection,
    deleteSelected,
  };
}
