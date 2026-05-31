/** メモ path の比較用（Windows の `\` / 大文字小文字を揃える） */
export function normalizeNotePath(path: string): string {
  return path.replace(/\\/g, "/").toLowerCase();
}

/** パスからファイル名部分を取り出す */
export function fileNameFromPath(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || path;
}
