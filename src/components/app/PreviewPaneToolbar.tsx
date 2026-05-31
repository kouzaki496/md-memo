import type { ReactNode } from "react";
import { Minus, Monitor, Pencil, Plus, Printer, SquareArrowOutUpRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { messages } from "@/lib/messages";
import { cn } from "@/lib/utils";

type PreviewPaneToolbarProps = {
  title: ReactNode;
  currentPath: string | null;
  isReadOnly: boolean;
  showZoom?: boolean;
  showEdit?: boolean;
  onPrint: () => void;
  onAdjustContentScale?: (delta: number) => void;
  onOpenInNewWindow?: () => void;
  onPresentInBrowser?: () => void;
  onEnterEditMode?: () => void;
  onDeleteCurrentNote: () => void;
};

export function PreviewPaneToolbar(props: PreviewPaneToolbarProps) {
  const {
    title,
    currentPath,
    isReadOnly,
    showZoom = false,
    showEdit = false,
    onPrint,
    onAdjustContentScale,
    onOpenInNewWindow,
    onPresentInBrowser,
    onEnterEditMode,
    onDeleteCurrentNote,
  } = props;

  return (
    <div className="h-12 shrink-0 border-b flex items-center justify-between gap-2 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
      {title}
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="toolbar"
          size="icon-sm"
          title={messages.editor.printToPdfHint}
          aria-label={messages.editor.printToPdf}
          onClick={onPrint}
        >
          <Printer className="h-4 w-4" />
        </Button>
        {showZoom && onAdjustContentScale && (
          <>
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
          </>
        )}
        {onOpenInNewWindow && (
          <Button
            type="button"
            variant="toolbar"
            size="icon-sm"
            title={messages.editor.openInNewWindow}
            aria-label={messages.editor.openInNewWindow}
            onClick={onOpenInNewWindow}
          >
            <SquareArrowOutUpRight className="h-4 w-4" />
          </Button>
        )}
        {onPresentInBrowser && (
          <Button
            type="button"
            variant="toolbar"
            size="icon-sm"
            title={messages.editor.presentInBrowser}
            aria-label={messages.editor.presentInBrowser}
            onClick={onPresentInBrowser}
          >
            <Monitor className="h-4 w-4" />
          </Button>
        )}
        {showEdit && !isReadOnly && onEnterEditMode && (
          <Button
            type="button"
            variant="toolbar"
            size="icon-sm"
            title={messages.editor.editMode}
            aria-label={messages.editor.editMode}
            onClick={onEnterEditMode}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        )}
        {!isReadOnly && (
          <Button
            type="button"
            variant="toolbar"
            size="icon-sm"
            className={cn(
              "text-destructive hover:bg-destructive/10 hover:text-destructive"
            )}
            title={currentPath ? messages.editor.deleteNote : messages.editor.deleteNoteDisabled}
            aria-label={messages.editor.deleteNote}
            disabled={!currentPath}
            onClick={onDeleteCurrentNote}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
