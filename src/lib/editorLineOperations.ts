/** 選択に含まれる行の先頭〜最終行末（行末の \\n は含まない）までをブロックとして取る */
export function getSelectedLineBlockBounds(
  text: string,
  selStart: number,
  selEnd: number
): { startLineStart: number; endLineEnd: number; block: string } | null {
  const lo = Math.min(selStart, selEnd);
  const hi = Math.max(selStart, selEnd);
  const startLineStart = text.lastIndexOf("\n", Math.max(0, lo - 1)) + 1;
  const effectiveEnd = hi > lo && text[hi - 1] === "\n" ? hi - 1 : hi;
  const endLineEndIndex = text.indexOf("\n", effectiveEnd);
  const endLineEnd = endLineEndIndex === -1 ? text.length : endLineEndIndex;
  if (startLineStart >= endLineEnd) return null;
  const block = text.slice(startLineStart, endLineEnd);
  return { startLineStart, endLineEnd, block };
}

export type LineEditResult = {
  text: string;
  selectionStart: number;
  selectionEnd: number;
};

/** Alt+↑/↓: 選択行ブロックと直上・直下の行（単一行）を入れ替え */
export function swapLineBlockWithAdjacent(
  text: string,
  selStart: number,
  selEnd: number,
  dir: "up" | "down"
): LineEditResult | null {
  const bounds = getSelectedLineBlockBounds(text, selStart, selEnd);
  if (!bounds) return null;
  const { startLineStart, endLineEnd, block } = bounds;

  if (dir === "up") {
    if (startLineStart === 0) return null;
    const prevStart = text.lastIndexOf("\n", startLineStart - 2) + 1;
    const prevLine = text.slice(prevStart, startLineStart - 1);
    const before = text.slice(0, prevStart);
    const after = endLineEnd < text.length ? text.slice(endLineEnd + 1) : "";
    const nextText = `${before}${block}\n${prevLine}${endLineEnd < text.length ? "\n" : ""}${after}`;
    const newBlockStart = prevStart;
    return {
      text: nextText,
      selectionStart: newBlockStart,
      selectionEnd: newBlockStart + block.length,
    };
  }

  if (endLineEnd >= text.length) return null;
  const nextLineStart = endLineEnd + 1;
  let nextLineEnd = text.indexOf("\n", nextLineStart);
  if (nextLineEnd === -1) nextLineEnd = text.length;
  const nextLine = text.slice(nextLineStart, nextLineEnd);
  const before = text.slice(0, startLineStart);
  const after = nextLineEnd < text.length ? text.slice(nextLineEnd + 1) : "";
  const nextText = `${before}${nextLine}\n${block}${nextLineEnd < text.length ? "\n" : ""}${after}`;
  const newBlockStart = startLineStart + nextLine.length + 1;
  return {
    text: nextText,
    selectionStart: newBlockStart,
    selectionEnd: newBlockStart + block.length,
  };
}

export function duplicateLineBlock(
  text: string,
  selStart: number,
  selEnd: number,
  dir: "above" | "below"
): LineEditResult | null {
  const bounds = getSelectedLineBlockBounds(text, selStart, selEnd);
  if (!bounds) return null;
  const { startLineStart, endLineEnd, block } = bounds;

  if (dir === "below") {
    const insertion = `\n${block}`;
    const nextText = `${text.slice(0, endLineEnd)}${insertion}${text.slice(endLineEnd)}`;
    const newBlockStart = endLineEnd + 1;
    return {
      text: nextText,
      selectionStart: newBlockStart,
      selectionEnd: newBlockStart + block.length,
    };
  }

  if (startLineStart === 0) {
    const nextText = `${block}\n${text}`;
    return {
      text: nextText,
      selectionStart: 0,
      selectionEnd: block.length,
    };
  }
  const nextText = `${text.slice(0, startLineStart)}${block}\n${text.slice(startLineStart)}`;
  const newBlockStart = startLineStart;
  return {
    text: nextText,
    selectionStart: newBlockStart,
    selectionEnd: newBlockStart + block.length,
  };
}
