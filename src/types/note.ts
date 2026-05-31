export type SearchMode = "tag" | "body" | "mixed";

export type NoteMeta = {
  path: string;
  title: string;
  pinned: boolean;
  systemNote: boolean;
  tags: string[];
  updatedMs: number;
  createdMs: number;
};

export type SearchHit = {
  path: string;
  line: number;
  text: string;
  mode: SearchMode;
  score: number | null;
};

export type SearchNotesResult = {
  mode: SearchMode;
  hits: SearchHit[];
};

export const EMPTY_SEARCH_NOTES_RESULT: SearchNotesResult = {
  mode: "body",
  hits: [],
};

export type NoteSearchState = SearchNotesResult & {
  error: boolean;
  /** 現在の query に対する invoke 実行中 */
  pending: boolean;
  /** hits が対応する検索語（未完了・空 query では ""） */
  searchedQuery: string;
};

export const EMPTY_NOTE_SEARCH_STATE: NoteSearchState = {
  ...EMPTY_SEARCH_NOTES_RESULT,
  error: false,
  pending: false,
  searchedQuery: "",
};

export function isTagSearchMode(mode: SearchMode): boolean {
  return mode === "tag";
}

export function isMixedSearchMode(mode: SearchMode): boolean {
  return mode === "mixed";
}

/** 行ジャンプ付きで開けるヒット（本文 / タグ+本文） */
export function isLineSearchHit(hit: SearchHit): boolean {
  return hit.mode === "body" || hit.mode === "mixed";
}

export function isTagSearchHit(hit: SearchHit): boolean {
  return hit.mode === "tag";
}

/** typo 許容の fuzzy 本文語でヒットした（`SearchHit.score` が付与されている） */
export function isFuzzySearchHit(hit: SearchHit): boolean {
  return typeof hit.score === "number" && Number.isFinite(hit.score);
}

export type NoteDetail = {
  path: string;
  title: string;
  pinned: boolean;
  systemNote: boolean;
  tags: string[];
  charCount: number;
  updatedMs: number;
  createdMs: number;
  preview: string;
};

export type ReplaceTagGloballyResult = {
  filesChanged: number;
  changedPaths: string[];
  templateTags: string[];
};
