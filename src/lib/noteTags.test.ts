import { describe, expect, it } from "vitest";
import {
  DEFAULT_NEW_NOTE_TAG,
  dedupeTagsCaseInsensitive,
  ensureLockedInboxInTemplateTags,
  getMarkdownBody,
  getMarkdownBodyStartOffset,
  getOrphanTags,
  parseNoteContent,
  toggleTagInContent,
} from "@/lib/noteTags";

describe("parseNoteContent", () => {
  it("parses frontmatter tags array syntax", () => {
    const raw = "---\ntags: [work, draft]\n---\n\n# Title\n";
    expect(parseNoteContent(raw)).toMatchObject({
      hasFrontmatter: true,
      tags: ["work", "draft"],
      body: "# Title\n",
    });
  });

  it("parses comma-separated tags", () => {
    const raw = "---\ntags: work, draft\n---\n\nbody";
    expect(parseNoteContent(raw).tags).toEqual(["work", "draft"]);
  });

  it("returns full text as body when no frontmatter", () => {
    expect(parseNoteContent("# Hello")).toMatchObject({
      hasFrontmatter: false,
      tags: [],
      body: "# Hello",
    });
  });
});

describe("getMarkdownBody", () => {
  it("strips frontmatter", () => {
    const raw = "---\ntags: []\n---\n\nvisible";
    expect(getMarkdownBody(raw)).toBe("visible");
  });
});

describe("getMarkdownBodyStartOffset", () => {
  it("returns offset after closing ---", () => {
    const raw = "---\ntags: []\n---\n\nbody";
    expect(getMarkdownBodyStartOffset(raw)).toBe(getMarkdownBody(raw).length > 0 ? raw.indexOf("body") : 0);
    expect(raw.slice(getMarkdownBodyStartOffset(raw))).toBe("body");
  });

  it("returns 0 without frontmatter", () => {
    expect(getMarkdownBodyStartOffset("plain")).toBe(0);
  });
});

describe("dedupeTagsCaseInsensitive", () => {
  it("keeps first casing", () => {
    expect(dedupeTagsCaseInsensitive(["Work", "work", "WORK"])).toEqual(["Work"]);
  });
});

describe("ensureLockedInboxInTemplateTags", () => {
  it("puts inbox first and removes duplicates", () => {
    expect(ensureLockedInboxInTemplateTags(["draft", "inbox", "work"])).toEqual([
      DEFAULT_NEW_NOTE_TAG,
      "draft",
      "work",
    ]);
  });
});

describe("getOrphanTags", () => {
  it("lists tags in use but not in template", () => {
    expect(getOrphanTags(["inbox", "work"], ["work", "orphan"])).toEqual(["orphan"]);
  });
});

describe("toggleTagInContent", () => {
  it("adds frontmatter tags when missing", () => {
    const next = toggleTagInContent("hello", "work");
    expect(parseNoteContent(next).tags).toContain("work");
    expect(getMarkdownBody(next)).toBe("hello");
  });

  it("removes inbox when another tag is added", () => {
    const raw = "---\ntags: inbox\n---\n\nbody";
    const next = toggleTagInContent(raw, "work");
    const tags = parseNoteContent(next).tags.map((t) => t.toLowerCase());
    expect(tags).toContain("work");
    expect(tags).not.toContain(DEFAULT_NEW_NOTE_TAG);
  });

  it("restores inbox when last non-inbox tag is removed", () => {
    const raw = "---\ntags: work\n---\n\nbody";
    const next = toggleTagInContent(raw, "work");
    expect(parseNoteContent(next).tags).toEqual([DEFAULT_NEW_NOTE_TAG]);
  });
});
