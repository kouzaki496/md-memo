import { type RefObject, useEffect } from "react";
import type { SearchHit } from "@/types/note";

type UseSearchHitScrollOptions = {
  activeHit: SearchHit | null;
  currentPath: string | null;
  input: string;
  isEditMode: boolean;
  editorRef: RefObject<HTMLTextAreaElement | null>;
};

/** 検索ヒット行へエディタの選択・スクロールを合わせる */
export function useSearchHitScroll(options: UseSearchHitScrollOptions) {
  const { activeHit, currentPath, input, isEditMode, editorRef } = options;

  useEffect(() => {
    if (!activeHit) return;
    if (!isEditMode) return;
    if (!currentPath || activeHit.path !== currentPath) return;

    const textarea = editorRef.current;
    if (!textarea) return;
    if (activeHit.line <= 0) return;

    const targetLine = activeHit.line;
    const lines = input.split("\n");
    const before = lines.slice(0, targetLine - 1).join("\n");
    const start = before.length + (targetLine > 1 ? 1 : 0);
    const end = start + (lines[targetLine - 1]?.length ?? 0);
    textarea.focus();
    textarea.setSelectionRange(start, end);

    const style = window.getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(style.lineHeight);
    if (Number.isFinite(lineHeight) && lineHeight > 0) {
      textarea.scrollTop = Math.max(0, (targetLine - 3) * lineHeight);
    }
  }, [activeHit, currentPath, input, isEditMode, editorRef]);
}
