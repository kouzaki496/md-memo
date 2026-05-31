import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  MAX_EDIT_RATIO,
  MIN_FUZZY_SCORE,
  MIN_FUZZY_TERM_LEN,
  fuzzyWordHighlightRanges,
  splitWordsWithRanges,
} from "@/lib/fuzzyMatch";
import { parseBodyHighlightTerms } from "@/lib/searchQueryParse";

type BodyTerm = { text: string; exact: boolean };

type SearchContract = {
  version: number;
  constants: {
    minFuzzyTermLen: number;
    minFuzzyScore: number;
    maxEditRatio: number;
  };
  bodyHighlightTerms: Array<{ id: string; query: string; terms: BodyTerm[] }>;
  fuzzyHighlightRanges: Array<{
    id: string;
    text: string;
    term: string;
    ranges: Array<{ start: number; end: number }>;
  }>;
  splitWords: Array<{
    id: string;
    text: string;
    words: Array<{ word: string; start: number; end: number }>;
  }>;
};

const contractPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../docs/search-contract.json"
);
const contract = JSON.parse(readFileSync(contractPath, "utf8")) as SearchContract;

/** docs/search-contract.json — FE 側契約テスト（Rust: notes/search_contract.rs） */
describe("search contract (FE)", () => {
  it("constants match docs/search-contract.json", () => {
    expect(MIN_FUZZY_TERM_LEN).toBe(contract.constants.minFuzzyTermLen);
    expect(MIN_FUZZY_SCORE).toBe(contract.constants.minFuzzyScore);
    expect(MAX_EDIT_RATIO).toBe(contract.constants.maxEditRatio);
  });

  describe("bodyHighlightTerms", () => {
    it.each(contract.bodyHighlightTerms)("$id", ({ query, terms }) => {
      expect(parseBodyHighlightTerms(query)).toEqual(terms);
    });
  });

  describe("fuzzyHighlightRanges", () => {
    it.each(contract.fuzzyHighlightRanges)("$id", ({ text, term, ranges }) => {
      expect(fuzzyWordHighlightRanges(text, term)).toEqual(ranges);
    });
  });

  describe("splitWords", () => {
    it.each(contract.splitWords)("$id", ({ text, words }) => {
      expect(splitWordsWithRanges(text)).toEqual(words);
    });
  });
});
