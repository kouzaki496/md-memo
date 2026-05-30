import { type MouseEvent } from "react";
import { Lock, Pin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { NoteDetail, NoteMeta } from "@/types/note";
import { isSystemNotePath } from "@/lib/systemNotes";
import { messages } from "@/lib/messages";

type ManagerPanelProps = {
  managerQuery: string;
  setManagerQuery: (v: string) => void;
  maxChars: string;
  setMaxChars: (v: string) => void;
  selectedCount: number;
  filteredDetails: NoteDetail[];
  selectedPaths: Set<string>;
  onSelectAllFiltered: () => void;
  onClearSelection: () => void;
  onClose: () => void;
  onDeleteSelected: () => void;
  onToggleSelect: (path: string) => void;
  onOpenNote: (path: string) => void;
  onOpenHoverPreview: (e: MouseEvent, note: NoteMeta) => void;
  onMoveHoverPreview: (e: MouseEvent) => void;
  onCloseHoverPreview: () => void;
};

export function ManagerPanel(props: ManagerPanelProps) {
  const {
    managerQuery,
    setManagerQuery,
    maxChars,
    setMaxChars,
    selectedCount,
    filteredDetails,
    selectedPaths,
    onSelectAllFiltered,
    onClearSelection,
    onClose,
    onDeleteSelected,
    onToggleSelect,
    onOpenNote,
    onOpenHoverPreview,
    onMoveHoverPreview,
    onCloseHoverPreview,
  } = props;

  const renderTags = (tags: string[]) => {
    if (tags.length === 0) return null;
    return (
      <div className="mt-1 flex flex-wrap gap-1">
        {tags.slice(0, 4).map((tag) => (
          <span
            key={tag}
            className="rounded-full border border-border/70 bg-background/60 px-1.5 py-0 text-[10px] leading-4 text-muted-foreground"
          >
            #{tag}
          </span>
        ))}
      </div>
    );
  };

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="h-12 border-b flex items-center justify-between px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider bg-background/80">
        <span>{messages.manager.title}</span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onSelectAllFiltered}>
            {messages.manager.selectAll}
          </Button>
          <Button variant="ghost" size="sm" onClick={onClearSelection}>
            {messages.manager.clearSelection}
          </Button>
          <Button variant="outline" size="sm" onClick={onClose}>
            {messages.manager.close}
          </Button>
        </div>
      </div>
      <div className="border-b p-3 flex items-center gap-2">
        <Input
          placeholder={messages.manager.searchPlaceholder}
          value={managerQuery}
          onChange={(e) => setManagerQuery(e.target.value)}
          className="max-w-sm"
        />
        <Input
          placeholder={messages.manager.maxCharsPlaceholder}
          value={maxChars}
          onChange={(e) => setMaxChars(e.target.value)}
          className="w-44"
        />
        <Button variant="destructive" size="sm" onClick={onDeleteSelected}>
          {messages.manager.deleteSelected(selectedCount)}
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1 overflow-hidden">
        <div className="p-3 space-y-2">
          {filteredDetails.map((n) => (
            <div
              key={n.path}
              className="flex items-start gap-3 rounded-md border bg-card p-3 hover:bg-muted/30"
              onMouseEnter={(e) =>
                onOpenHoverPreview(e, {
                  path: n.path,
                  title: n.title,
                  pinned: n.pinned,
                  systemNote: n.systemNote,
                  tags: n.tags,
                })
              }
              onMouseMove={onMoveHoverPreview}
              onMouseLeave={onCloseHoverPreview}
            >
              <input
                type="checkbox"
                checked={selectedPaths.has(n.path)}
                disabled={n.systemNote || isSystemNotePath(n.path)}
                onChange={() => onToggleSelect(n.path)}
                className="mt-1 h-5 w-5 cursor-pointer rounded border-border accent-primary disabled:cursor-not-allowed disabled:opacity-40"
              />
              <div className="min-w-0 flex-1">
                <button type="button" className="text-left w-full" onClick={() => onOpenNote(n.path)}>
                  <div className="truncate font-medium">
                    {n.title}
                    {(n.systemNote || isSystemNotePath(n.path)) && (
                      <Lock
                        className="ml-1 inline-block h-3.5 w-3.5 align-text-top text-muted-foreground"
                        aria-label={messages.aria.builtinNote}
                      />
                    )}
                    {n.pinned && <Pin className="ml-1 inline-block h-3.5 w-3.5 align-text-top text-muted-foreground" />}
                  </div>
                  {renderTags(n.tags)}
                  <div className="mt-1 text-xs text-muted-foreground">
                    {messages.manager.charCount(n.charCount)}
                    {n.preview ? ` / ${n.preview}` : ` / ${messages.manager.emptyPreview}`}
                  </div>
                </button>
              </div>
            </div>
          ))}
          {filteredDetails.length === 0 && (
            <div className="p-4 text-sm text-muted-foreground">{messages.manager.empty}</div>
          )}
        </div>
      </ScrollArea>
    </main>
  );
}
