import { describe, expect, it } from "vitest";
import { bodyHighlightNeedles, parseBodyHighlightTerms } from "@/lib/searchQueryParse";

describe("parseBodyHighlightTerms", () => {
  it("excludes #tag words from body highlight terms", () => {
    expect(parseBodyHighlightTerms("#work meetng")).toEqual([
      { text: "meetng", exact: false },
    ]);
  });

  it("parses quoted exact phrase", () => {
    expect(parseBodyHighlightTerms('"hello world"')).toEqual([
      { text: "hello world", exact: true },
    ]);
  });

  it("parses mixed tag exclusion and quoted phrase (Rust: parse_raw_terms_mixed)", () => {
    expect(parseBodyHighlightTerms('#work "weekly report" meetng')).toEqual([
      { text: "weekly report", exact: true },
      { text: "meetng", exact: false },
    ]);
  });

  it("treats unclosed quote as exact to end (Rust: parse_raw_terms_unclosed_quote_to_end)", () => {
    expect(parseBodyHighlightTerms('"hello world')).toEqual([
      { text: "hello world", exact: true },
    ]);
  });

  it("skips empty quoted term (Rust: empty_quoted_term_is_skipped)", () => {
    expect(parseBodyHighlightTerms('""')).toEqual([]);
  });

  it('keeps # inside quotes as body term (Rust: quoted_hash_is_body_not_tag)', () => {
    expect(parseBodyHighlightTerms('"#work"')).toEqual([{ text: "#work", exact: true }]);
  });

  it("returns empty for whitespace-only query", () => {
    expect(parseBodyHighlightTerms("   ")).toEqual([]);
  });
});

describe("bodyHighlightNeedles", () => {
  it("maps terms to plain strings", () => {
    expect(
      bodyHighlightNeedles([
        { text: "weekly report", exact: true },
        { text: "meetng", exact: false },
      ])
    ).toEqual(["weekly report", "meetng"]);
  });
});
