import { getSelectedLineBlockBounds } from "@/lib/editorLineOperations";

export type ListKind = "plain" | "unordered" | "ordered" | "task";

export type TextEditResult = {
  text: string;
  selectionStart: number;
  selectionEnd: number;
};

function getLineBlockSelection(
  text: string,
  start: number,
  end: number
): { startLineStart: number; endLineEnd: number; block: string } {
  const startLineStart = text.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const effectiveEnd = end > start && text[end - 1] === "\n" ? end - 1 : end;
  const endLineEndIndex = text.indexOf("\n", effectiveEnd);
  const endLineEnd = endLineEndIndex === -1 ? text.length : endLineEndIndex;
  const block = text.slice(startLineStart, endLineEnd);
  return { startLineStart, endLineEnd, block };
}

export function applyBoldToggle(text: string, start: number, end: number): TextEditResult {
  if (start === end) {
    const leftOpen = text.lastIndexOf("**", Math.max(0, start - 1));
    const leftClose = text.indexOf("**", start);
    const inWrappedBold = leftOpen >= 0 && leftClose >= 0 && leftOpen < start && start <= leftClose;
    if (inWrappedBold) {
      const inner = text.slice(leftOpen + 2, leftClose);
      const nextText = `${text.slice(0, leftOpen)}${inner}${text.slice(leftClose + 2)}`;
      const nextCursor = Math.max(leftOpen, start - 2);
      return { text: nextText, selectionStart: nextCursor, selectionEnd: nextCursor };
    }
    const nextText = `${text.slice(0, start)}****${text.slice(end)}`;
    return { text: nextText, selectionStart: start + 2, selectionEnd: start + 2 };
  }

  const selected = text.slice(start, end);
  const wrapped = selected.startsWith("**") && selected.endsWith("**") && selected.length >= 4;
  if (wrapped) {
    const unwrapped = selected.slice(2, -2);
    const nextText = `${text.slice(0, start)}${unwrapped}${text.slice(end)}`;
    return { text: nextText, selectionStart: start, selectionEnd: start + unwrapped.length };
  }

  const nextText = `${text.slice(0, start)}**${selected}**${text.slice(end)}`;
  return { text: nextText, selectionStart: start + 2, selectionEnd: end + 2 };
}

export function applyHeading(text: string, start: number, end: number, level: number): TextEditResult {
  const { startLineStart, endLineEnd, block } = getLineBlockSelection(text, start, end);
  const lines = block.split("\n");
  const targetPrefix = `${"#".repeat(level)} `;

  const transformed = lines.map((line) => {
    if (line.trim().length === 0) return line;
    const indent = line.match(/^(\s*)/)?.[1] ?? "";
    const core = line.slice(indent.length);
    const headingMatch = core.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const currentLevel = headingMatch[1].length;
      const rest = headingMatch[2];
      return currentLevel === level ? `${indent}${rest}` : `${indent}${targetPrefix}${rest}`;
    }
    return `${indent}${targetPrefix}${core}`;
  });

  const nextBlock = transformed.join("\n");
  const nextText = `${text.slice(0, startLineStart)}${nextBlock}${text.slice(endLineEnd)}`;
  return {
    text: nextText,
    selectionStart: startLineStart,
    selectionEnd: startLineStart + nextBlock.length,
  };
}

