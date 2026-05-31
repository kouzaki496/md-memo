export type CalloutKind = "info" | "warn" | "alert" | "tip";

export type PreviewSegment =
  | { type: "markdown"; content: string; bodyStart: number; bodyEnd: number }
  | { type: "callout"; kind: CalloutKind; content: string; bodyStart: number; bodyEnd: number };

export function normalizeCalloutKind(raw?: string): CalloutKind {
  const v = (raw ?? "").toLowerCase();
  if (v === "warn" || v === "alert" || v === "tip") return v;
  return "info";
}

function previewLineStarts(lines: string[]): number[] {
  const lineStarts: number[] = [];
  let acc = 0;
  for (let li = 0; li < lines.length; li += 1) {
    lineStarts[li] = acc;
    acc += lines[li].length + (li < lines.length - 1 ? 1 : 0);
  }
  return lineStarts;
}

/** Markdown 本文を通常段落と callout ブロックに分割する */
export function splitPreviewSegments(markdown: string): PreviewSegment[] {
  const lines = markdown.split("\n");
  const lineStarts = previewLineStarts(lines);
  const segments: PreviewSegment[] = [];
  const plainBuffer: string[] = [];
  let plainRange: { from: number; to: number } | null = null;

  const markPlainLine = (lineIdx: number) => {
    if (!plainRange) plainRange = { from: lineIdx, to: lineIdx };
    else plainRange.to = lineIdx;
  };

  const flushPlain = () => {
    if (plainBuffer.length === 0 || !plainRange) return;
    const bodyStart = lineStarts[plainRange.from];
    const bodyEnd = lineStarts[plainRange.to] + lines[plainRange.to].length;
    segments.push({ type: "markdown", content: plainBuffer.join("\n"), bodyStart, bodyEnd });
    plainBuffer.length = 0;
    plainRange = null;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const blockStart = line.match(/^:::\s*note(?:\s+(info|warn|alert|tip))?\s*$/i);
    if (blockStart) {
      flushPlain();
      const calloutLines: string[] = [];
      const startIdx = i;
      let foundEnd = false;
      for (let j = i + 1; j < lines.length; j += 1) {
        if (/^:::\s*$/.test(lines[j])) {
          i = j;
          foundEnd = true;
          break;
        }
        calloutLines.push(lines[j]);
      }

      if (foundEnd) {
        const bodyStart = lineStarts[startIdx];
        const bodyEnd = lineStarts[i] + lines[i].length;
        segments.push({
          type: "callout",
          kind: normalizeCalloutKind(blockStart[1]),
          content: calloutLines.join("\n").trim(),
          bodyStart,
          bodyEnd,
        });
      } else {
        markPlainLine(startIdx);
        plainBuffer.push(line);
        for (let k = 0; k < calloutLines.length; k += 1) {
          markPlainLine(startIdx + 1 + k);
          plainBuffer.push(calloutLines[k]);
        }
        break;
      }
      continue;
    }

    const single = line.match(/^note::(info|warn|alert|tip)\s+(.+)$/i);
    if (single) {
      flushPlain();
      const bodyStart = lineStarts[i];
      const bodyEnd = lineStarts[i] + lines[i].length;
      segments.push({
        type: "callout",
        kind: normalizeCalloutKind(single[1]),
        content: single[2],
        bodyStart,
        bodyEnd,
      });
      continue;
    }

    const multiStart = line.match(/^note::(info|warn|alert|tip)\s*$/i);
    if (!multiStart) {
      markPlainLine(i);
      plainBuffer.push(line);
      continue;
    }

    flushPlain();
    const startIdx = i;
    const calloutLines: string[] = [];
    let foundEnd = false;
    for (let j = i + 1; j < lines.length; j += 1) {
      if (/^::note\s*$/i.test(lines[j])) {
        i = j;
        foundEnd = true;
        break;
      }
      calloutLines.push(lines[j]);
    }

    if (foundEnd) {
      const bodyStart = lineStarts[startIdx];
      const bodyEnd = lineStarts[i] + lines[i].length;
      segments.push({
        type: "callout",
        kind: normalizeCalloutKind(multiStart[1]),
        content: calloutLines.join("\n").trim(),
        bodyStart,
        bodyEnd,
      });
    } else {
      markPlainLine(startIdx);
      plainBuffer.push(lines[startIdx]);
      for (let k = 0; k < calloutLines.length; k += 1) {
        markPlainLine(startIdx + 1 + k);
        plainBuffer.push(calloutLines[k]);
      }
      break;
    }
  }

  flushPlain();
  return segments;
}
