import { type MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { PanelLeftOpen, Plus } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { Sidebar } from "@/components/app/Sidebar";
import { ManagerPanel } from "@/components/app/ManagerPanel";
import { ReadingEditorPane } from "@/components/app/ReadingEditorPane";
import { Overlays } from "@/components/app/Overlays";
import type { NoteMeta, SearchHit } from "@/types/note";
import { useNotesData } from "@/hooks/useNotesData";
import { useHoverPreview } from "@/hooks/useHoverPreview";
import "./App.css";

type ContextMenuState = {
  note: NoteMeta;
  x: number;
  y: number;
};

function App() {
  const [input, setInput] = useState("");
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [activeHit, setActiveHit] = useState<SearchHit | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(288);
  const [previewWidth, setPreviewWidth] = useState(420);
  const [editorScale, setEditorScale] = useState(1);
  const [previewScale, setPreviewScale] = useState(1);

  const {
    query,
    setQuery,
    searchResults,
    status,
    setStatus,
    isManageMode,
    setIsManageMode,
    managerQuery,
    setManagerQuery,
    maxChars,
    setMaxChars,
    selectedPaths,
    pinned,
    recent,
    filteredDetails,
    loadNotes,
    loadNoteDetails,
    toggleSelect,
    selectAllFiltered,
    clearSelection,
    deleteSelected,
    openManager,
  } = useNotesData();

  const { hoverPreview, openHoverPreview, moveHoverPreview, closeHoverPreview } = useHoverPreview();
  const saveTimerRef = useRef<number | null>(null);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const currentFileName = useMemo(() => {
    if (!currentPath) return "新規メモ";
    const parts = currentPath.split(/[/\\]/);
    return parts[parts.length - 1] || currentPath;
  }, [currentPath]);

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  const startSidebarResize = (startClientX: number) => {
    const startWidth = sidebarWidth;
    const minWidth = 220;
    const maxWidth = Math.min(560, window.innerWidth - 520);

    const onMouseMove = (e: globalThis.MouseEvent) => {
      const next = clamp(startWidth + (e.clientX - startClientX), minWidth, maxWidth);
      setSidebarWidth(next);
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
  };

  const startPreviewResize = (startClientX: number) => {
    const startWidth = previewWidth;
    const minWidth = 300;
    const leftArea = (isSidebarOpen ? sidebarWidth : 0) + 280;
    const maxWidth = Math.min(900, window.innerWidth - leftArea);

    const onMouseMove = (e: globalThis.MouseEvent) => {
      const next = clamp(startWidth - (e.clientX - startClientX), minWidth, maxWidth);
      setPreviewWidth(next);
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
  };

  const adjustEditorScale = (delta: number) => {
    setEditorScale((prev) => clamp(Number((prev + delta).toFixed(2)), 0.8, 1.6));
  };

  const adjustPreviewScale = (delta: number) => {
    setPreviewScale((prev) => clamp(Number((prev + delta).toFixed(2)), 0.8, 1.6));
  };

  const resetEditorScale = () => {
    setEditorScale(1);
  };

  const resetPreviewScale = () => {
    setPreviewScale(1);
  };

  useEffect(() => {
    if (saveTimerRef.current != null) {
      window.clearTimeout(saveTimerRef.current);
    }
    if (!isEditMode) {
      return;
    }
    if (!input) {
      return;
    }

    saveTimerRef.current = window.setTimeout(() => {
      setStatus("Saving...");
      void invoke<string>("save_note", { content: input, currentPath: currentPath ?? undefined })
        .then((savedPath) => {
          setCurrentPath(savedPath);
          setStatus("Saved");
          return loadNotes();
        })
        .catch((err) => {
          console.error(err);
          setStatus("保存に失敗しました");
        });
    }, 500);

    return () => {
      if (saveTimerRef.current != null) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [input, currentPath, isEditMode]);

  const createNew = () => {
    setInput("");
    setCurrentPath(null);
    setActiveHit(null);
    setIsEditMode(true);
    setIsManageMode(false);
    setStatus("Ready");
  };

  const openNote = async (path: string, hit?: SearchHit) => {
    const content = await invoke<string>("read_note", { path });
    setCurrentPath(path);
    setInput(content);
    setActiveHit(hit ?? null);
    setIsEditMode(false);
    setIsManageMode(false);
    setStatus("Loaded");
  };

  const enterEditMode = () => {
    setIsEditMode(true);
    setIsManageMode(false);
    setActiveHit(null); // 編集開始時は検索ハイライトを消す
    setStatus("Edit mode");
  };

  const enterPreviewMode = () => {
    setIsEditMode(false);
    setIsManageMode(false);
    setStatus("Preview mode");
  };

  const openContextMenu = (e: MouseEvent, note: NoteMeta) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ note, x: e.clientX, y: e.clientY });
  };

  const pinOrUnpinNote = async (note: NoteMeta) => {
    await invoke("toggle_pin_note", { path: note.path, pinned: !note.pinned });
    await Promise.all([loadNotes(), loadNoteDetails()]);
    setContextMenu(null);
    setStatus(note.pinned ? "Unpinned" : "Pinned");
  };

  const deleteNote = async (note: NoteMeta) => {
    const ok = window.confirm(`「${note.title}」を削除しますか？`);
    if (!ok) return;
    await invoke("delete_note", { path: note.path });
    if (currentPath === note.path) {
      setCurrentPath(null);
      setInput("");
      setActiveHit(null);
      setIsEditMode(false);
    }
    await Promise.all([loadNotes(), loadNoteDetails()]);
    setContextMenu(null);
    setStatus("Deleted");
  };

  useEffect(() => {
    if (!activeHit) return;
    if (!isEditMode) return;
    if (!currentPath || activeHit.path !== currentPath) return;

    const textarea = editorRef.current;
    if (!textarea) return;

    const targetLine = Math.max(1, activeHit.line);
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
  }, [activeHit, currentPath, input, isEditMode]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", close);
    };
  }, [contextMenu]);

  return (
    <div className="flex h-screen w-full bg-gradient-to-br from-background via-background to-muted/30 text-foreground">
      {isSidebarOpen && (
        <>
          <div style={{ width: `${sidebarWidth}px` }} className="shrink-0 min-w-0">
            <Sidebar
              query={query}
              setQuery={setQuery}
              pinned={pinned}
              recent={recent}
              searchResults={searchResults}
              activeHit={activeHit}
              currentPath={currentPath}
              status={status}
              onCreateNew={createNew}
              onOpenManager={() => void openManager()}
              onOpenNote={(path, hit) => void openNote(path, hit)}
              onOpenContextMenu={openContextMenu}
              onOpenHoverPreview={openHoverPreview}
              onMoveHoverPreview={moveHoverPreview}
              onCloseHoverPreview={closeHoverPreview}
              onCloseSidebar={() => setIsSidebarOpen(false)}
            />
          </div>
          <div
            role="separator"
            aria-orientation="vertical"
            className="pane-resizer"
            onMouseDown={(e) => {
              e.preventDefault();
              startSidebarResize(e.clientX);
            }}
          />
        </>
      )}

      {!isSidebarOpen && (
        <>
          <Button
            variant="outline"
            size="icon-sm"
            className="fixed left-4 top-4 z-40 bg-background/90 shadow-sm"
            onClick={() => setIsSidebarOpen(true)}
            title="サイドバーを開く"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </Button>
          <Button
            variant="default"
            size="icon"
            className="fixed bottom-6 left-6 z-40 rounded-full shadow-lg"
            onClick={createNew}
            title="新規メモ"
          >
            <Plus className="h-5 w-5" />
          </Button>
        </>
      )}

      <div className="flex-1 min-w-0">
        {isManageMode ? (
          <ManagerPanel
            managerQuery={managerQuery}
            setManagerQuery={setManagerQuery}
            maxChars={maxChars}
            setMaxChars={setMaxChars}
            selectedCount={selectedPaths.size}
            filteredDetails={filteredDetails}
            selectedPaths={selectedPaths}
            onSelectAllFiltered={selectAllFiltered}
            onClearSelection={clearSelection}
            onClose={() => setIsManageMode(false)}
            onDeleteSelected={() => void deleteSelected()}
            onToggleSelect={toggleSelect}
            onOpenNote={(path) => void openNote(path)}
            onOpenHoverPreview={openHoverPreview}
            onMoveHoverPreview={moveHoverPreview}
            onCloseHoverPreview={closeHoverPreview}
          />
        ) : (
          <ReadingEditorPane
            isEditMode={isEditMode}
            currentFileName={currentFileName}
            input={input}
            previewWidth={previewWidth}
            editorScale={editorScale}
            previewScale={previewScale}
            onEnterEditMode={enterEditMode}
            onEnterPreviewMode={enterPreviewMode}
            onChangeInput={setInput}
            onStartPreviewResize={startPreviewResize}
            onAdjustEditorScale={adjustEditorScale}
            onAdjustPreviewScale={adjustPreviewScale}
            onResetEditorScale={resetEditorScale}
            onResetPreviewScale={resetPreviewScale}
            editorRef={editorRef}
          />
        )}
      </div>

      <Overlays
        contextMenu={contextMenu}
        hoverPreview={hoverPreview}
        onPinOrUnpin={(note) => void pinOrUnpinNote(note)}
        onDelete={(note) => void deleteNote(note)}
      />
    </div>
  );
}

export default App;
