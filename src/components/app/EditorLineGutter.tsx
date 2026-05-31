import type { RefObject } from "react";

type EditorLineGutterProps = {
  lineCount: number;
  fontSizeRem: number;
  lineHeightRem: number;
  innerRef: RefObject<HTMLDivElement | null>;
};

export function EditorLineGutter(props: EditorLineGutterProps) {
  const { lineCount, fontSizeRem, lineHeightRem, innerRef } = props;

  return (
    <div
      className="relative shrink-0 overflow-hidden border-r border-border/15 bg-muted/5 pt-12 pb-12 pl-1.5 pr-1.5 select-none dark:bg-muted/10"
      style={{ minWidth: `${Math.max(1.75, String(lineCount).length * 0.65 + 0.65)}ch` }}
      aria-hidden
    >
      <div ref={innerRef} className="pointer-events-none font-mono tabular-nums">
        {Array.from({ length: lineCount }, (_, i) => (
          <div
            key={i}
            className="flex items-center justify-end text-muted-foreground/30"
            style={{
              height: `${lineHeightRem}rem`,
              fontSize: `${Math.min(0.6875, fontSizeRem * 0.58)}rem`,
            }}
          >
            {i + 1}
          </div>
        ))}
      </div>
    </div>
  );
}
