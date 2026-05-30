/** メモ先頭の YAML フロントマターから tags を読み書き（本文は見出しと衝突しない） */

import {
  getReservedTagBlockedMessage,
  isBuiltinReservedTagName,
} from "@/lib/reservedTags";
import type { NoteMeta } from "@/types/note";

/** 受信箱タグ（大文字小文字は区別しない）。他タグが 1 つでもあれば外し、タグが無ければこれだけにする */
export const DEFAULT_NEW_NOTE_TAG = "inbox";

import { messages } from "@/lib/messages";

/** 他タグがある状態で inbox を追加しようとしたときの案内（ステータス表示用） */
export const INBOX_EXCLUSIVE_MESSAGE = messages.tags.inboxExclusive;

export function isInboxTagName(tag: string): boolean {
  return tag.trim().replace(/^#+/, "").toLowerCase() === DEFAULT_NEW_NOTE_TAG.toLowerCase();
}

/**
 * チップで inbox を「追加」しようとしたが、すでに別タグが付いているときだけメッセージを返す。
 * 削除（inbox を外す）や、他タグが無いときの追加は null。
 */
export function getInboxAddBlockedMessage(content: string, rawTag: string): string | null {
  const normalized = rawTag.trim().replace(/^#+/, "");
  if (!normalized || !isInboxTagName(normalized)) return null;
  const p = parseNoteContent(content);
  const hasThis = p.tags.some((t) => t.toLowerCase() === normalized.toLowerCase());
  if (hasThis) return null;
  const hasOther = p.tags.some((t) => t.toLowerCase() !== DEFAULT_NEW_NOTE_TAG.toLowerCase());
  if (hasOther) return INBOX_EXCLUSIVE_MESSAGE;
  return null;
}

/** inbox / 予約タグの操作をブロックするときの案内 */
export function getTagToggleBlockedMessage(content: string, rawTag: string): string | null {
  return getInboxAddBlockedMessage(content, rawTag) ?? getReservedTagBlockedMessage(content, rawTag);
}

/** テンプレート一覧の先頭に固定の inbox を 1 つだけ置く（予約タグは除外） */
export function ensureLockedInboxInTemplateTags(templateTags: string[]): string[] {
  const rest = templateTags.filter((t) => !isInboxTagName(t) && !isBuiltinReservedTagName(t));
  return [DEFAULT_NEW_NOTE_TAG, ...rest];
}

/** 全メモのフロントマター tags を重複除去して収集 */
export function collectTagsFromNotes(notes: Pick<NoteMeta, "tags">[]): string[] {
  return dedupeTagsCaseInsensitive(notes.flatMap((n) => n.tags));
}

/**
 * 2つのタグ一覧をマージ（永続化はしない）。エディタのチップ用。
 * inbox は先頭固定、`_builtin` は含めない。
 */
export function mergeTagLists(primary: string[], secondary: string[]): string[] {
  const base = ensureLockedInboxInTemplateTags(primary);
  const seen = new Set(base.map((t) => t.toLowerCase()));
  const additions: string[] = [];

  for (const tag of secondary) {
    if (isInboxTagName(tag) || isBuiltinReservedTagName(tag)) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    additions.push(tag);
  }

  additions.sort((a, b) => a.localeCompare(b, "ja"));
  return [...base, ...additions];
}

/** @deprecated use mergeTagLists */
export function mergeDiscoveredTemplateTags(templateTags: string[], discoveredTags: string[]): string[] {
  return mergeTagLists(templateTags, discoveredTags);
}

/** テンプレートに未登録だが、いずれかのメモで使用中のタグ */
export function getOrphanTags(templateTags: string[], tagsInUse: string[]): string[] {
  const registered = new Set(ensureLockedInboxInTemplateTags(templateTags).map((t) => t.toLowerCase()));
  return tagsInUse
    .filter((tag) => {
      if (isInboxTagName(tag) || isBuiltinReservedTagName(tag)) return false;
      return !registered.has(tag.toLowerCase());
    })
    .sort((a, b) => a.localeCompare(b, "ja"));
}

export function countNotesWithTag(notes: Pick<NoteMeta, "tags">[], tag: string): number {
  const key = tag.toLowerCase();
  return notes.filter((n) => n.tags.some((t) => t.toLowerCase() === key)).length;
}

export function buildEditorTagChips(templateTags: string[], noteTags: string[]): string[] {
  return mergeTagLists(templateTags, noteTags);
}

/** Inbox 以外が 1 つでもあれば Inbox を全て外す。それ以外は Inbox のみ */
function normalizeInboxExclusiveTags(tags: string[]): string[] {
  const inboxL = DEFAULT_NEW_NOTE_TAG.toLowerCase();
  const withoutInbox = tags.filter((t) => t.toLowerCase() !== inboxL);
  if (withoutInbox.length > 0) {
    return withoutInbox;
  }
  return [DEFAULT_NEW_NOTE_TAG];
}

export type ParsedNoteContent = {
  hasFrontmatter: boolean;
  /** `---` と `---` の間の生テキスト（末尾改行なし） */
  frontmatterRaw: string;
  tags: string[];
  /** フロントマター以降の本文 */
  body: string;
};

function parseTagsFromFrontmatter(fm: string): string[] {
  const line = fm.split(/\r?\n/).find((l) => /^\s*tags\s*:/i.test(l));
  if (!line) return [];
  const val = line.replace(/^\s*tags\s*:\s*/i, "").trim();
  if (val.startsWith("[") && val.endsWith("]")) {
    const inner = val.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
  }
  return val.split(",").map((s) => s.trim()).filter(Boolean);
}

export function parseNoteContent(raw: string): ParsedNoteContent {
  // 終端の `---` の直後に本文がなくてもマッチさせる（`---\ntags: x\n---` のみなど）
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n([\s\S]*))?$/);
  if (!m) {
    return { hasFrontmatter: false, frontmatterRaw: "", tags: [], body: raw };
  }
  return {
    hasFrontmatter: true,
    frontmatterRaw: m[1],
    tags: parseTagsFromFrontmatter(m[1]),
    body: m[2] ?? "",
  };
}

