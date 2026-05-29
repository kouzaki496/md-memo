import { type MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { PanelLeftOpen, Plus } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { Sidebar } from "@/components/app/Sidebar";
import { ManagerPanel } from "@/components/app/ManagerPanel";
import { SettingsPanel } from "@/components/app/SettingsPanel";
import { ReadingEditorPane } from "@/components/app/ReadingEditorPane";
import { Overlays } from "@/components/app/Overlays";
import type { NoteMeta, ReplaceTagGloballyResult, SearchHit } from "@/types/note";
import type { AppConfig, ThemeMode, ThemePreset } from "@/types/config";
import { useNotesData } from "@/hooks/useNotesData";
import { useHoverPreview } from "@/hooks/useHoverPreview";
import {
  DEFAULT_NEW_NOTE_TAG,
  dedupeTagsCaseInsensitive,
  ensureLockedInboxInTemplateTags,
  getInboxAddBlockedMessage,
  replaceTagTokenInList,
  toggleTagInContent,
} from "@/lib/noteTags";
import "./App.css";

type ContextMenuState = {
  note: NoteMeta;
  x: number;
  y: number;
};

function App() {
  const collapsedSidebarWidth = 72;
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
  const [isSettingsMode, setIsSettingsMode] = useState(false);
  const [configDraft, setConfigDraft] = useState<AppConfig | null>(null);
  const [savedSettingsSnapshot, setSavedSettingsSnapshot] = useState<string | null>(null);
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  const isSettingsDirty = useMemo(() => {
    if (!configDraft || savedSettingsSnapshot == null) return false;
    return JSON.stringify(configDraft) !== savedSettingsSnapshot;
  }, [configDraft, savedSettingsSnapshot]);

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

  const resolveIsDark = (mode: ThemeMode): boolean => {
    if (mode === "dark") return true;
    if (mode === "light") return false;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  };

  const applyTheme = (mode: ThemeMode) => {
    document.documentElement.classList.toggle("dark", resolveIsDark(mode));
  };

  const applyThemePreset = (preset: ThemePreset) => {
    const root = document.documentElement;
    if (preset === "default") root.removeAttribute("data-theme-preset");
    else root.setAttribute("data-theme-preset", preset);
  };

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
    const leftArea = (isSidebarOpen ? sidebarWidth : collapsedSidebarWidth) + 280;
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

  const loadConfig = async () => {
    const cfg = await invoke<AppConfig>("get_config");
    const merged = {
      ...cfg,
      templateTags: ensureLockedInboxInTemplateTags(cfg.templateTags ?? []),
      themeMode: cfg.themeMode ?? (cfg.darkMode ? "dark" : "light"),
      themePreset: cfg.themePreset ?? "default",
    };
    applyTheme(merged.themeMode);
    applyThemePreset(merged.themePreset);
    setConfigDraft(merged);
    setSavedSettingsSnapshot(JSON.stringify(merged));
    return merged;
  };

  useEffect(() => {
    void loadConfig().catch((err) => {
      console.error(err);
      applyTheme("light");
      applyThemePreset("default");
    });
  }, []);

  useEffect(() => {
    if (!configDraft) return;
    if (configDraft.themeMode !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [configDraft?.themeMode]);

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
    setInput(toggleTagInContent("", DEFAULT_NEW_NOTE_TAG));
    setCurrentPath(null);
    setActiveHit(null);
    setIsEditMode(true);
    setIsManageMode(false);
    setIsSettingsMode(false);
    setStatus("Ready");
  };

  const openNote = async (path: string, hit?: SearchHit) => {
    try {
      const content = await invoke<string>("read_note", { path });
      setCurrentPath(path);
      setInput(content);
      setActiveHit(hit ?? null);
      setIsEditMode(false);
      setIsManageMode(false);
      setIsSettingsMode(false);
      setStatus("Loaded");
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`メモを開けませんでした: ${msg}`);
      await loadNotes();
    }
  };

  const enterEditMode = () => {
    setIsEditMode(true);
    setIsManageMode(false);
    setIsSettingsMode(false);
    setActiveHit(null); // 編集開始時は検索ハイライトを消す
    setStatus("Edit mode");
  };

  const enterPreviewMode = () => {
    setIsEditMode(false);
    setIsManageMode(false);
    setIsSettingsMode(false);
    setStatus("Preview mode");
  };

  const openSettings = async () => {
    setIsSettingsMode(true);
    setIsManageMode(false);
    try {
      await loadConfig();
      setStatus("Settings");
    } catch (err) {
      console.error(err);
      setStatus("設定の読み込みに失敗しました");
    }
  };

  const saveSettings = async () => {
    if (!configDraft) return;
    setIsSavingConfig(true);
    try {
      const payload = {
        ...configDraft,
        templateTags: ensureLockedInboxInTemplateTags(configDraft.templateTags),
      };
      await invoke("save_config", { config: payload });
      applyTheme(payload.themeMode);
      applyThemePreset(payload.themePreset);
      setConfigDraft(payload);
      setSavedSettingsSnapshot(JSON.stringify(payload));
      await Promise.all([loadNotes(), loadNoteDetails()]);
      setStatus("設定を保存しました");
    } catch (err) {
      console.error(err);
      setStatus("設定の保存に失敗しました");
    } finally {
      setIsSavingConfig(false);
    }
  };

  const normalizePathKey = (p: string) => p.replace(/\\/g, "/").toLowerCase();

  const replaceTagGlobally = async (from: string, to: string) => {
    const res = await invoke<ReplaceTagGloballyResult>("replace_tag_globally", { fromTag: from, toTag: to });
    await Promise.all([loadNotes(), loadNoteDetails()]);
    const changed = new Set(res.changedPaths.map(normalizePathKey));
    if (currentPath && changed.has(normalizePathKey(currentPath))) {
      const content = await invoke<string>("read_note", { path: currentPath });
      setInput(content);
    }
    if (!isSettingsDirty) {
      await loadConfig();
    } else if (configDraft) {
      setConfigDraft({
        ...configDraft,
        templateTags: ensureLockedInboxInTemplateTags(
          dedupeTagsCaseInsensitive(replaceTagTokenInList(configDraft.templateTags, from, to))
        ),
      });
    }
    setStatus(`タグを置換しました（メモ ${res.filesChanged} 件を更新）`);
  };

  const closeSettings = () => {
    if (isSettingsDirty) {
      const ok = window.confirm("設定に未保存の変更があります。保存せず閉じますか？");
      if (!ok) return;
    }
    if (savedSettingsSnapshot) {
      try {
        const restored = JSON.parse(savedSettingsSnapshot) as AppConfig;
        const normalized: AppConfig = {
          ...restored,
          themeMode: restored.themeMode ?? (restored.darkMode ? "dark" : "light"),
          themePreset: restored.themePreset ?? "default",
        };
        setConfigDraft(normalized);
        applyTheme(normalized.themeMode);
        applyThemePreset(normalized.themePreset);
      } catch {
        /* ignore */
      }
    }
    setIsSettingsMode(false);
  };

  const toggleTemplateTag = (rawTag: string) => {
    setInput((prev) => {
      const blocked = getInboxAddBlockedMessage(prev, rawTag);
      if (blocked) {
        queueMicrotask(() => setStatus(blocked));
        return prev;
      }
      return toggleTagInContent(prev, rawTag);
    });
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

  const deleteCurrentNote = () => {
    if (!currentPath) return;
    const fromList =
      pinned.find((n) => n.path === currentPath) ?? recent.find((n) => n.path === currentPath);
    const meta: NoteMeta = fromList ?? { path: currentPath, title: currentFileName, pinned: false, tags: [] };
    void deleteNote(meta);
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

  useEffect(() => {
    void loadConfig().catch((err) => {
      console.error(err);
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() !== "f") return;

      if (!e.shiftKey) {
        // Ctrl/Cmd + F は WebView 既定検索へ
        return;
      }
      // Ctrl/Cmd + Shift + F はアプリ内（自前）検索へ
      e.preventDefault();

      if (!isSidebarOpen) {
        setIsSidebarOpen(true);
      }

      requestAnimationFrame(() => {
        const input = document.getElementById("app-search-input");
        if (input instanceof HTMLInputElement) {
          input.focus();
          input.select();
        }
      });
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isSidebarOpen]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-gradient-to-br from-background via-background to-muted/30 text-foreground">
      {isSidebarOpen ? (
        <>
          <div style={{ width: `${sidebarWidth}px` }} className="h-full min-h-0 shrink-0 min-w-0">
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
              onOpenManager={() => {
                setIsSettingsMode(false);
                void openManager();
              }}
              onOpenSettings={() => void openSettings()}
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
      ) : (
        <>
          <aside
            className="h-full min-h-0 shrink-0 border-r bg-muted/25 px-2 py-3"
            style={{ width: `${collapsedSidebarWidth}px` }}
          >
            <div className="flex h-full flex-col items-center gap-2">
              <Button
                variant="outline"
                size="icon-sm"
                className="rounded-md border border-border bg-background/95 shadow-sm hover:bg-muted/80"
                onClick={() => setIsSidebarOpen(true)}
                title="サイドバーを開く"
                aria-label="サイドバーを開く"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </Button>
              <Button
                variant="default"
                size="icon-sm"
                className="rounded-md shadow-sm ring-1 ring-primary/25 hover:ring-primary/40"
                onClick={createNew}
                title="新規メモを作成"
                aria-label="新規メモを作成"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </aside>
        </>
      )}

      <div className="flex min-h-0 flex-1 min-w-0 flex-col">
        {isSettingsMode && configDraft ? (
          <SettingsPanel
            config={configDraft}
            isSaving={isSavingConfig}
            hasUnsavedChanges={isSettingsDirty}
            onChangeConfig={(next) => {
              setConfigDraft(next);
              applyTheme(next.themeMode);
              applyThemePreset(next.themePreset);
            }}
            onSave={() => void saveSettings()}
            onClose={closeSettings}
            onReplaceTagGlobally={(from, to) => replaceTagGlobally(from, to)}
          />
        ) : isManageMode ? (
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
            currentPath={currentPath}
            currentFileName={currentFileName}
            input={input}
            previewWidth={previewWidth}
            editorScale={editorScale}
            previewScale={previewScale}
            templateTags={configDraft?.templateTags ?? []}
            onEnterEditMode={enterEditMode}
            onEnterPreviewMode={enterPreviewMode}
            onChangeInput={setInput}
            onToggleTemplateTag={toggleTemplateTag}
            onStartPreviewResize={startPreviewResize}
            onAdjustEditorScale={adjustEditorScale}
            onAdjustPreviewScale={adjustPreviewScale}
            onResetEditorScale={resetEditorScale}
            onResetPreviewScale={resetPreviewScale}
            onDeleteCurrentNote={deleteCurrentNote}
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
