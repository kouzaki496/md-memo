import { clamp } from "@/lib/utils";

type PaneResizeDirection = "grow-right" | "grow-left";

type StartPaneResizeOptions = {
  startClientX: number;
  startWidth: number;
  minWidth: number;
  maxWidth: number;
  onResize: (width: number) => void;
  direction: PaneResizeDirection;
};

/** ドラッグでペイン幅を変更する（サイドバー・プレビュー共通） */
export function startPaneResize(options: StartPaneResizeOptions): void {
  const { startClientX, startWidth, minWidth, maxWidth, onResize, direction } = options;
  const deltaSign = direction === "grow-left" ? -1 : 1;

  const onMouseMove = (e: globalThis.MouseEvent) => {
    const next = clamp(startWidth + deltaSign * (e.clientX - startClientX), minWidth, maxWidth);
    onResize(next);
  };

  const onMouseUp = () => {
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  };

  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
}
