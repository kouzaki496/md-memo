import { useCallback, useEffect, useMemo, useState } from "react";
import type { NoteDetail, NoteMeta, SearchHit } from "@/types/note";
import { reportStatusError } from "@/lib/handleInvokeError";
import { noteDetailsFromSearchHits, type ManagerNoteRow } from "@/lib/managerSearchFilter";
import { useNoteSearch } from "@/hooks/useNoteSearch";

type UseManagerSearchOptions = {
  notes: NoteMeta[];
  noteDetails: NoteDetail[];
  setStatus: (status: string) => void;
  loadNoteDetails: () => Promise<void>;
  onSearchError: () => void;
};

export function useManagerSearch(options: UseManagerSearchOptions) {
  const { notes, noteDetails, setStatus, loadNoteDetails, onSearchError } = options;

  const [isManageMode, setIsManageMode] = useState(false);
  const [managerQuery, setManagerQuery] = useState("");
  const [managerSeedQuery, setManagerSeedQuery] = useState("");
  const [managerSeedHits, setManagerSeedHits] = useState<SearchHit[] | null>(null);
  const [maxChars, setMaxChars] = useState("");
  const [managerDetailsReady, setManagerDetailsReady] = useState(false);

  const managerSearch = useNoteSearch(managerQuery, {
    onError: onSearchError,
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

  const filteredDetails = useMemo((): ManagerNoteRow[] => {
    const q = managerQuery.trim();
    const max = Number(maxChars);
    let rows: ManagerNoteRow[];

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

  const closeManager = useCallback(() => {
    setIsManageMode(false);
    setManagerQuery("");
    setManagerSeedQuery("");
    setManagerSeedHits(null);
    setManagerDetailsReady(false);
  }, []);

  const openManager = useCallback(
    async (openOptions?: { searchQuery?: string; initialHits?: SearchHit[] }) => {
      setManagerDetailsReady(false);
      if (openOptions?.searchQuery !== undefined) {
        const q = openOptions.searchQuery.trim();
        setManagerQuery(openOptions.searchQuery);
        if (openOptions.initialHits && q.length > 0) {
          setManagerSeedQuery(q);
          setManagerSeedHits(openOptions.initialHits);
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
        setManagerDetailsReady(true);
        setIsManageMode(true);
      } catch (err) {
        reportStatusError(setStatus, err, "openManager");
        setManagerDetailsReady(false);
        setIsManageMode(false);
      }
    },
    [loadNoteDetails, setStatus]
  );

  return {
    isManageMode,
    setIsManageMode,
    closeManager,
    openManager,
    managerQuery,
    setManagerQuery,
    maxChars,
    setMaxChars,
    filteredDetails,
    managerSearchError: managerSearch.error,
    managerSearchPending,
    managerSearchMode: managerSearch.mode,
  };
}
