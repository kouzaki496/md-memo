import { describe, expect, it } from "vitest";
import {
  applyBoldToggle,
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
