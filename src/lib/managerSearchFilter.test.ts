import { describe, expect, it } from "vitest";
import { noteDetailsFromSearchHits } from "@/lib/managerSearchFilter";
import type { NoteDetail, NoteMeta, SearchHit } from "@/types/note";

const meta = (path: string, overrides: Partial<NoteMeta> = {}): NoteMeta => ({
  path,
  title: path.split("/").pop() ?? path,
  pinned: false,
  systemNote: false,
  tags: [],
  updatedMs: 100,
  createdMs: 50,
  ...overrides,
});

const detail = (path: string, preview = ""): NoteDetail => ({
  ...meta(path),
  charCount: preview.length,
  preview,
});

const hit = (path: string, overrides: Partial<SearchHit> = {}): SearchHit => ({
  path,
  line: 1,
  text: "snippet",
  mode: "body",
  score: null,
  ...overrides,
});

describe("noteDetailsFromSearchHits", () => {
  it("prefers noteDetails over notes list", () => {
    const notes = [meta("C:/notes/a.md")];
    const noteDetails = [detail("C:/notes/a.md", "from detail")];
    const rows = noteDetailsFromSearchHits(noteDetails, notes, [hit("C:/notes/a.md")]);
    expect(rows[0]?.preview).toBe("from detail");
  });

  it("matches paths case-insensitively on Windows-style paths", () => {
    const notes = [meta("C:/Notes/A.md")];
    const rows = noteDetailsFromSearchHits([], notes, [hit("c:/notes/a.md")]);
    expect(rows[0]?.path).toBe("C:/Notes/A.md");
  });

  it("synthesizes row from hit when note is not in lists", () => {
    const rows = noteDetailsFromSearchHits([], [], [hit("C:/notes/new.md")]);
    expect(rows[0]).toMatchObject({
      path: "C:/notes/new.md",
      preview: "snippet",
    });
  });

  it("marks fuzzy hits only", () => {
    const notes = [meta("C:/notes/a.md"), meta("C:/notes/b.md")];
    const noteDetails = [detail("C:/notes/a.md"), detail("C:/notes/b.md")];
    const hits = [
      hit("C:/notes/a.md", { score: 0.9 }),
      hit("C:/notes/b.md", { score: null }),
    ];
    const rows = noteDetailsFromSearchHits(noteDetails, notes, hits);
    expect(rows.find((r) => r.path.endsWith("a.md"))?.searchFuzzy).toBe(true);
    expect(rows.find((r) => r.path.endsWith("b.md"))?.searchFuzzy).toBe(false);
  });

  it("returns one row per hit in order and dedupes by path", () => {
    const notes = [meta("C:/notes/a.md"), meta("C:/notes/b.md")];
    const noteDetails = [detail("C:/notes/a.md"), detail("C:/notes/b.md")];
    const hits = [
      hit("C:/notes/b.md", { score: 0.85 }),
      hit("C:/notes/a.md"),
      hit("C:/notes/b.md", { score: 0.85 }),
    ];
    const rows = noteDetailsFromSearchHits(noteDetails, notes, hits);
    expect(rows.map((r) => r.path)).toEqual(["C:/notes/b.md", "C:/notes/a.md"]);
    expect(rows[0].searchFuzzy).toBe(true);
    expect(rows[1].searchFuzzy).toBe(false);
  });
});
