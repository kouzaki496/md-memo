import { describe, expect, it } from "vitest";
import { noteMetaFromPath } from "@/lib/noteMeta";
import type { NoteMeta } from "@/types/note";

const notes: NoteMeta[] = [
  {
    path: "C:/notes/a.md",
    title: "A",
    pinned: true,
    systemNote: false,
    tags: ["work"],
    updatedMs: 1,
    createdMs: 1,
  },
];

describe("noteMetaFromPath", () => {
  it("prefers notes list", () => {
    expect(noteMetaFromPath("C:/notes/a.md", notes, []).title).toBe("A");
  });

  it("synthesizes from path when unknown", () => {
    expect(noteMetaFromPath("C:/notes/b.md", notes, []).title).toBe("b.md");
  });
});
