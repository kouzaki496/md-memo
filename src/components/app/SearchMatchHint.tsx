import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { messages } from "@/lib/messages";

const TOOLTIP_GAP_PX = 6;

/** typo 許容ヒットのバッジ（ホバーで理由をツールチップ表示） */
export function SearchFuzzyBadge() {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number } | null>(null);

  const showTooltip = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setTooltip({
      x: rect.left + rect.width / 2,
      y: rect.bottom + TOOLTIP_GAP_PX,
    });
  }, []);

  const hideTooltip = useCallback(() => {
    setTooltip(null);
  }, []);

  return (
    <span
      ref={anchorRef}
      className="inline-flex shrink-0"
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <span
        className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-violet-300/70 bg-violet-100/90 text-[10px] font-semibold leading-none text-violet-900 dark:border-violet-500/45 dark:bg-violet-500/25 dark:text-violet-100"
        aria-label={messages.search.fuzzyBadgeTitle}
      >
        {messages.search.fuzzyBadge}
      </span>
      {tooltip &&
        typeof document !== "undefined" &&
        createPortal(
          <span
            role="tooltip"
            className="pointer-events-none fixed z-[200] max-w-[14rem] -translate-x-1/2 rounded-md border border-border bg-popover px-2 py-1 text-[11px] leading-snug text-popover-foreground shadow-md"
            style={{ left: tooltip.x, top: tooltip.y }}
          >
            {messages.search.fuzzyBadgeTitle}
          </span>,
          document.body
        )}
    </span>
  );
}
