import { type MouseEvent } from "react";
import { Clock, PanelLeftClose, Pin, Plus, Search, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import type { NoteMeta, SearchHit } from "@/types/note";

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
    onOpenNote,
    onOpenContextMenu,
    onOpenHoverPreview,
    onMoveHoverPreview,
    onCloseHoverPreview,
    onCloseSidebar,
  } = props;

  return (
    <aside className="h-full w-full border-r bg-muted/35 backdrop-blur supports-[backdrop-filter]:bg-muted/20 flex flex-col">
      <div className="p-4 space-y-4 border-b bg-background/70">
        <div className="flex items-center justify-between">
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Memo Desk</div>
          <Button variant="ghost" size="icon-sm" onClick={onCloseSidebar} title="サイドバーを閉じる">
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        </div>
        <Button
          onClick={onCreateNew}
          variant="outline"
          className="w-full justify-start gap-2 border-dashed bg-background shadow-sm hover:shadow"
        >
          <Plus className="w-4 h-4" /> New Memo
        </Button>
        <Button onClick={onOpenManager} variant="ghost" className="w-full justify-start gap-2 rounded-md bg-background/70">
          一覧管理
        </Button>
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search..."
            className="pl-8 bg-background/90 shadow-sm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <ScrollArea className="flex-1 px-3">
        <div className="space-y-4">
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
                  className="w-full justify-start font-normal rounded-md"
                  onClick={() => onOpenNote(n.path)}
                  onContextMenu={(e) => onOpenContextMenu(e, n)}
                  onMouseEnter={(e) => onOpenHoverPreview(e, n)}
                  onMouseMove={onMoveHoverPreview}
                  onMouseLeave={onCloseHoverPreview}
                >
                  {n.title}
                </Button>
              ))}
              {pinned.length === 0 && <div className="px-2 py-1 text-xs text-muted-foreground">なし</div>}
            </div>
          </div>

          <Separator />

          <div>
            <h4 className="mb-2 px-2 text-xs font-semibold tracking-tight text-muted-foreground flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <Clock className="w-3 h-3" /> Recent
              </span>
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{recent.length}</span>
            </h4>
            <div className="grid gap-1">
              {recent.map((n) => (
                <Button
                  key={n.path}
                  variant={currentPath === n.path ? "secondary" : "ghost"}
                  className="w-full justify-start font-normal rounded-md"
                  onClick={() => onOpenNote(n.path)}
                  onContextMenu={(e) => onOpenContextMenu(e, n)}
                  onMouseEnter={(e) => onOpenHoverPreview(e, n)}
                  onMouseMove={onMoveHoverPreview}
                  onMouseLeave={onCloseHoverPreview}
                >
                  {n.title}
                </Button>
              ))}
              {recent.length === 0 && <div className="px-2 py-1 text-xs text-muted-foreground">なし</div>}
            </div>
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
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Settings className="w-4 h-4" />
          <span
            className={`inline-block size-2 rounded-full ${
              status === "Saved"
                ? "bg-emerald-500"
                : status === "Saving..."
                  ? "bg-amber-500"
                  : status.includes("失敗")
                    ? "bg-red-500"
                    : "bg-muted-foreground/60"
            }`}
          />
          {status}
        </div>
      </div>
    </aside>
  );
}
