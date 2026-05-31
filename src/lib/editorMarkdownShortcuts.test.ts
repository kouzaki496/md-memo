import { describe, expect, it } from "vitest";
import {
  applyBoldToggle,
  applyInsertTable,
  applyListTransform,
  detectListKind,
  findNextOccurrence,
} from "@/lib/editorMarkdownShortcuts";

describe("applyBoldToggle", () => {
  it("wraps selection with **", () => {
    const res = applyBoldToggle("hello world", 6, 11);
    expect(res.text).toBe("hello **world**");
    expect(res.selectionStart).toBe(8);
    expect(res.selectionEnd).toBe(13);
  });

  it("unwraps bold selection", () => {
    const res = applyBoldToggle("hello **world**", 6, 15);
    expect(res.text).toBe("hello world");
  });
});

describe("detectListKind", () => {
  it("detects task list", () => {
    expect(detectListKind("- [ ] a\n- [x] b")).toBe("task");
  });

  it("detects ordered list", () => {
    expect(detectListKind("1. a\n2. b")).toBe("ordered");
  });
});

describe("applyListTransform", () => {
  it("converts plain lines to unordered", () => {
    const res = applyListTransform("a\nb", 0, 3, "unordered");
    expect(res.text).toBe("- a\n- b");
  });
});

describe("findNextOccurrence", () => {
  it("finds next match after selection", () => {
    const text = "foo bar foo";
    const next = findNextOccurrence(text, 0, 3);
    expect(next).toEqual({ selectionStart: 8, selectionEnd: 11 });
  });
});

describe("applyInsertTable", () => {
  it("inserts a GFM table and selects the first header cell", () => {
    const res = applyInsertTable("hello", 5, 5);
    expect(res.text).toContain("| 列1 | 列2 | 列3 |");
    expect(res.text).toContain("| --- | --- | --- |");
    expect(res.text.slice(res.selectionStart, res.selectionEnd)).toBe("列1");
  });

  it("adds a trailing newline before the next line when needed", () => {
    const res = applyInsertTable("line one\nline two", 8, 8);
    expect(res.text).toBe(
      "line one\n| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |\n\nline two"
    );
  });

  it("adds blank lines when inserting mid-paragraph", () => {
    const res = applyInsertTable("line one line two", 8, 8);
    expect(res.text).toContain("line one\n| 列1");
    expect(res.text).toContain("|  |  |  |\n\n line two");
  });

  it("replaces selected text with a table", () => {
    const res = applyInsertTable("remove me", 0, 9);
    expect(res.text.startsWith("| 列1 |")).toBe(true);
    expect(res.text).not.toContain("remove me");
  });
});