/** プレビュー・検索ハイライト用にフロントマターを除いた本文 */
export function getMarkdownBody(raw: string): string {
  return parseNoteContent(raw).body;
}

/**
 * `getMarkdownBody(raw)` と同じ本文先頭が `raw` 内で始まるインデックス。
 * フロントマターが無いときは 0。
 */
export function getMarkdownBodyStartOffset(raw: string): number {
  const m = raw.match(/^---\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n)?/);
  if (!m) return 0;
  return m[0].length;
}

/** タグ名の配列で、大文字小文字同一視して重複を除く（先勝ち） */
export function dedupeTagsCaseInsensitive(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    const k = t.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(t);
    }
  }
  return out;
}

/** タグ一覧のうち `from` と同一視できる名前をすべて `to` に差し替え（トリム後を比較） */
export function replaceTagTokenInList(tags: string[], from: string, to: string): string[] {
  const f = from.trim().toLowerCase();
  const toVal = to.trim();
  return tags.map((t) => (t.toLowerCase() === f ? toVal : t));
}

export function toggleTagInContent(raw: string, tag: string): string {
  const normalized = tag.trim().replace(/^#+/, "");
  if (!normalized) return raw;
  if (isBuiltinReservedTagName(normalized)) return raw;

  const p = parseNoteContent(raw);
  const baseBody = p.hasFrontmatter ? p.body : raw;

  let nextTags = [...p.tags];
  const idx = nextTags.findIndex((t) => t.toLowerCase() === normalized.toLowerCase());
  if (idx >= 0) nextTags.splice(idx, 1);
  else nextTags.push(normalized);

  nextTags = normalizeInboxExclusiveTags(nextTags);

  const fmLines = p.hasFrontmatter
    ? p.frontmatterRaw.split(/\r?\n/).filter((l) => !/^\s*tags\s*:/i.test(l)).filter((l) => l.trim().length > 0)
    : [];

  fmLines.push(`tags: ${nextTags.join(", ")}`);
  return `---\n${fmLines.join("\n")}\n---\n${baseBody}`;
}
