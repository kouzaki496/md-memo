/** 更新日時 → 作成日時の順で新しいものを先に並べる */
export function compareNoteRecency(
  a: { updatedMs: number; createdMs: number },
  b: { updatedMs: number; createdMs: number }
): number {
  if (b.updatedMs !== a.updatedMs) return b.updatedMs - a.updatedMs;
  return b.createdMs - a.createdMs;
}
