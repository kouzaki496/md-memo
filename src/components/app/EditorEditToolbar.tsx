import { Eye, ImagePlus, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { messages } from "@/lib/messages";

type EditorEditToolbarProps = {
  currentFileName: string;
  isReadOnly: boolean;
  onInsertImage: () => void;
  onAdjustContentScale: (delta: number) => void;
  onEnterPreviewMode: () => void;
};

export function EditorEditToolbar(props: EditorEditToolbarProps) {
  const {
    currentFileName,
    isReadOnly,
    onInsertImage,
    onAdjustContentScale,
    onEnterPreviewMode,
  } = props;

  return (
    <div className="h-12 shrink-0 border-b flex items-center justify-between px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider bg-background/80">
      <span className="min-w-0 truncate">
        {messages.editor.editorTitle} — {currentFileName}
      </span>
      <div className="flex items-center gap-1">
        {!isReadOnly && (
          <Button
            type="button"
            variant="toolbar"
            size="icon-sm"
            title={messages.editor.insertImage}
            aria-label={messages.editor.insertImage}
            onClick={onInsertImage}
          >
            <ImagePlus className="h-4 w-4" />
          </Button>
        )}
        <Button
          type="button"
          variant="toolbar"
          size="icon-sm"
          title={messages.editor.zoomOut}
          aria-label={messages.editor.zoomOut}
          onClick={() => onAdjustContentScale(-0.1)}
        >
          <Minus className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="toolbar"
          size="icon-sm"
          title={messages.editor.zoomIn}
          aria-label={messages.editor.zoomIn}
          onClick={() => onAdjustContentScale(0.1)}
        >
          <Plus className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="toolbar"
          size="icon-sm"
          title={messages.editor.previewOnly}
          aria-label={messages.editor.previewOnly}
          onClick={onEnterPreviewMode}
        >
          <Eye className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
