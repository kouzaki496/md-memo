/** メモ path の比較用（Windows の `\` / 大文字小文字を揃える） */
export function normalizeNotePath(path: string): string {
  return path.replace(/\\/g, "/").toLowerCase();
}
