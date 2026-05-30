/** すべての語が `#` で始まるときタグ検索（Rust search_notes と同条件） */
export function isTagSearchQuery(query: string): boolean {
  const terms = query.trim().split(/\s+/).filter(Boolean);
  return terms.length > 0 && terms.every((t) => t.startsWith("#"));
}
