import { normalizeNotePath } from "@/lib/notePath";
import { isSystemNotePath } from "@/lib/systemNotes";
import type { NoteDetail, NoteMeta, SearchHit } from "@/types/note";
import { isFuzzySearchHit } from "@/types/note";

/** 一覧管理の 1 行（検索中の fuzzy ヒット表示用） */
export type ManagerNoteRow = NoteDetail & {
  searchFuzzy?: boolean;
};

function basename(path: string): string {
  const parts = normalizeNotePath(path).split("/");
  return parts[parts.length - 1] ?? path;
}

function noteDetailFromMeta(meta: NoteMeta, preview = ""): NoteDetail {
  return {
    path: meta.path,
    title: meta.title,
    pinned: meta.pinned,
    systemNote: meta.systemNote,
    tags: meta.tags,
    charCount: 0,
    updatedMs: meta.updatedMs,
    createdMs: meta.createdMs,
    preview,
  };
}

function noteDetailFromHit(hit: SearchHit): NoteDetail {
  const title = basename(hit.path);
  return {
    path: hit.path,
    title,
    pinned: false,
    systemNote: isSystemNotePath(hit.path),
    tags: [],
    charCount: 0,
    updatedMs: 0,
    createdMs: 0,
    preview: hit.text,
  };
}

function findInList<T extends { path: string }>(items: T[], hitPath: string): T | undefined {
  const key = normalizeNotePath(hitPath);
  for (const item of items) {
    if (normalizeNotePath(item.path) === key) {
      return item;
    }
  }

  const hitName = basename(hitPath);
  const byName = items.filter((item) => basename(item.path) === hitName);
  if (byName.length === 1) {
    return byName[0];
  }

  return undefined;
}

/** 検索ヒット path に対応する NoteDetail を探す（detail → meta → ヒットから合成） */
export function findNoteDetailForHit(
  noteDetails: NoteDetail[],
  notes: NoteMeta[],
  hitPath: string,
  hit?: SearchHit
): NoteDetail | undefined {
  const detail = findInList(noteDetails, hitPath);
  if (detail) return detail;

  const meta = findInList(notes, hitPath);
  if (meta) return noteDetailFromMeta(meta, hit?.text ?? "");

  if (hit) return noteDetailFromHit(hit);
  return undefined;
}

/** あいまいヒットした path（ヒット path と解決後 detail path の両方） */
export function fuzzyPathsFromSearchHits(
  noteDetails: NoteDetail[],
  notes: NoteMeta[],
  hits: SearchHit[]
): Set<string> {
  const out = new Set<string>();
  for (const hit of hits) {
    if (!isFuzzySearchHit(hit)) continue;
    out.add(normalizeNotePath(hit.path));
    const detail = findNoteDetailForHit(noteDetails, notes, hit.path, hit);
    if (detail) {
      out.add(normalizeNotePath(detail.path));
    }
  }
  return out;
}

/** 検索ヒット順に NoteDetail を並べる（ヒット 1 件 = メモ 1 行） */
export function noteDetailsFromSearchHits(
  noteDetails: NoteDetail[],
  notes: NoteMeta[],
  hits: SearchHit[],
  fuzzyPaths?: Set<string>
): ManagerNoteRow[] {
  const out: ManagerNoteRow[] = [];
  const seen = new Set<string>();
  const fuzzy = fuzzyPaths ?? fuzzyPathsFromSearchHits(noteDetails, notes, hits);

  for (const hit of hits) {
    const key = normalizeNotePath(hit.path);
    if (seen.has(key)) continue;
    seen.add(key);

    const detail = findNoteDetailForHit(noteDetails, notes, hit.path, hit);
    if (detail) {
      out.push({
        ...detail,
        searchFuzzy: fuzzy.has(normalizeNotePath(detail.path)),
      });
    }
  }

  return out;
}