export function stripInlineMarkdown(line: string): string {
  let out = line;
  out = out.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1");
  out = out.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  out = out.replace(/`([^`]+)`/g, "$1");
  out = out.replace(/\*\*([^*]+)\*\*/g, "$1");
  out = out.replace(/__([^_]+)__/g, "$1");
  out = out.replace(/~~([^~]+)~~/g, "$1");
  out = out.replace(/\*([^*]+)\*/g, "$1");
  out = out.replace(/_([^_]+)_/g, "$1");
  return out;
}

export function applyClearMarkdown(text: string, start: number, end: number): TextEditResult | null {
  if (start === end) return null;
  const { startLineStart, endLineEnd, block } = getLineBlockSelection(text, start, end);
  const lines = block.split("\n");

  const transformed = lines.map((line) => {
    if (line.trim().length === 0) return line;
    const noPrefix = line
      .replace(/^(\s*)>\s?/, "$1")
      .replace(/^(\s*)#{1,6}\s+/, "$1")
      .replace(/^(\s*)[-+*]\s+\[[ xX]\]\s+/, "$1")
      .replace(/^(\s*)[-+*]\s+/, "$1")
      .replace(/^(\s*)\d+[.)]\s+/, "$1");
    return stripInlineMarkdown(noPrefix);
  });

  const nextBlock = transformed.join("\n");
  const nextText = `${text.slice(0, startLineStart)}${nextBlock}${text.slice(endLineEnd)}`;
  return {
    text: nextText,
    selectionStart: startLineStart,
    selectionEnd: startLineStart + nextBlock.length,
  };
}

export function findNextOccurrence(
  text: string,
  start: number,
  end: number
): { selectionStart: number; selectionEnd: number } | null {
  if (start === end) return null;
  const needle = text.slice(start, end);
  if (!needle) return null;

  let nextStart = text.indexOf(needle, end);
  if (nextStart < 0) nextStart = text.indexOf(needle, 0);
  if (nextStart < 0 || nextStart === start) return null;

  return { selectionStart: nextStart, selectionEnd: nextStart + needle.length };
}

export function applyListTransform(
  text: string,
  start: number,
  end: number,
  kind: ListKind
): TextEditResult {
  const { startLineStart, endLineEnd, block } = getLineBlockSelection(text, start, end);
  const lines = block.split("\n");

  let orderCounter = 1;
  const transformed = lines.map((line) => {
    if (line.trim().length === 0) return line;

    const taskMatch = line.match(/^(\s*)[-+*]\s+\[([ xX])\]\s+(.*)$/);
    const unorderedMatch = line.match(/^(\s*)[-+*]\s+(.*)$/);
    const orderedMatch = line.match(/^(\s*)\d+[.)]\s+(.*)$/);

    if (kind === "plain") {
      if (taskMatch) return `${taskMatch[1]}${taskMatch[3]}`;
      if (unorderedMatch) return `${unorderedMatch[1]}${unorderedMatch[2]}`;
      if (orderedMatch) return `${orderedMatch[1]}${orderedMatch[2]}`;
      return line;
    }

    if (kind === "unordered") {
      if (taskMatch) return `${taskMatch[1]}- ${taskMatch[3]}`;
      if (unorderedMatch) return `${unorderedMatch[1]}- ${unorderedMatch[2]}`;
      if (orderedMatch) return `${orderedMatch[1]}- ${orderedMatch[2]}`;
      const indent = line.match(/^(\s*)/)?.[1] ?? "";
      const content = line.slice(indent.length);
      return `${indent}- ${content}`;
    }

    if (kind === "ordered") {
      const indent =
        orderedMatch?.[1] ??
        unorderedMatch?.[1] ??
        taskMatch?.[1] ??
        line.match(/^(\s*)/)?.[1] ??
        "";
      const raw =
        orderedMatch?.[2] ?? taskMatch?.[3] ?? unorderedMatch?.[2] ?? line.slice(indent.length);
      const next = `${indent}${orderCounter}. ${raw}`;
      orderCounter += 1;
      return next;
    }

    if (taskMatch) {
      return `${taskMatch[1]}- [${taskMatch[2].toLowerCase() === "x" ? "x" : " "}] ${taskMatch[3]}`;
    }
    if (unorderedMatch) return `${unorderedMatch[1]}- [ ] ${unorderedMatch[2]}`;
    if (orderedMatch) return `${orderedMatch[1]}- [ ] ${orderedMatch[2]}`;
    const indent = line.match(/^(\s*)/)?.[1] ?? "";
    const content = line.slice(indent.length);
    return `${indent}- [ ] ${content}`;
  });

  const nextBlock = transformed.join("\n");
  const nextText = `${text.slice(0, startLineStart)}${nextBlock}${text.slice(endLineEnd)}`;
  return {
    text: nextText,
    selectionStart: startLineStart,
    selectionEnd: startLineStart + nextBlock.length,
  };
}

export function detectListKind(block: string): ListKind | null {
  const lines = block.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length === 0) return null;

  const isTask = lines.every((line) => /^(\s*)[-+*]\s+\[[ xX]\]\s+/.test(line));
  if (isTask) return "task";

  const isOrdered = lines.every((line) => /^(\s*)\d+[.)]\s+/.test(line));
  if (isOrdered) return "ordered";

  const isUnordered = lines.every((line) => /^(\s*)[-+*]\s+/.test(line));
  if (isUnordered) return "unordered";

  const isPlain = lines.every((line) => {
    const t = line.trim();
    if (t.length === 0) return true;
    return !/^[-+*]\s+/.test(t) && !/^\d+[.)]\s+/.test(t);
  });
  if (isPlain) return "plain";

  return null;
}

export type ListIndentOptions = {
  outdentWithAltTab: boolean;
  outdentWithShiftTab: boolean;
};

export function applyListIndent(
  text: string,
  start: number,
  end: number,
  altKey: boolean,
  shiftKey: boolean,
  options: ListIndentOptions
): TextEditResult | null {
  if (start !== end) return null;

  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const lineEnd = text.indexOf("\n", start) === -1 ? text.length : text.indexOf("\n", start);
  const line = text.slice(lineStart, lineEnd);

  const listPrefix = line.match(/^(\s*)(?:[-+*]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)/);
  if (!listPrefix) return null;

  const currentIndent = listPrefix[1];
  const shouldOutdent =
    (options.outdentWithAltTab && altKey) || (options.outdentWithShiftTab && shiftKey);

  if (shouldOutdent) {
    if (currentIndent.length === 0) return null;
    const removeCount = currentIndent.startsWith("\t") ? 1 : Math.min(2, currentIndent.length);
    const nextLine = line.slice(removeCount);
    const nextText = `${text.slice(0, lineStart)}${nextLine}${text.slice(lineEnd)}`;
    const nextCursor = Math.max(lineStart, start - removeCount);
    return { text: nextText, selectionStart: nextCursor, selectionEnd: nextCursor };
  }

  const nextLine = `  ${line}`;
  const nextText = `${text.slice(0, lineStart)}${nextLine}${text.slice(lineEnd)}`;
  const nextCursor = start + 2;
  return { text: nextText, selectionStart: nextCursor, selectionEnd: nextCursor };
}

export function applyEnterListContinuation(
  text: string,
  start: number,
  end: number
): TextEditResult | null {
  if (start !== end) return null;

  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const lineEnd = text.indexOf("\n", start) === -1 ? text.length : text.indexOf("\n", start);
  if (start !== lineEnd) return null;

  const line = text.slice(lineStart, lineEnd);

  const unordered = line.match(/^(\s*)([-+*])\s+(\[[ xX]\]\s+)?(.*)$/);
  if (unordered) {
    const indent = unordered[1];
    const bullet = unordered[2];
    const hasTask = Boolean(unordered[3]);
    const content = unordered[4].trim();

    if (content.length === 0) {
      const nextText = `${text.slice(0, lineStart)}${indent}${text.slice(lineEnd)}`;
      const nextCursor = lineStart + indent.length;
      return { text: nextText, selectionStart: nextCursor, selectionEnd: nextCursor };
    }

    const taskPrefix = hasTask ? "[ ] " : "";
    const prefix = `\n${indent}${bullet} ${taskPrefix}`;
    const nextText = `${text.slice(0, start)}${prefix}${text.slice(end)}`;
    const nextCursor = start + prefix.length;
    return { text: nextText, selectionStart: nextCursor, selectionEnd: nextCursor };
  }

  const ordered = line.match(/^(\s*)(\d+)([.)])\s+(.*)$/);
  if (ordered) {
    const indent = ordered[1];
    const num = Number(ordered[2]);
    const sep = ordered[3];
    const content = ordered[4].trim();

    if (content.length === 0) {
      const nextText = `${text.slice(0, lineStart)}${indent}${text.slice(lineEnd)}`;
      const nextCursor = lineStart + indent.length;
      return { text: nextText, selectionStart: nextCursor, selectionEnd: nextCursor };
    }

    const prefix = `\n${indent}${num + 1}${sep} `;
    const nextText = `${text.slice(0, start)}${prefix}${text.slice(end)}`;
    const nextCursor = start + prefix.length;
    return { text: nextText, selectionStart: nextCursor, selectionEnd: nextCursor };
  }

  return null;
}

export { getSelectedLineBlockBounds };

export const DEFAULT_TABLE_SNIPPET = `| 列1 | 列2 | 列3 |
| --- | --- | --- |
|  |  |  |
|  |  |  |
`;

const DEFAULT_TABLE_FIRST_HEADER = "列1";

export function applyInsertTable(text: string, start: number, end: number): TextEditResult {
  let prefix = "";
  let suffix = "";
  if (start > 0 && text[start - 1] !== "\n") prefix = "\n";
  if (end < text.length && text[end] !== "\n") suffix = "\n";

  const snippet = DEFAULT_TABLE_SNIPPET;
  const nextText = `${text.slice(0, start)}${prefix}${snippet}${suffix}${text.slice(end)}`;
  const tableStart = start + prefix.length;
  const headerStart = tableStart + 2;
  const headerEnd = headerStart + DEFAULT_TABLE_FIRST_HEADER.length;

  return {
    text: nextText,
    selectionStart: headerStart,
    selectionEnd: headerEnd,
  };
}
