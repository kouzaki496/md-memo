/** アプリが自動生成・管理する閲覧専用メモ（ファイル名） */
export const SYSTEM_NOTE_FILE_NAMES = ["editor-shortcuts.md"] as const;

export function isSystemNoteFileName(fileName: string): boolean {
  const base = fileName.replace(/^.*[/\\]/, "").toLowerCase();
  return SYSTEM_NOTE_FILE_NAMES.some((name) => name.toLowerCase() === base);
}

export function isSystemNotePath(path: string | null | undefined): boolean {
  if (!path) return false;
  return isSystemNoteFileName(path);
}
