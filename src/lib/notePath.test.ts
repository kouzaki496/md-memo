import { describe, expect, it } from "vitest";
import { fileNameFromPath, normalizeNotePath } from "@/lib/notePath";

describe("normalizeNotePath", () => {
  it("normalizes separators and case", () => {
    expect(normalizeNotePath("C:\\Notes\\A.md")).toBe("c:/notes/a.md");
  });
});

describe("fileNameFromPath", () => {
  it("returns basename from windows path", () => {
    expect(fileNameFromPath("C:\\notes\\weekly.md")).toBe("weekly.md");
  });

  it("returns path itself when no separator", () => {
    expect(fileNameFromPath("memo.md")).toBe("memo.md");
  });
});
