/** Rust `match_strategy.rs` と同等の fuzzy 語マッチ（プレビューハイライト用） */

export const MIN_FUZZY_TERM_LEN = 3;
export const MIN_FUZZY_SCORE = 0.75;
export const MAX_EDIT_RATIO = 0.34;

function termHasUppercase(term: string): boolean {
  return /[\p{Lu}]/u.test(term);
}

function findCaseInsensitiveIndex(text: string, needle: string, from: number): number {
  return text.toLowerCase().indexOf(needle.toLowerCase(), from);
}

/** Rust `ExactMatcher` と同等の部分一致ハイライト範囲（UTF-16 index） */
export function exactSubstringHighlightRanges(
  text: string,
  term: string
): Array<{ start: number; end: number }> {
  if (!term) return [];
  const ranges: Array<{ start: number; end: number }> = [];
  const caseSensitive = termHasUppercase(term);
  let from = 0;
  while (from < text.length) {
    const index = caseSensitive
      ? text.indexOf(term, from)
      : findCaseInsensitiveIndex(text, term, from);
    if (index === -1) break;
    ranges.push({ start: index, end: index + term.length });
    from = index + term.length;
  }
  return ranges;
}

function levenshteinChars(a: string, b: string): number {
  const ac = [...a];
  const bc = [...b];
  const n = ac.length;
  const m = bc.length;
  if (n === 0) return m;
  if (m === 0) return n;

  let prev = Array.from({ length: m + 1 }, (_, i) => i);
  let curr = new Array<number>(m + 1);

  for (let i = 1; i <= n; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= m; j += 1) {
      const cost = ac[i - 1] === bc[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[m];
}

function maxAllowedEdits(maxLen: number): number {
  if (maxLen < MIN_FUZZY_TERM_LEN) return 0;
  if (maxLen <= 4) return 1;
  return Math.ceil(maxLen * MAX_EDIT_RATIO);
}

function fuzzyWordScoreInner(wordLower: string, termLower: string): number | null {
  const maxLen = Math.max([...wordLower].length, [...termLower].length);
  if (maxLen === 0) return null;
  const dist = levenshteinChars(wordLower, termLower);
  const allowed = maxAllowedEdits(maxLen);
  if (dist > allowed) return null;
  const score = 1.0 - dist / maxLen;
  return score >= MIN_FUZZY_SCORE ? score : null;
}

function fuzzyWordScore(word: string, term: string): number | null {
  return fuzzyWordScoreInner(word.toLowerCase(), term.toLowerCase());
}

export function splitWordsWithRanges(text: string): Array<{ word: string; start: number; end: number }> {
  const out: Array<{ word: string; start: number; end: number }> = [];
  let i = 0;
  while (i < text.length) {
    while (i < text.length && /[\s\-_/]/.test(text[i])) {
      i += 1;
    }
    if (i >= text.length) break;
    const start = i;
    while (i < text.length && !/[\s\-_/]/.test(text[i])) {
      i += 1;
    }
    out.push({ word: text.slice(start, i), start, end: i });
  }
  return out;
}

/**
 * Rust `FuzzyMatcher::match_score` と同等のハイライト範囲。
 * 部分一致 → 短語 exact → 語単位 fuzzy の順。
 */
export function fuzzyWordHighlightRanges(
  text: string,
  term: string
): Array<{ start: number; end: number }> {
  if (!term) return [];

  const exactRanges = exactSubstringHighlightRanges(text, term);
  if (exactRanges.length > 0) return exactRanges;

  if (termHasUppercase(term)) return [];
  if ([...term].length < MIN_FUZZY_TERM_LEN) return [];

  const ranges: Array<{ start: number; end: number }> = [];
  for (const { word, start, end } of splitWordsWithRanges(text)) {
    if (fuzzyWordScore(word, term) != null) {
      ranges.push({ start, end });
    }
  }
  return ranges;
}
