import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import type { SearchMode } from "@/types/note";
import type { ParsedBodyTerm } from "@/lib/searchQueryParse";
import { fuzzyWordHighlightRanges } from "@/lib/fuzzyMatch";

export { parseBodyHighlightTerms } from "@/lib/searchQueryParse";

export const SEARCH_HIGHLIGHT_CLASS =
  "rounded bg-amber-200/80 px-0.5 text-foreground dark:bg-amber-500/40";

export function isSearchHighlightActive(mode: SearchMode, query: string): boolean {
  if (!query.trim()) return false;
  return mode === "body" || mode === "mixed";
}

function termIsCaseSensitive(term: string): boolean {
  return /[\p{Lu}]/u.test(term);
}

function findCaseInsensitiveIndex(text: string, needle: string, from: number): number {
  return text.toLowerCase().indexOf(needle.toLowerCase(), from);
}

function collectSubstringRanges(
  text: string,
  term: string
): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  const caseSensitive = termIsCaseSensitive(term);
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

function mergeHighlightRanges(
  ranges: Array<{ start: number; end: number }>
): Array<{ start: number; end: number }> {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: Array<{ start: number; end: number }> = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

function collectHighlightRanges(
  text: string,
  terms: ParsedBodyTerm[]
): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  for (const term of terms) {
    if (!term.text) continue;
    ranges.push(...collectSubstringRanges(text, term.text));
    if (!term.exact) {
      ranges.push(...fuzzyWordHighlightRanges(text, term.text));
    }
  }
  return mergeHighlightRanges(ranges);
}

function highlightPlainText(text: string, terms: ParsedBodyTerm[]): ReactNode {
  if (!terms.length || text.length === 0) return text;

  const ranges = collectHighlightRanges(text, terms);
  if (ranges.length === 0) return text;

  const parts: ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((range, index) => {
    if (cursor < range.start) {
      parts.push(text.slice(cursor, range.start));
    }
    parts.push(
      <mark key={`hl-${index}-${range.start}`} className={SEARCH_HIGHLIGHT_CLASS}>
        {text.slice(range.start, range.end)}
      </mark>
    );
    cursor = range.end;
  });
  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }
  return parts.length === 1 ? parts[0] : parts;
}

function shouldSkipHighlightElement(element: ReactElement): boolean {
  if (typeof element.type === "string" && element.type === "code") {
    return true;
  }
  if (typeof element.type === "function") {
    const fn = element.type as { displayName?: string; name?: string };
    const name = fn.displayName ?? fn.name;
    if (name === "MarkdownCodeBlock") return true;
  }
  return false;
}

export function highlightReactChildren(children: ReactNode, terms: ParsedBodyTerm[]): ReactNode {
  if (!terms.length) return children;

  return Children.map(children, (child) => {
    if (typeof child === "string") {
      return highlightPlainText(child, terms);
    }
    if (typeof child === "number") {
      return highlightPlainText(String(child), terms);
    }
    if (!isValidElement(child)) return child;
    if (shouldSkipHighlightElement(child)) return child;

    const props = child.props as { children?: ReactNode };
    if (props.children == null) return child;

    return cloneElement(child, {
      ...props,
      children: highlightReactChildren(props.children, terms),
    } as never);
  });
}
