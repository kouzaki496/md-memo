import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  EMPTY_NOTE_SEARCH_STATE,
  type NoteSearchState,
  type SearchNotesResult,
} from "@/types/note";

const DEFAULT_DEBOUNCE_MS = 250;

type UseNoteSearchOptions = {
  debounceMs?: number;
  onError?: () => void;
  /** false のとき invoke しない（一覧管理を閉じている間など） */
  enabled?: boolean;
};

/** Rust `search_notes` をデバウンス付きで呼び出す。query が空のときは即空結果。 */
export function useNoteSearch(
  query: string,
  options?: UseNoteSearchOptions
): NoteSearchState {
  const debounceMs = options?.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const onError = options?.onError;
  const enabled = options?.enabled ?? true;
  const [result, setResult] = useState<NoteSearchState>(EMPTY_NOTE_SEARCH_STATE);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const q = query.trim();
    if (!q) {
      setResult(EMPTY_NOTE_SEARCH_STATE);
      return;
    }

    let cancelled = false;
    setResult({
      ...EMPTY_NOTE_SEARCH_STATE,
      pending: true,
    });

    const timer = window.setTimeout(() => {
      void invoke<SearchNotesResult>("search_notes", { query: q })
        .then((next) => {
          if (!cancelled) {
            setResult({ ...next, error: false, pending: false, searchedQuery: q });
          }
        })
        .catch((err) => {
          if (cancelled) return;
          console.error(err);
          setResult({
            ...EMPTY_NOTE_SEARCH_STATE,
            error: true,
            pending: false,
            searchedQuery: q,
          });
          onError?.();
        });
    }, debounceMs);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, debounceMs, onError, enabled]);

  return result;
}
