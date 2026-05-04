import type { NoteMeta } from "@/types/note";

type ContextMenuState = {
  note: NoteMeta;
  x: number;
  y: number;
};

type HoverPreviewState = {
  note: NoteMeta;
  x: number;
  y: number;
  content: string;
  loading: boolean;
};

type OverlaysProps = {
  contextMenu: ContextMenuState | null;
  hoverPreview: HoverPreviewState | null;
  onPinOrUnpin: (note: NoteMeta) => void;
  onDelete: (note: NoteMeta) => void;
};

export function Overlays(props: OverlaysProps) {
  const { contextMenu, hoverPreview, onPinOrUnpin, onDelete } = props;

  return (
    <>
      {contextMenu && (
        <div
          className="fixed z-50 min-w-40 rounded-md border bg-background p-1 shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-muted"
            onClick={() => onPinOrUnpin(contextMenu.note)}
          >
            {contextMenu.note.pinned ? "ピン止め解除" : "ピン止め"}
          </button>
          <button
            type="button"
            className="block w-full rounded px-3 py-2 text-left text-sm text-red-600 hover:bg-muted"
            onClick={() => onDelete(contextMenu.note)}
          >
            削除
          </button>
        </div>
      )}

      {hoverPreview && (
        <div
          className="pointer-events-none fixed z-40 max-w-sm rounded-md border bg-background/95 p-3 shadow-lg backdrop-blur"
          style={{ left: hoverPreview.x, top: hoverPreview.y }}
        >
          <div className="mb-1 text-xs font-semibold text-foreground">{hoverPreview.note.title}</div>
          <div className="max-h-40 overflow-hidden whitespace-pre-wrap text-xs text-muted-foreground">
            {hoverPreview.loading
              ? "読み込み中..."
              : hoverPreview.content.split("\n").slice(0, 8).join("\n") || "(空のメモ)"}
          </div>
        </div>
      )}
    </>
  );
}
