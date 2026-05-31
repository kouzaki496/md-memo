import { messages } from "@/lib/messages";

/** アプリ組込メモ用の予約タグ（ユーザーがテンプレート等で使えない） */
export const BUILTIN_RESERVED_TAG = "_builtin";

export const SHORTCUTS_PURPOSE_TAG = "shortcuts";
export const REFERENCE_PURPOSE_TAG = "reference";

export const BUILTIN_TAGS_SHORTCUTS = [BUILTIN_RESERVED_TAG, SHORTCUTS_PURPOSE_TAG] as const;
export const BUILTIN_TAGS_REFERENCE = [BUILTIN_RESERVED_TAG, REFERENCE_PURPOSE_TAG] as const;

export const RESERVED_TAG_MESSAGE = messages.tags.builtinReserved;

export function isBuiltinReservedTagName(tag: string): boolean {
  return tag.trim().replace(/^#+/, "").toLowerCase() === BUILTIN_RESERVED_TAG.toLowerCase();
}

/** @deprecated alias */
export function isReservedTagName(tag: string): boolean {
  return isBuiltinReservedTagName(tag);
}

/** チップ操作で予約タグを触ろうとしたときの案内 */
export function getReservedTagBlockedMessage(_content: string, rawTag: string): string | null {
  const normalized = rawTag.trim().replace(/^#+/, "");
  if (!normalized || !isBuiltinReservedTagName(normalized)) return null;
  return RESERVED_TAG_MESSAGE;
}

export function formatBuiltinTagsLine(tags: readonly string[]): string {
  return `tags: ${tags.join(", ")}`;
}
