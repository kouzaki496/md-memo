import { useCallback } from "react";
import { releaseEditLock } from "@/lib/editLock";
import type { SearchHit } from "@/types/note";

type OpenManagerOptions = {
  searchQuery?: string;
  initialHits?: SearchHit[];
};

type UseOpenManagerOptions = {
  exitSettingsIfAllowed: () => Promise<boolean>;
  isEditMode: boolean;
  flushSave: () => Promise<void>;
  setIsEditMode: (value: boolean) => void;
  openManager: (options?: OpenManagerOptions) => Promise<void>;
  sidebarQuery: string;
  sidebarSearchResults: SearchHit[];
};

export function useOpenManager(options: UseOpenManagerOptions) {
  const {
    exitSettingsIfAllowed,
    isEditMode,
    flushSave,
    setIsEditMode,
    openManager,
    sidebarQuery,
    sidebarSearchResults,
  } = options;

  return useCallback(
    (withCurrentSearch?: boolean) => {
      void (async () => {
        if (!(await exitSettingsIfAllowed())) return;
        if (isEditMode) {
          await flushSave();
          await releaseEditLock();
          setIsEditMode(false);
        }
        await openManager(
          withCurrentSearch
            ? { searchQuery: sidebarQuery, initialHits: sidebarSearchResults }
            : undefined
        );
      })();
    },
    [
      exitSettingsIfAllowed,
      flushSave,
      isEditMode,
      openManager,
      setIsEditMode,
      sidebarQuery,
      sidebarSearchResults,
    ]
  );
}
