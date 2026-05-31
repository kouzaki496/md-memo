import { normalizeNotePath } from "@/lib/notePath";
import { isSystemNotePath } from "@/lib/systemNotes";
import type { NoteDetail, NoteMeta, SearchHit } from "@/types/note";

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

/** 検索ヒット順に NoteDetail を並べる（ヒット 1 件 = メモ 1 行） */
export function noteDetailsFromSearchHits(
  noteDetails: NoteDetail[],
  notes: NoteMeta[],
  hits: SearchHit[]
): NoteDetail[] {
  const out: NoteDetail[] = [];
  const seen = new Set<string>();

  for (const hit of hits) {
    const key = normalizeNotePath(hit.path);
    if (seen.has(key)) continue;
    seen.add(key);

    const detail = findNoteDetailForHit(noteDetails, notes, hit.path, hit);
    if (detail) {
      out.push(detail);
    }
  }

  return out;
}
