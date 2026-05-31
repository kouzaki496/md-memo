/** Rust `parse_raw_terms` と同等の本文ハイライト語（タグ語は除外） */

export type ParsedBodyTerm = {
  text: string;
  /** `"` 囲み = exact フレーズ */
  exact: boolean;
};

export function parseBodyHighlightTerms(query: string): ParsedBodyTerm[] {
  const out: ParsedBodyTerm[] = [];
  const chars = [...query];
  let i = 0;

  while (i < chars.length) {
    while (i < chars.length && /\s/.test(chars[i])) {
      i += 1;
    }
    if (i >= chars.length) break;

    if (chars[i] === '"') {
      i += 1;
      const start = i;
      let closed = false;
      while (i < chars.length) {
        if (chars[i] === '"') {
          closed = true;
          const text = chars.slice(start, i).join("");
          i += 1;
          if (text.length > 0 && !text.startsWith("#")) {
            out.push({ text, exact: true });
          }
          break;
        }
        i += 1;
      }
      if (!closed) {
        const text = chars.slice(start).join("");
        if (text.length > 0 && !text.startsWith("#")) {
          out.push({ text, exact: true });
        }
        break;
      }
    } else {
      const start = i;
      while (i < chars.length && !/\s/.test(chars[i])) {
        i += 1;
      }
      const word = chars.slice(start, i).join("");
      if (word.length > 0 && !word.startsWith("#")) {
        out.push({ text: word, exact: false });
      }
    }
  }

  return out;
}

export function bodyHighlightNeedles(terms: ParsedBodyTerm[]): string[] {
  return terms.map((t) => t.text).filter(Boolean);
}
