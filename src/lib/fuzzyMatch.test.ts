import { describe, expect, it } from "vitest";
import {
  MIN_FUZZY_TERM_LEN,
  exactSubstringHighlightRanges,
  fuzzyWordHighlightRanges,
  splitWordsWithRanges,
} from "@/lib/fuzzyMatch";

describe("splitWordsWithRanges", () => {
  it("splits on whitespace and separators", () => {
    expect(splitWordsWithRanges("weekly meeting-notes")).toEqual([
      { word: "weekly", start: 0, end: 6 },
      { word: "meeting", start: 7, end: 14 },
      { word: "notes", start: 15, end: 20 },
    ]);
  });
});

describe("fuzzyWordHighlightRanges", () => {
  it("matches typo (Rust: fuzzy_line_matcher_matches_typo)", () => {
    const ranges = fuzzyWordHighlightRanges("weekly meeting notes", "meetng");
    expect(ranges).toHaveLength(1);
    expect(ranges[0]).toEqual({ start: 7, end: 14 });
  });

  it("rejects typo beyond edit budget (Rust: meetngs)", () => {
    expect(fuzzyWordHighlightRanges("weekly meeting notes", "meetngs")).toEqual([]);
  });

  it("highlights short terms via exact substring (Rust: fuzzy_line_matcher_short_term)", () => {
    expect(fuzzyWordHighlightRanges("go to it", "it")).toEqual([{ start: 6, end: 8 }]);
    expect(fuzzyWordHighlightRanges("go to at", "it")).toEqual([]);
    expect(MIN_FUZZY_TERM_LEN).toBe(3);
  });

  it("respects case when term has uppercase (Rust: case_sensitive)", () => {
    expect(fuzzyWordHighlightRanges("hello world", "Hello")).toEqual([]);
    expect(fuzzyWordHighlightRanges("Hello World", "Hello")).toEqual([{ start: 0, end: 5 }]);
  });

  it("returns empty for empty term", () => {
    expect(fuzzyWordHighlightRanges("hello", "")).toEqual([]);
  });
});

describe("exactSubstringHighlightRanges", () => {
  it("matches case-insensitively by default", () => {
    expect(exactSubstringHighlightRanges("Hello World", "hello")).toEqual([{ start: 0, end: 5 }]);
    expect(exactSubstringHighlightRanges("hello world", "Hello")).toEqual([]);
  });
});
