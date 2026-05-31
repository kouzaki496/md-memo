import { useMemo } from "react";
import type { SearchMode } from "@/types/note";
import { isSearchHighlightActive } from "@/lib/searchHighlight";
import { parseBodyHighlightTerms, type ParsedBodyTerm } from "@/lib/searchQueryParse";

/** プレビュー用の本文ハイライト語（タグ検索時は空） */
export function useSearchHighlightTerms(query: string, searchMode: SearchMode): ParsedBodyTerm[] {
  return useMemo(() => {
    if (!isSearchHighlightActive(searchMode, query)) return [];
    return parseBodyHighlightTerms(query);
  }, [query, searchMode]);
}
