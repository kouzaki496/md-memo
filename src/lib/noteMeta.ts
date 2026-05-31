import { fileNameFromPath } from "@/lib/notePath";
import { isSystemNotePath } from "@/lib/systemNotes";
import type { NoteDetail, NoteMeta } from "@/types/note";

/** path から NoteMeta を解決（一覧 → 詳細 → 合成） */
export function noteMetaFromPath(
  path: string,
  notes: NoteMeta[],
  noteDetails: NoteDetail[]
): NoteMeta {
  const fromNotes = notes.find((n) => n.path === path);
  if (fromNotes) return fromNotes;

  const fromDetail = noteDetails.find((n) => n.path === path);
  if (fromDetail) {
    return {
      path: fromDetail.path,
      title: fromDetail.title,
      pinned: fromDetail.pinned,
      systemNote: fromDetail.systemNote,
      tags: fromDetail.tags,
      updatedMs: fromDetail.updatedMs,
      createdMs: fromDetail.createdMs,
    };
  }

  return {
    path,
    title: fileNameFromPath(path),
    pinned: false,
    systemNote: isSystemNotePath(path),
    tags: [],
    updatedMs: 0,
    createdMs: 0,
  };
}
