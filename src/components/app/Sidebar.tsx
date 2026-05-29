import { type MouseEvent, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Clock, List, PanelLeftClose, Pin, Plus, Search, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import type { NoteMeta, SearchHit } from "@/types/note";
import { INBOX_EXCLUSIVE_MESSAGE } from "@/lib/noteTags";
import { cn } from "@/lib/utils";

type SidebarProps = {
  query: string;
  setQuery: (v: string) => void;
  pinned: NoteMeta[];
  recent: NoteMeta[];
  searchResults: SearchHit[];
  activeHit: SearchHit | null;
  currentPath: string | null;
  status: string;
  onCreateNew: () => void;
  onOpenManager: () => void;
  onOpenSettings: () => void;
  onOpenNote: (path: string, hit?: SearchHit) => void;
  onOpenContextMenu: (e: MouseEvent, note: NoteMeta) => void;
  onOpenHoverPreview: (e: MouseEvent, note: NoteMeta) => void;
  onMoveHoverPreview: (e: MouseEvent) => void;
  onCloseHoverPreview: () => void;
  onCloseSidebar: () => void;
};

export function Sidebar(props: SidebarProps) {
  const {
    query,
    setQuery,
    pinned,
    recent,
    searchResults,
    activeHit,
    currentPath,
    status,
    onCreateNew,
    onOpenManager,
    onOpenSettings,
    onOpenNote,
    onOpenContextMenu,
    onOpenHoverPreview,
    onMoveHoverPreview,
    onCloseHoverPreview,
    onCloseSidebar,
  } = props;
  const isSearching = query.trim().length > 0;
  const [isRecentOpen, setIsRecentOpen] = useState(true);
  const prevIsSearchingRef = useRef(false);

  useEffect(() => {
    if (!prevIsSearchingRef.current && isSearching) {
      setIsRecentOpen(false);
    }
    prevIsSearchingRef.current = isSearching;
  }, [isSearching]);

  const renderNoteTags = (tags: string[]) => {
    if (tags.length === 0) return null;
    return (
      <div className="mt-0.5 flex w-full flex-wrap gap-1">
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
    <aside className="h-full min-h-0 w-full overflow-hidden border-r bg-muted/35 backdrop-blur supports-[backdrop-filter]:bg-muted/20 flex flex-col">
      <div className="p-4 space-y-4 border-b bg-background/70">
        <div className="flex items-center justify-between">
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Memo Desk</div>
          <Button
            variant="outline"
            size="icon-sm"
            className="rounded-md border border-border bg-background shadow-sm hover:bg-muted/80"
            onClick={onCloseSidebar}
            title="サイドバーを閉じる"
            aria-label="サイドバーを閉じる"
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        </div>
        <Button
          onClick={onCreateNew}
          variant="default"
          className="w-full justify-start gap-2 rounded-md shadow-md ring-1 ring-primary/25 hover:ring-primary/40"
          title="新規メモを作成"
        >
          <Plus className="w-4 h-4" /> New Memo
        </Button>
        <Button
          onClick={onOpenManager}
          variant="outline"
          className="w-full justify-start gap-2 rounded-md border border-border bg-background shadow-sm hover:bg-muted/80"
          title="メモ一覧の管理・一括操作"
        >
          <List className="w-4 h-4 shrink-0" /> 一覧管理
        </Button>
        <Button
          onClick={onOpenSettings}
          variant="outline"
          className="w-full justify-start gap-2 rounded-md border border-border bg-background shadow-sm hover:bg-muted/80"
          title="設定を開く"
        >
          <Settings className="w-4 h-4 shrink-0" /> 設定
        </Button>
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            id="app-search-input"
            placeholder="Search..."
            className="pl-8 bg-background/90 shadow-sm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1 px-3">
        <div className="space-y-4 pt-3">
          <div>
            <h4 className="mb-2 px-2 text-xs font-semibold tracking-tight text-muted-foreground flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <Pin className="w-3 h-3" /> Pinned
              </span>
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{pinned.length}</span>
            </h4>
            <div className="grid gap-1">
              {pinned.map((n) => (
                <Button
                  key={n.path}
                  variant={currentPath === n.path ? "secondary" : "ghost"}
                  className="h-auto w-full justify-start rounded-md py-1.5 font-normal"
                  onClick={() => onOpenNote(n.path)}
                  onContextMenu={(e) => onOpenContextMenu(e, n)}
                  onMouseEnter={(e) => onOpenHoverPreview(e, n)}
                  onMouseMove={onMoveHoverPreview}
                  onMouseLeave={onCloseHoverPreview}
                >
                  <span className="block min-w-0 text-left">
                    <span className="block truncate">{n.title}</span>
                    {renderNoteTags(n.tags)}
                  </span>
                </Button>
              ))}
              {pinned.length === 0 && <div className="px-2 py-1 text-xs text-muted-foreground">なし</div>}
            </div>
          </div>

          <Separator />

          <div>
            <h4 className="mb-2 px-2 text-xs font-semibold tracking-tight text-muted-foreground flex items-center justify-between gap-2">
              <button
                type="button"
                className="flex items-center gap-2 hover:text-foreground transition-colors"
                onClick={() => setIsRecentOpen((prev) => !prev)}
                title={isRecentOpen ? "Recent を折りたたむ" : "Recent を展開"}
              >
                {isRecentOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                <Clock className="w-3 h-3" /> Recent
              </button>
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{recent.length}</span>
            </h4>
            {isRecentOpen && (
              <div className="grid gap-1">
                {recent.map((n) => (
                  <Button
                    key={n.path}
                    variant={currentPath === n.path ? "secondary" : "ghost"}
                    className="h-auto w-full justify-start rounded-md py-1.5 font-normal"
                    onClick={() => onOpenNote(n.path)}
                    onContextMenu={(e) => onOpenContextMenu(e, n)}
                    onMouseEnter={(e) => onOpenHoverPreview(e, n)}
                    onMouseMove={onMoveHoverPreview}
                    onMouseLeave={onCloseHoverPreview}
                  >
                    <span className="block min-w-0 text-left">
                      <span className="block truncate">{n.title}</span>
                      {renderNoteTags(n.tags)}
                    </span>
                  </Button>
                ))}
                {recent.length === 0 && <div className="px-2 py-1 text-xs text-muted-foreground">なし</div>}
              </div>
            )}
          </div>
          {searchResults.length > 0 && (
            <>
              <Separator />
              <div>
                <h4 className="mb-2 px-2 text-xs font-semibold tracking-tight text-muted-foreground flex items-center justify-between">
                  <span>Search Results</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{searchResults.length}</span>
                </h4>
                <div className="grid gap-1">
                  {searchResults.slice(0, 8).map((r) => (
                    <button
                      key={`${r.path}:${r.line}:${r.text}`}
                      type="button"
                      className={`px-2 py-1 text-left text-xs rounded-md truncate transition-colors ${
                        activeHit && activeHit.path === r.path && activeHit.line === r.line && activeHit.text === r.text
                          ? "bg-muted text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      }`}
                      onClick={() => onOpenNote(r.path, r)}
                      title={`${r.path}:${r.line}`}
                    >
                      L{r.line}: {r.text}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </ScrollArea>

      <div className="p-4 border-t bg-background/70">
        <div
          className={cn(
            "flex items-center gap-2 text-xs",
            status === INBOX_EXCLUSIVE_MESSAGE || status.includes("失敗")
              ? "text-red-600 dark:text-red-400"
              : "text-muted-foreground"
          )}
        >
          <Settings className="w-4 h-4 shrink-0" />
          <span
            className={`inline-block size-2 shrink-0 rounded-full ${
              status === "Saved"
                ? "bg-emerald-500"
                : status === "Saving..."
                  ? "bg-amber-500"
                  : status.includes("失敗") || status === INBOX_EXCLUSIVE_MESSAGE
                    ? "bg-red-500"
                    : "bg-muted-foreground/60"
            }`}
          />
          <span className="min-w-0 break-words">{status}</span>
        </div>
      </div>
    </aside>
  );
}
