import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_NEW_NOTE_TAG,
  dedupeTagsCaseInsensitive,
  ensureLockedInboxInTemplateTags,
  getMarkdownBody,
  getMarkdownBodyStartOffset,
  normalizeInboxExclusiveTags,
  parseNoteContent,
  rebuildNoteFrontmatterTags,
  replaceTagTokenInList,
  toggleTagInContent,
} from "@/lib/noteTags";
import {
  BUILTIN_RESERVED_TAG,
  BUILTIN_TAGS_REFERENCE,
  BUILTIN_TAGS_SHORTCUTS,
  isBuiltinReservedTagName,
  REFERENCE_PURPOSE_TAG,
  SHORTCUTS_PURPOSE_TAG,
} from "@/lib/reservedTags";

type FrontmatterContract = {
  version: number;
  constants: { inboxTag: string };
  reservedTags: {
    builtinReservedTag: string;
    referencePurposeTag: string;
    shortcutsPurposeTag: string;
    builtinTagsReference: string[];
    builtinTagsShortcuts: string[];
  };
  isBuiltinReservedTag: Array<{ id: string; tag: string; reserved: boolean }>;
  parseContentTags: Array<{ id: string; content: string; tags: string[] }>;
  parseNoteContent: Array<{
    id: string;
    content: string;
    hasFrontmatter: boolean;
    tags: string[];
    body: string;
  }>;
  markdownBody: Array<{ id: string; content: string; body: string }>;
  markdownBodyStartOffset: Array<{ id: string; content: string; offset: number }>;
  dedupeTags: Array<{ id: string; input: string[]; output: string[] }>;
  normalizeInboxExclusive: Array<{ id: string; input: string[]; output: string[] }>;
  ensureLockedInboxFirst: Array<{ id: string; input: string[]; output: string[] }>;
  applyTagRename: Array<{
    id: string;
    input: string[];
    from: string;
    to: string;
    output: string[];
  }>;
  toggleTag: Array<{ id: string; content: string; tag: string; tags: string[] }>;
  rebuildTags: Array<{ id: string; content: string; nextTags: string[]; tags: string[] }>;
};

const contractPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../docs/frontmatter-contract.json"
);
const contract = JSON.parse(readFileSync(contractPath, "utf8")) as FrontmatterContract;

function tagsAfterToggle(content: string, tag: string): string[] {
  return parseNoteContent(toggleTagInContent(content, tag)).tags;
}

function tagsAfterRebuild(content: string, nextTags: string[]): string[] {
  const rebuilt = rebuildNoteFrontmatterTags(content, nextTags);
  expect(rebuilt).not.toBeNull();
  return parseNoteContent(rebuilt!).tags;
}

/** docs/frontmatter-contract.json — FE 側契約テスト（Rust: notes/frontmatter_contract.rs） */
describe("frontmatter contract (FE)", () => {
  it("constants match docs/frontmatter-contract.json", () => {
    expect(DEFAULT_NEW_NOTE_TAG).toBe(contract.constants.inboxTag);
  });

  describe("reservedTags", () => {
    it("matches docs/frontmatter-contract.json", () => {
      expect(BUILTIN_RESERVED_TAG).toBe(contract.reservedTags.builtinReservedTag);
      expect(REFERENCE_PURPOSE_TAG).toBe(contract.reservedTags.referencePurposeTag);
      expect(SHORTCUTS_PURPOSE_TAG).toBe(contract.reservedTags.shortcutsPurposeTag);
      expect([...BUILTIN_TAGS_REFERENCE]).toEqual(contract.reservedTags.builtinTagsReference);
      expect([...BUILTIN_TAGS_SHORTCUTS]).toEqual(contract.reservedTags.builtinTagsShortcuts);
    });
  });

  describe("isBuiltinReservedTag", () => {
    it.each(contract.isBuiltinReservedTag)("$id", ({ tag, reserved }) => {
      expect(isBuiltinReservedTagName(tag)).toBe(reserved);
    });
  });

  describe("parseContentTags", () => {
    it.each(contract.parseContentTags)("$id", ({ content, tags }) => {
      expect(parseNoteContent(content).tags).toEqual(tags);
    });
  });

  describe("parseNoteContent", () => {
    it.each(contract.parseNoteContent)("$id", ({ content, hasFrontmatter, tags, body }) => {
      expect(parseNoteContent(content)).toMatchObject({ hasFrontmatter, tags, body });
    });
  });

  describe("markdownBody", () => {
    it.each(contract.markdownBody)("$id", ({ content, body }) => {
      expect(getMarkdownBody(content)).toBe(body);
    });
  });

  describe("markdownBodyStartOffset", () => {
    it.each(contract.markdownBodyStartOffset)("$id", ({ content, offset }) => {
      expect(getMarkdownBodyStartOffset(content)).toBe(offset);
    });
  });

  describe("dedupeTags", () => {
    it.each(contract.dedupeTags)("$id", ({ input, output }) => {
      expect(dedupeTagsCaseInsensitive(input)).toEqual(output);
    });
  });

  describe("normalizeInboxExclusive", () => {
    it.each(contract.normalizeInboxExclusive)("$id", ({ input, output }) => {
      expect(normalizeInboxExclusiveTags(input)).toEqual(output);
    });
  });

  describe("ensureLockedInboxFirst", () => {
    it.each(contract.ensureLockedInboxFirst)("$id", ({ input, output }) => {
      expect(ensureLockedInboxInTemplateTags(input)).toEqual(output);
    });
  });

  describe("applyTagRename", () => {
    it.each(contract.applyTagRename)("$id", ({ input, from, to, output }) => {
      expect(replaceTagTokenInList(input, from, to)).toEqual(output);
    });
  });

  describe("toggleTag", () => {
    it.each(contract.toggleTag)("$id", ({ content, tag, tags }) => {
      expect(tagsAfterToggle(content, tag)).toEqual(tags);
    });
  });

  describe("rebuildTags", () => {
    it.each(contract.rebuildTags)("$id", ({ content, nextTags, tags }) => {
      expect(tagsAfterRebuild(content, nextTags)).toEqual(tags);
    });
  });
});
