import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Clock, ExternalLink, List, Lock, Monitor, PanelLeftClose, Pin, Plus, Search, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { isLineSearchHit, isMixedSearchMode, isFuzzySearchHit, isTagSearchHit, isTagSearchMode } from "@/types/note";
import { SearchFuzzyBadge } from "@/components/app/SearchMatchHint";
import { useSidebarContext } from "@/contexts/SidebarContext";
import { INBOX_EXCLUSIVE_MESSAGE } from "@/lib/noteTags";
import { fileNameFromPath } from "@/lib/notePath";
import { messages } from "@/lib/messages";
import { cn } from "@/lib/utils";

/** サイドバー検索結果のプレビュー件数。超過分は一覧管理へ誘導する。 */
const SIDEBAR_SEARCH_PREVIEW_LIMIT = 8;

export function Sidebar() {
  const { search, notes, presentation, actions, interactions, status } = useSidebarContext();
  const {
    query,
    setQuery,
    results: searchResults,
    mode: searchMode,
    error: searchError,
    pending: searchPending,
    activeHit,
  } = search;
  const { pinned, recent, currentPath } = notes;
  const {
    activePresentations,
    presentedPaths,
    openPresentedNote,
    reopenPresentationTab,
  } = presentation;
  const {
    createNew: onCreateNew,
    openManager: onOpenManager,
    openSettings: onOpenSettings,
    openNote: onOpenNote,
    closeSidebar: onCloseSidebar,
  } = actions;
  const {
    openContextMenu: onOpenContextMenu,
    openContextMenuForPath: onOpenContextMenuForPath,
    openHoverPreview: onOpenHoverPreview,
    moveHoverPreview: onMoveHoverPreview,
    closeHoverPreview: onCloseHoverPreview,
  } = interactions;
  const isSearching = query.trim().length > 0;
  const isTagSearch = isTagSearchMode(searchMode);
  const isMixedSearch = isMixedSearchMode(searchMode);
  const searchResultsTitle = isTagSearch
    ? messages.sidebar.searchResultsTags
    : isMixedSearch
      ? messages.sidebar.searchResultsMixed
      : messages.sidebar.searchResults;
  const [isRecentOpen, setIsRecentOpen] = useState(true);
  const prevIsSearchingRef = useRef(false);

  useEffect(() => {
    if (!prevIsSearchingRef.current && isSearching) {
      setIsRecentOpen(false);
    }
    prevIsSearchingRef.current = isSearching;
  }, [isSearching]);

  const renderPresentingBadge = (path: string) => {
    if (!presentedPaths.has(path)) return null;
    return (
      <Monitor
        className="h-3 w-3 shrink-0 text-primary"
        aria-label={messages.sidebar.presenting}
      />
    );
  };

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
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{messages.sidebar.appName}</div>
          <Button
            variant="toolbar"
            size="icon-sm"
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
          <Plus className="w-4 h-4" /> {messages.sidebar.newMemo}
        </Button>
        <Button
          onClick={() => onOpenManager()}
          variant="toolbar"
          className="w-full justify-start gap-2"
          title="メモ一覧の管理・一括操作"
        >
          <List className="w-4 h-4 shrink-0" /> {messages.sidebar.manager}
        </Button>
        <Button
          onClick={onOpenSettings}
          variant="toolbar"
          className="w-full justify-start gap-2"
          title="設定を開く"
        >
          <Settings className="w-4 h-4 shrink-0" /> {messages.sidebar.settings}
        </Button>
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            id="app-search-input"
            placeholder={messages.sidebar.searchPlaceholder}
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
                <Pin className="w-3 h-3" /> {messages.sidebar.pinned}
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
                    <span className="flex min-w-0 items-center gap-1 truncate">
                      <span className="truncate">{n.title}</span>
                      {renderPresentingBadge(n.path)}
                      {n.systemNote && (
                        <Lock className="h-3 w-3 shrink-0 text-muted-foreground" aria-label={messages.aria.builtinNote} />
                      )}
                    </span>
                    {renderNoteTags(n.tags)}
                  </span>
                </Button>
              ))}
              {pinned.length === 0 && <div className="px-2 py-1 text-xs text-muted-foreground">{messages.sidebar.empty}</div>}
            </div>
          </div>

          <Separator />

          <div>
            <h4 className="mb-2 px-2 text-xs font-semibold tracking-tight text-muted-foreground flex items-center justify-between gap-2">
              <button
                type="button"
                className="flex items-center gap-2 hover:text-foreground transition-colors"
                onClick={() => setIsRecentOpen((prev) => !prev)}
                title={isRecentOpen ? messages.sidebar.recentCollapse : messages.sidebar.recentExpand}
              >
                {isRecentOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                <Clock className="w-3 h-3" /> {messages.sidebar.recent}
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
                      <span className="flex min-w-0 items-center gap-1 truncate">
                        <span className="truncate">{n.title}</span>
                        {renderPresentingBadge(n.path)}
                      </span>
                      {renderNoteTags(n.tags)}
                    </span>
                  </Button>
                ))}
                {recent.length === 0 && <div className="px-2 py-1 text-xs text-muted-foreground">{messages.sidebar.empty}</div>}
              </div>
            )}
          </div>
          {isSearching && (
            <>
              <Separator />
              <div>
                <h4 className="mb-2 px-2 text-xs font-semibold tracking-tight text-muted-foreground flex items-center justify-between">
                  <span>{searchResultsTitle}</span>
                  {searchResults.length > 0 && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{searchResults.length}</span>
                  )}
                </h4>
                {searchResults.length > 0 ? (
                  <div className="grid gap-1">
                    {searchResults.slice(0, SIDEBAR_SEARCH_PREVIEW_LIMIT).map((r) => {
                      const fileName = fileNameFromPath(r.path);
                      const tagHit = isTagSearchHit(r);
                      const lineHit = isLineSearchHit(r);
                      const label = tagHit
                        ? messages.sidebar.tagHit(fileName, r.text)
                        : messages.sidebar.lineHit(r.line, r.text);
                      const isActive = tagHit
                        ? currentPath === r.path
                        : Boolean(
                            activeHit &&
                              activeHit.path === r.path &&
                              activeHit.line === r.line &&
                              activeHit.text === r.text
                          );
                      return (
                        <div
                          key={`${r.path}:${r.line}:${r.text}`}
                          className={`flex min-w-0 items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors ${
                            isActive
                              ? "bg-muted text-foreground shadow-sm"
                              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                          }`}
                          onContextMenu={(e) => onOpenContextMenuForPath(e, r.path)}
                        >
                          <button
                            type="button"
                            className="min-w-0 flex-1 truncate text-left"
                            onClick={() => onOpenNote(r.path, lineHit ? r : undefined)}
                            title={label}
                          >
                            {label}
                          </button>
                          {isFuzzySearchHit(r) && <SearchFuzzyBadge />}
                        </div>
                      );
                    })}
                    {searchResults.length > SIDEBAR_SEARCH_PREVIEW_LIMIT && (
                      <button
                        type="button"
                        className="px-2 py-1.5 text-left text-xs text-primary hover:underline"
                        onClick={() => onOpenManager({ withCurrentSearch: true })}
                      >
                        {messages.sidebar.searchViewInManager(
                          searchResults.length - SIDEBAR_SEARCH_PREVIEW_LIMIT
                        )}
                      </button>
                    )}
                  </div>
                ) : searchPending ? (
                  <div className="px-2 py-1 text-xs text-muted-foreground">{messages.sidebar.searchSearching}</div>
                ) : searchError ? (
                  <div className="px-2 py-1 text-xs text-destructive">{messages.status.searchFailed}</div>
                ) : (
                  <div className="px-2 py-1 text-xs text-muted-foreground">{messages.sidebar.searchNoResults}</div>
                )}
              </div>
            </>
          )}
        </div>
      </ScrollArea>

      {activePresentations.length > 0 && (
        <div className="border-t bg-primary/5 px-3 py-2">
          <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-primary">
            <Monitor className="h-3 w-3 shrink-0" />
            {messages.sidebar.presenting}
            <span className="rounded bg-primary/10 px-1.5 py-0 text-[10px] font-normal">
              {messages.sidebar.presentingCount(activePresentations.length)}
            </span>
          </h4>
          <ul className="space-y-1">
            {activePresentations.map((p) => {
              const key = p.boundPath ?? `unsaved:${p.fileName}`;
              const isCurrent = p.boundPath === currentPath;
              return (
                <li key={key} className="flex items-center gap-1">
                  {p.boundPath ? (
                    <button
                      type="button"
                      className={cn(
                        "min-w-0 flex-1 truncate text-left text-xs hover:underline",
                        isCurrent ? "font-medium text-foreground" : "text-muted-foreground"
                      )}
                      onClick={() => openPresentedNote(p.boundPath!)}
                      title={messages.sidebar.presentingOpenNote}
                    >
                      {p.fileName}
                    </button>
                  ) : (
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate text-left text-xs",
                        isCurrent ? "font-medium text-foreground" : "text-muted-foreground"
                      )}
                      title={p.fileName}
                    >
                      {p.fileName}
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="h-6 w-6 shrink-0"
                    onClick={() => reopenPresentationTab(p)}
                    title={messages.sidebar.presentingOpenTab}
                    aria-label={messages.sidebar.presentingOpenTab}
                  >
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

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
              status === messages.status.saved
                ? "bg-emerald-500"
                : status === messages.status.saving
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
