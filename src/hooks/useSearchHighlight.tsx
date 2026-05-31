import { useMemo } from "react";
import type { SearchMode } from "@/types/note";
import {
  isSearchHighlightActive,
  parseBodyHighlightTerms,
} from "@/lib/searchHighlight";

/** プレビュー用の本文ハイライト語（タグ検索時は空） */
export function useSearchHighlightTerms(query: string, searchMode: SearchMode): string[] {
  return useMemo(() => {
    if (!isSearchHighlightActive(searchMode, query)) return [];
    return parseBodyHighlightTerms(query);
  }, [query, searchMode]);
}
