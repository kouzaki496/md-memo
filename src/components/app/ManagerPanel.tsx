import { type MouseEvent } from "react";
import { ExternalLink, Lock, Pin, PinOff, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { NoteMeta } from "@/types/note";
import type { ManagerNoteRow } from "@/lib/managerSearchFilter";
import { isSystemNotePath } from "@/lib/systemNotes";
import { messages } from "@/lib/messages";
import { SearchFuzzyBadge } from "@/components/app/SearchMatchHint";

type ManagerPanelProps = {
  managerQuery: string;
  setManagerQuery: (v: string) => void;
  maxChars: string;
  setMaxChars: (v: string) => void;
  selectedCount: number;
  filteredDetails: ManagerNoteRow[];
  managerSearchError: boolean;
  managerSearchPending: boolean;
  selectedPaths: Set<string>;
  onSelectAllFiltered: () => void;
  onClearSelection: () => void;
  onClose: () => void;
  onDeleteSelected: () => void;
  onToggleSelect: (path: string) => void;
  onOpenNote: (path: string) => void;
  onOpenInNewWindow: (note: NoteMeta) => void;
  onPinOrUnpin: (note: NoteMeta) => void;
  onDelete: (note: NoteMeta) => void;
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
    managerSearchError,
    managerSearchPending,
    selectedPaths,
    onSelectAllFiltered,
    onClearSelection,
    onClose,
    onDeleteSelected,
    onToggleSelect,
    onOpenNote,
    onOpenInNewWindow,
    onPinOrUnpin,
    onDelete,
    onOpenHoverPreview,
    onMoveHoverPreview,
    onCloseHoverPreview,
  } = props;

  const renderTags = (tags: string[] | undefined) => {
    if (!tags?.length) return null;
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

  const toNoteMeta = (n: ManagerNoteRow): NoteMeta => ({
    path: n.path,
    title: n.title,
    pinned: n.pinned,
    systemNote: n.systemNote,
    tags: n.tags,
    updatedMs: n.updatedMs,
    createdMs: n.createdMs,
  });

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
          {filteredDetails.map((n) => {
            const note = toNoteMeta(n);
            const isSystemNote = n.systemNote || isSystemNotePath(n.path);
            const pinDisabled = isSystemNote && n.pinned;

            return (
            <div
              key={n.path}
              className="flex items-start gap-3 rounded-md border bg-card p-3 hover:bg-muted/30"
              onMouseEnter={(e) => onOpenHoverPreview(e, note)}
              onMouseMove={onMoveHoverPreview}
              onMouseLeave={onCloseHoverPreview}
            >
              <input
                type="checkbox"
                checked={selectedPaths.has(n.path)}
                disabled={isSystemNote}
                onChange={() => onToggleSelect(n.path)}
                className="mt-1 h-5 w-5 cursor-pointer rounded border-border accent-primary disabled:cursor-not-allowed disabled:opacity-40"
              />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-start gap-1">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => onOpenNote(n.path)}
                  >
                    <div className="truncate font-medium">
                      {n.title}
                      {isSystemNote && (
                        <Lock
                          className="ml-1 inline-block h-3.5 w-3.5 align-text-top text-muted-foreground"
                          aria-label={messages.aria.builtinNote}
                        />
                      )}
                      {n.pinned && (
                        <Pin className="ml-1 inline-block h-3.5 w-3.5 align-text-top text-muted-foreground" />
                      )}
                    </div>
                    {renderTags(n.tags)}
                    <div className="mt-1 text-xs text-muted-foreground">
                      {messages.manager.charCount(n.charCount ?? 0)}
                      {n.preview ? ` / ${n.preview}` : ` / ${messages.manager.emptyPreview}`}
                    </div>
                  </button>
                  {n.searchFuzzy && <SearchFuzzyBadge />}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  title={messages.contextMenu.openInNewWindow}
                  aria-label={messages.contextMenu.openInNewWindow}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenInNewWindow(note);
                  }}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  title={n.pinned ? messages.contextMenu.unpin : messages.contextMenu.pin}
                  aria-label={n.pinned ? messages.contextMenu.unpin : messages.contextMenu.pin}
                  disabled={pinDisabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPinOrUnpin(note);
                  }}
                >
                  {n.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  title={messages.contextMenu.delete}
                  aria-label={messages.contextMenu.delete}
                  disabled={isSystemNote}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(note);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            );
          })}
          {filteredDetails.length === 0 && (
            <div
              className={`p-4 text-sm ${
                managerSearchError && managerQuery.trim()
                  ? "text-destructive"
                  : "text-muted-foreground"
              }`}
            >
              {managerSearchError && managerQuery.trim()
                ? messages.status.searchFailed
                : managerSearchPending && managerQuery.trim()
                  ? messages.manager.searchSearching
                  : messages.manager.empty}
            </div>
          )}
        </div>
      </ScrollArea>
    </main>
  );
}
