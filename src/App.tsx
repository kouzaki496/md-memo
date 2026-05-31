import { type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PanelLeftOpen, Plus } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/button";
import { Sidebar } from "@/components/app/Sidebar";
import { ManagerPanel } from "@/components/app/ManagerPanel";
import { FirstRunSetupDialog } from "@/components/app/FirstRunSetupDialog";
import { SettingsPanel } from "@/components/app/SettingsPanel";
import { ReadingEditorPane } from "@/components/app/ReadingEditorPane";
import { Overlays } from "@/components/app/Overlays";
import type { NoteMeta, ReplaceTagGloballyResult, SearchHit, SearchMode } from "@/types/note";
import type { AppConfig } from "@/types/config";
import { useNotesData } from "@/hooks/useNotesData";
import { useHoverPreview } from "@/hooks/useHoverPreview";
import { useEditLockDemotion } from "@/hooks/useEditLockDemotion";
import { acquireEditLock, releaseEditLock } from "@/lib/editLock";
import {
  DEFAULT_NEW_NOTE_TAG,
  collectTagsFromNotes,
  dedupeTagsCaseInsensitive,
  ensureLockedInboxInTemplateTags,
  getMarkdownBody,
  getOrphanTags,
  getTagToggleBlockedMessage,
  replaceTagTokenInList,
  toggleTagInContent,
} from "@/lib/noteTags";
import { isBuiltinReservedTagName } from "@/lib/reservedTags";
import { isSystemNotePath } from "@/lib/systemNotes";
import { messages } from "@/lib/messages";
import { openNoteInNewWindow } from "@/lib/noteWindow";
import {
  endPresentation,
  getPresentationViewerUrl,
  isSamePresentationMemo,
  listPresentationStatuses,
  pushPresentationUpdate,
  setPresentationDisplay,
  setPresentationRealtime,
  setPresentationScroll,
  startPresentation,
  syncPresentationTheme,
} from "@/lib/presentation";
import { formatAppError } from "@/lib/appError";
import { confirmUser } from "@/lib/confirmUser";
import { DEFAULT_NOTES_DIR, isSetupCompleted, needsInitialSetup } from "@/lib/config";
import { isSettingsConfigDirty } from "@/lib/settingsCompare";
import { applyTheme, applyThemePreset } from "@/lib/theme";
import { PresentationBar } from "@/components/app/PresentationBar";
import { PresentationScopeHint } from "@/components/app/PresentationScopeHint";
import { PresentationStartDialog } from "@/components/app/PresentationStartDialog";
import type { PresentationStatus } from "@/types/presentation";
import "./App.css";

type ContextMenuState = {
  note: NoteMeta;
  x: number;
  y: number;
};

type PreviewSearchContext = { query: string; mode: SearchMode };

function App() {
  const collapsedSidebarWidth = 72;
  const [input, setInput] = useState("");
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [activeHit, setActiveHit] = useState<SearchHit | null>(null);
  const [previewSearch, setPreviewSearch] = useState<PreviewSearchContext | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(288);
  const [previewWidth, setPreviewWidth] = useState(420);
  const [contentScale, setContentScale] = useState(1);
  const [isSettingsMode, setIsSettingsMode] = useState(false);
  const [configDraft, setConfigDraft] = useState<AppConfig | null>(null);
  const [savedSettingsSnapshot, setSavedSettingsSnapshot] = useState<string | null>(null);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [activePresentations, setActivePresentations] = useState<PresentationStatus[]>([]);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [presentationStartOpen, setPresentationStartOpen] = useState(false);
  const [presentationStartRealtime, setPresentationStartRealtime] = useState(true);
  const [firstRunNotesDir, setFirstRunNotesDir] = useState(DEFAULT_NOTES_DIR);
  const viewerOpenedRef = useRef(false);

  const notesInitEnabled = isSetupCompleted(configDraft);

  const currentPresentation = useMemo(
    () => activePresentations.find((p) => isSamePresentationMemo(p, currentPath)) ?? null,
    [activePresentations, currentPath]
  );

  const presentedPaths = useMemo(
    () =>
      new Set(
        activePresentations
          .map((p) => p.boundPath)
          .filter((path): path is string => path != null)
      ),
    [activePresentations]
  );

  const isSettingsDirty = useMemo(
    () => isSettingsConfigDirty(configDraft, savedSettingsSnapshot),
    [configDraft, savedSettingsSnapshot]
  );

  const setConfigDraftLive = (next: AppConfig) => {
    configDraftRef.current = next;
    setConfigDraft(next);
  };

  const setSavedSettingsSnapshotLive = (snapshot: string) => {
    savedSettingsSnapshotRef.current = snapshot;
    setSavedSettingsSnapshot(snapshot);
  };

  const {
    query,
    setQuery,
    searchResults,
    searchMode,
    searchError,
    searchPending,
    status,
    setStatus,
    isManageMode,
    setIsManageMode,
    closeManager,
    managerQuery,
    setManagerQuery,
    maxChars,
    setMaxChars,
    selectedPaths,
    notes,
    pinned,
    recent,
    filteredDetails,
    managerSearchError,
    managerSearchPending,
    managerSearchMode,
    loadNotes,
    loadNoteDetails,
    toggleSelect,
    selectAllFiltered,
    clearSelection,
    deleteSelected,
    openManager,
  } = useNotesData(notesInitEnabled);

  const showFirstRunSetup = configDraft != null && needsInitialSetup(configDraft);

  const { hoverPreview, openHoverPreview, moveHoverPreview, closeHoverPreview } = useHoverPreview();
  const saveTimerRef = useRef<number | null>(null);
  const presentationPushTimerRef = useRef<number | null>(null);
  const presentationScrollTimerRef = useRef<number | null>(null);
  const lastPresentationScrollRatioRef = useRef<number | null>(null);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const configDraftRef = useRef<AppConfig | null>(null);
  const savedSettingsSnapshotRef = useRef<string | null>(null);
  const isSettingsModeRef = useRef(false);
  const activePresentationsRef = useRef(activePresentations);
  configDraftRef.current = configDraft;
  savedSettingsSnapshotRef.current = savedSettingsSnapshot;
  isSettingsModeRef.current = isSettingsMode;
  activePresentationsRef.current = activePresentations;
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

  const adjustContentScale = (delta: number) => {
    setContentScale((prev) => clamp(Number((prev + delta).toFixed(2)), 0.8, 1.6));
  };

  const resetContentScale = () => {
    setContentScale(1);
  };

  const loadConfig = async () => {
    const cfg = await invoke<AppConfig>("get_config");
    const setupPending = needsInitialSetup(cfg);
    const merged = {
      ...cfg,
      notesDir: cfg.notesDir?.trim() || DEFAULT_NOTES_DIR,
      setupCompleted: setupPending ? false : cfg.setupCompleted,
      templateTags: ensureLockedInboxInTemplateTags(cfg.templateTags ?? []),
      themeMode: cfg.themeMode ?? (cfg.darkMode ? "dark" : "light"),
      themePreset: cfg.themePreset ?? "default",
    };
    applyTheme(merged.themeMode);
    applyThemePreset(merged.themePreset);
    setConfigDraftLive(merged);
    setSavedSettingsSnapshotLive(JSON.stringify(merged));
    return merged;
  };

  const refreshActivePresentations = async () => {
    const list = await listPresentationStatuses();
    setActivePresentations(list);
    if (list[0]?.url) {
      setViewerUrl(list[0].url);
    } else {
      const url = await getPresentationViewerUrl();
      if (url) setViewerUrl(url);
    }
    return list;
  };

  const syncViewerThemeIfPresenting = async () => {
    if (!configDraft) return;
    if (activePresentationsRef.current.length === 0) return;
    await syncPresentationTheme(configDraft.themeMode, configDraft.themePreset);
  };

  useEffect(() => {
    void loadConfig().catch((err) => {
      console.error(err);
      applyTheme("light");
      applyThemePreset("default");
    });
    void refreshActivePresentations().catch((err) => console.error(err));
  }, []);

  useEffect(() => {
    if (configDraft && needsInitialSetup(configDraft)) {
      setFirstRunNotesDir(configDraft.notesDir || DEFAULT_NOTES_DIR);
    }
  }, [configDraft]);

  useEffect(() => {
    if (!configDraft) return;
    if (configDraft.themeMode !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      applyTheme("system");
      void syncViewerThemeIfPresenting().catch((err) => console.error(err));
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [configDraft?.themeMode, activePresentations.length]);

  useEffect(() => {
    if (!configDraft) return;
    if (activePresentations.length === 0) return;
    void syncPresentationTheme(configDraft.themeMode, configDraft.themePreset).catch((err) =>
      console.error(err)
    );
  }, [configDraft?.themeMode, configDraft?.themePreset, activePresentations.length]);

  const tagsInUse = useMemo(() => collectTagsFromNotes(notes), [notes]);

  const templateTags = useMemo(
    () => ensureLockedInboxInTemplateTags(configDraft?.templateTags ?? []),
    [configDraft?.templateTags]
  );

  const orphanTags = useMemo(
    () => (configDraft ? getOrphanTags(configDraft.templateTags, tagsInUse) : []),
    [configDraft, tagsInUse]
  );

  const reservedTagsInUse = useMemo(
    () => tagsInUse.filter((tag) => isBuiltinReservedTagName(tag)),
    [tagsInUse]
  );

  const isCurrentSystemNote = isSystemNotePath(currentPath);

  const editStateRef = useRef({
    isEditMode,
    input,
    currentPath,
    isCurrentSystemNote,
  });
  editStateRef.current = { isEditMode, input, currentPath, isCurrentSystemNote };

  const flushSave = async () => {
    if (saveTimerRef.current != null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const { isEditMode: editing, input: text, currentPath: path, isCurrentSystemNote: readOnly } =
      editStateRef.current;
    if (!editing || readOnly || !text) return;
    setStatus(messages.status.saving);
    try {
      const savedPath = await invoke<string>("save_note", {
        content: text,
        currentPath: path ?? undefined,
      });
      setCurrentPath(savedPath);
      setStatus(messages.status.saved);
      await loadNotes();
    } catch (err) {
      console.error(err);
      setStatus(formatAppError(err));
    }
  };

  const reloadCurrentNoteFromDisk = async () => {
    const path = editStateRef.current.currentPath;
    if (!path) return;
    try {
      const content = await invoke<string>("read_note", { path });
      setInput(content);
    } catch (err) {
      console.error(err);
    }
  };

  useEditLockDemotion({
    getState: () => ({ isEditMode: editStateRef.current.isEditMode }),
    flushSave,
    reloadFromDisk: reloadCurrentNoteFromDisk,
    exitEditMode: () => {
      setIsEditMode(false);
      setStatus(messages.status.previewMode);
    },
  });

  useEffect(() => {
    if (isCurrentSystemNote && isEditMode) {
      setIsEditMode(false);
    }
  }, [isCurrentSystemNote, isEditMode]);

  useEffect(() => {
    if (saveTimerRef.current != null) {
      window.clearTimeout(saveTimerRef.current);
    }
    if (!isEditMode) {
      return;
    }
    if (isCurrentSystemNote) {
      return;
    }
    if (!input) {
      return;
    }

    saveTimerRef.current = window.setTimeout(() => {
      setStatus(messages.status.saving);
      void invoke<string>("save_note", { content: input, currentPath: currentPath ?? undefined })
        .then((savedPath) => {
          setCurrentPath(savedPath);
          setStatus(messages.status.saved);
          return loadNotes();
        })
        .catch((err) => {
          console.error(err);
          setStatus(formatAppError(err));
        });
    }, 500);

    return () => {
      if (saveTimerRef.current != null) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [input, currentPath, isEditMode, isCurrentSystemNote]);

  const createNew = () => {
    void (async () => {
      if (!(await exitSettingsIfAllowed())) return;
      if (isEditMode) {
        await flushSave();
        await releaseEditLock();
      }
      setInput(toggleTagInContent("", DEFAULT_NEW_NOTE_TAG));
      setCurrentPath(null);
      setActiveHit(null);
      setIsManageMode(false);
      try {
        await acquireEditLock(null);
        setIsEditMode(true);
        setStatus(messages.status.ready);
      } catch (err) {
        console.error(err);
      }
    })();
  };

  const openNote = async (
    path: string,
    hit?: SearchHit,
    highlight: PreviewSearchContext | null = null
  ) => {
    if (!(await exitSettingsIfAllowed())) return;
    if (isEditMode) {
      await flushSave();
      await releaseEditLock();
    }
    try {
      const content = await invoke<string>("read_note", { path });
      setCurrentPath(path);
      setInput(content);
      setActiveHit(hit ?? null);
      setPreviewSearch(highlight);
      setIsEditMode(false);
      setIsManageMode(false);
      setStatus(messages.status.loaded);
    } catch (err) {
      console.error(err);
      setStatus(formatAppError(err));
      await loadNotes();
    }
  };

  const enterEditMode = () => {
    if (isSystemNotePath(currentPath)) {
      setStatus(messages.status.builtinReadOnly);
      return;
    }
    void (async () => {
      try {
        await acquireEditLock(currentPath);
        setIsEditMode(true);
        setIsManageMode(false);
        setIsSettingsMode(false);
        setActiveHit(null);
        setStatus(messages.status.editMode);
      } catch (err) {
        console.error(err);
      }
    })();
  };

  const enterPreviewMode = () => {
    void (async () => {
      if (isEditMode) {
        await releaseEditLock();
      }
      setIsEditMode(false);
      setIsManageMode(false);
      setIsSettingsMode(false);
      setStatus(messages.status.previewMode);
    })();
  };

  const openSettings = async () => {
    if (isEditMode) {
      await flushSave();
      await releaseEditLock();
      setIsEditMode(false);
    }
    setIsSettingsMode(true);
    setIsManageMode(false);
    try {
      await loadConfig();
      setStatus(messages.status.settings);
    } catch (err) {
      console.error(err);
      setStatus(messages.status.settingsLoadFailed);
    }
  };

  const handleCompleteInitialSetup = async () => {
    if (!configDraft) return;
    setIsSavingConfig(true);
    try {
      const payload = {
        ...configDraft,
        notesDir: firstRunNotesDir.trim(),
        setupCompleted: true,
        templateTags: ensureLockedInboxInTemplateTags(configDraft.templateTags),
      };
      await invoke("save_config", { config: payload });
      applyTheme(payload.themeMode);
      applyThemePreset(payload.themePreset);
      setConfigDraftLive(payload);
      setSavedSettingsSnapshotLive(JSON.stringify(payload));
      setStatus(messages.firstRun.completed);
    } catch (err) {
      setStatus(formatAppError(err));
    } finally {
      setIsSavingConfig(false);
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
      setConfigDraftLive(payload);
      setSavedSettingsSnapshotLive(JSON.stringify(payload));
      await Promise.all([loadNotes(), loadNoteDetails()]);
      setStatus(messages.status.settingsSaved);
    } catch (err) {
      console.error(err);
      setStatus(formatAppError(err));
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
      setConfigDraftLive({
        ...configDraft,
        templateTags: ensureLockedInboxInTemplateTags(
          dedupeTagsCaseInsensitive(replaceTagTokenInList(configDraft.templateTags, from, to))
        ),
      });
    }
    setStatus(messages.status.tagReplaced(res.filesChanged));
  };

  const addOrphanToTemplate = (tag: string) => {
    if (!configDraft) return;
    if (configDraft.templateTags.some((t) => t.toLowerCase() === tag.toLowerCase())) return;
    setConfigDraftLive({
      ...configDraft,
      templateTags: ensureLockedInboxInTemplateTags([...configDraft.templateTags, tag]),
    });
  };

  const removeTagFromAllMemos = async (tag: string) => {
    const ok = window.confirm(messages.confirm.removeTagGlobally(tag));
    if (!ok) return;
    const res = await invoke<ReplaceTagGloballyResult>("remove_tag_globally", { tag });
    if (configDraft) {
      const nextConfig = {
        ...configDraft,
        templateTags: ensureLockedInboxInTemplateTags(res.templateTags),
      };
      setConfigDraftLive(nextConfig);
      if (!isSettingsDirty) {
        setSavedSettingsSnapshotLive(JSON.stringify(nextConfig));
      }
    }
    await Promise.all([loadNotes(), loadNoteDetails()]);
    if (currentPath && res.changedPaths.some((p) => p === currentPath)) {
      const content = await invoke<string>("read_note", { path: currentPath });
      setInput(content);
    }
    setStatus(messages.status.tagRemoved(tag, res.filesChanged));
  };

  const discardSettingsChanges = () => {
    const snapshot = savedSettingsSnapshotRef.current;
    if (!snapshot) return;
    try {
      const restored = JSON.parse(snapshot) as AppConfig;
      const normalized: AppConfig = {
        ...restored,
        themeMode: restored.themeMode ?? (restored.darkMode ? "dark" : "light"),
        themePreset: restored.themePreset ?? "default",
      };
      setConfigDraftLive(normalized);
      applyTheme(normalized.themeMode);
      applyThemePreset(normalized.themePreset);
    } catch {
      /* ignore */
    }
  };

  const exitSettingsIfAllowed = async (): Promise<boolean> => {
    if (!isSettingsModeRef.current) return true;
    const dirty = isSettingsConfigDirty(
      configDraftRef.current,
      savedSettingsSnapshotRef.current
    );
    if (dirty) {
      const ok = await confirmUser(messages.confirm.settingsDiscard);
      if (!ok) return false;
      discardSettingsChanges();
    }
    isSettingsModeRef.current = false;
    setIsSettingsMode(false);
    return true;
  };

  const closeSettings = () => {
    void exitSettingsIfAllowed();
  };

  const toggleTemplateTag = (rawTag: string) => {
    setInput((prev) => {
      const blocked = getTagToggleBlockedMessage(prev, rawTag);
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

  const noteMetaFromPath = (path: string): NoteMeta => {
    const fromNotes = notes.find((n) => n.path === path);
    if (fromNotes) return fromNotes;
    const fromDetail = filteredDetails.find((n) => n.path === path);
    if (fromDetail) {
      return {
        path: fromDetail.path,
        title: fromDetail.title,
        pinned: fromDetail.pinned,
        systemNote: fromDetail.systemNote,
        tags: fromDetail.tags,
        updatedMs: fromDetail.updatedMs,
        createdMs: fromDetail.createdMs,
      };
    }
    const parts = path.split(/[/\\]/);
    return {
      path,
      title: parts[parts.length - 1] || path,
      pinned: false,
      systemNote: isSystemNotePath(path),
      tags: [],
      updatedMs: 0,
      createdMs: 0,
    };
  };

  const openContextMenuForPath = (e: MouseEvent, path: string) => {
    openContextMenu(e, noteMetaFromPath(path));
  };

  const pinOrUnpinNote = async (note: NoteMeta) => {
    if (note.pinned && (note.systemNote || isSystemNotePath(note.path))) {
      setContextMenu(null);
      setStatus(messages.status.builtinNoUnpin);
      return;
    }
    await invoke("toggle_pin_note", { path: note.path, pinned: !note.pinned });
    await Promise.all([loadNotes(), loadNoteDetails()]);
    setContextMenu(null);
    setStatus(note.pinned ? messages.status.unpinned : messages.status.pinned);
  };

  const deleteNote = async (note: NoteMeta) => {
    if (note.systemNote || isSystemNotePath(note.path)) {
      setContextMenu(null);
      setStatus(messages.status.builtinNoDelete);
      return;
    }
    const ok = window.confirm(messages.confirm.deleteNote(note.title));
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
    setStatus(messages.status.deleted);
  };

  const deleteCurrentNote = () => {
    if (!currentPath) return;
    const fromList =
      pinned.find((n) => n.path === currentPath) ?? recent.find((n) => n.path === currentPath);
    const meta: NoteMeta =
      fromList ??
      {
        path: currentPath,
        title: currentFileName,
        pinned: false,
        systemNote: isSystemNotePath(currentPath),
        tags: [],
        updatedMs: 0,
        createdMs: 0,
      };
    void deleteNote(meta);
  };

  const handleOpenInNewWindow = (note: NoteMeta) => {
    setContextMenu(null);
    void openNoteInNewWindow(note.path).catch((err) => {
      console.error(err);
      setStatus(formatAppError(err));
    });
  };

  const handleOpenCurrentInNewWindow = () => {
    if (!currentPath) return;
    void openNoteInNewWindow(currentPath).catch((err) => {
      console.error(err);
      setStatus(formatAppError(err));
    });
  };

  const resolveCurrentPresentationBody = () => getMarkdownBody(input);

  const handlePresentationPreviewScroll = useCallback(
    (ratio: number) => {
      if (!currentPresentation?.active) return;
      if (!isSamePresentationMemo(currentPresentation, currentPath)) return;

      const clamped = Math.max(0, Math.min(1, ratio));
      const prev = lastPresentationScrollRatioRef.current;
      if (prev != null && Math.abs(prev - clamped) < 0.002) return;

      if (presentationScrollTimerRef.current != null) {
        window.clearTimeout(presentationScrollTimerRef.current);
      }
      presentationScrollTimerRef.current = window.setTimeout(() => {
        lastPresentationScrollRatioRef.current = clamped;
        void setPresentationScroll(currentPath, clamped).catch((err) => {
          console.error(err);
        });
      }, 80);
    },
    [currentPresentation, currentPath]
  );

  const openViewerTab = async (statusMessage?: string) => {
    const url =
      viewerUrl ?? currentPresentation?.url ?? activePresentations[0]?.url ?? (await getPresentationViewerUrl());
    if (!url) return;
    await openUrl(url);
    viewerOpenedRef.current = true;
    setViewerUrl(url);
    setStatus(statusMessage ?? messages.presentation.reopened);
  };

  useEffect(() => {
    if (!currentPresentation?.active) return;
    void setPresentationDisplay(currentPath).catch((err) => console.error(err));
  }, [currentPath, currentPresentation?.active, currentPresentation?.boundPath]);

  useEffect(() => {
    lastPresentationScrollRatioRef.current = null;
  }, [currentPath, currentPresentation?.active, currentPresentation?.boundPath]);

  useEffect(() => {
    const status = activePresentationsRef.current.find((p) =>
      isSamePresentationMemo(p, currentPath)
    );
    if (!status?.active || !status.realtime) return;
    if (!isEditMode) return;

    if (presentationPushTimerRef.current != null) {
      window.clearTimeout(presentationPushTimerRef.current);
    }
    presentationPushTimerRef.current = window.setTimeout(() => {
      void pushPresentationUpdate(currentPath, resolveCurrentPresentationBody()).catch((err) => {
        console.error(err);
      });
    }, 400);

    return () => {
      if (presentationPushTimerRef.current != null) {
        window.clearTimeout(presentationPushTimerRef.current);
      }
    };
  }, [
    input,
    isEditMode,
    currentPath,
    currentPresentation?.active,
    currentPresentation?.realtime,
    currentPresentation?.boundPath,
  ]);

  const handleStartPresentation = () => {
    if (
      currentPresentation?.active &&
      isSamePresentationMemo(currentPresentation, currentPath)
    ) {
      void openViewerTab().catch((err) => {
        console.error(err);
        setStatus(formatAppError(err));
      });
      return;
    }

    setPresentationStartRealtime(true);
    setPresentationStartOpen(true);
  };

  const handleConfirmPresentationStart = async () => {
    try {
      const result = await startPresentation({
        boundPath: currentPath,
        fileName: currentFileName,
        body: resolveCurrentPresentationBody(),
        openBrowser: !viewerOpenedRef.current,
        realtime: presentationStartRealtime,
      });
      viewerOpenedRef.current = true;
      setViewerUrl(result.url);
      if (configDraft) {
        await syncPresentationTheme(configDraft.themeMode, configDraft.themePreset);
      }
      await refreshActivePresentations();
      setPresentationStartOpen(false);
      setStatus(messages.presentation.started);
    } catch (err) {
      console.error(err);
      setStatus(formatAppError(err));
    }
  };

  const handlePushPresentationUpdate = async () => {
    if (!currentPresentation?.active) return;
    try {
      await pushPresentationUpdate(currentPath, resolveCurrentPresentationBody());
      setStatus(messages.presentation.updated);
    } catch (err) {
      console.error(err);
      setStatus(formatAppError(err));
    }
  };

  const handleCopyPresentationUrl = async () => {
    const url =
      viewerUrl ?? currentPresentation?.url ?? activePresentations[0]?.url ?? (await getPresentationViewerUrl());
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setStatus(messages.presentation.urlCopied);
    } catch (err) {
      console.error(err);
      setStatus(messages.presentation.copyFailed);
    }
  };

  const handleEndPresentation = async () => {
    try {
      await endPresentation(currentPath);
      const list = await refreshActivePresentations();
      if (list.length === 0) {
        viewerOpenedRef.current = false;
      }
      setStatus(messages.presentation.ended);
    } catch (err) {
      console.error(err);
      setStatus(formatAppError(err));
    }
  };

  const handleTogglePresentationRealtime = async () => {
    if (!currentPresentation?.active) return;
    const next = !currentPresentation.realtime;
    try {
      await setPresentationRealtime(currentPath, next);
      setActivePresentations((prev) =>
        prev.map((p) =>
          isSamePresentationMemo(p, currentPath) ? { ...p, realtime: next } : p
        )
      );
      if (next) {
        await pushPresentationUpdate(currentPath, resolveCurrentPresentationBody());
      }
      setStatus(
        next ? messages.presentation.realtimeEnabled : messages.presentation.realtimeDisabled
      );
    } catch (err) {
      console.error(err);
      setStatus(formatAppError(err));
    }
  };

  const handleShowPresentationInBrowser = async (status: PresentationStatus) => {
    try {
      await setPresentationDisplay(status.boundPath);
      if (!viewerOpenedRef.current) {
        await openViewerTab(messages.presentation.reopened);
      } else {
        setStatus(messages.presentation.displaySwitched(status.fileName));
      }
    } catch (err) {
      console.error(err);
      setStatus(formatAppError(err));
    }
  };

  useEffect(() => {
    if (!activeHit) return;
    if (!isEditMode) return;
    if (!currentPath || activeHit.path !== currentPath) return;

    const textarea = editorRef.current;
    if (!textarea) return;

    if (activeHit.line <= 0) return;

    const targetLine = activeHit.line;
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
              searchMode={searchMode}
              searchError={searchError}
              searchPending={searchPending}
              activeHit={activeHit}
              currentPath={currentPath}
              status={status}
              onCreateNew={createNew}
              onOpenManager={(options) => {
                void (async () => {
                  if (!(await exitSettingsIfAllowed())) return;
                  if (isEditMode) {
                    await flushSave();
                    await releaseEditLock();
                    setIsEditMode(false);
                  }
                  await openManager(
                    options?.withCurrentSearch
                      ? { searchQuery: query, initialHits: searchResults }
                      : undefined
                  );
                })();
              }}
              onOpenSettings={() => void openSettings()}
              onOpenNote={(path, hit) =>
                void openNote(
                  path,
                  hit,
                  query.trim() ? { query, mode: searchMode } : null
                )
              }
              onOpenContextMenu={openContextMenu}
              onOpenContextMenuForPath={openContextMenuForPath}
              onOpenHoverPreview={openHoverPreview}
              onMoveHoverPreview={moveHoverPreview}
              onCloseHoverPreview={closeHoverPreview}
              onCloseSidebar={() => setIsSidebarOpen(false)}
              activePresentations={activePresentations}
              presentedPaths={presentedPaths}
              onOpenPresentedNote={(path) => void openNote(path, undefined, null)}
              onReopenPresentationTab={(status) => void handleShowPresentationInBrowser(status)}
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
            templateTags={templateTags}
            orphanTags={orphanTags}
            notes={notes}
            reservedTagsInUse={reservedTagsInUse}
            isSaving={isSavingConfig}
            hasUnsavedChanges={isSettingsDirty}
            onChangeConfig={(next) => {
              setConfigDraftLive(next);
              applyTheme(next.themeMode);
              applyThemePreset(next.themePreset);
              if (activePresentations.length > 0) {
                void syncPresentationTheme(next.themeMode, next.themePreset).catch((err) =>
                  console.error(err)
                );
              }
            }}
            onSave={() => void saveSettings()}
            onClose={closeSettings}
            onStatus={setStatus}
            onReplaceTagGlobally={(from, to) => replaceTagGlobally(from, to)}
            onAddOrphanToTemplate={addOrphanToTemplate}
            onRemoveTagFromAllMemos={(tag) => removeTagFromAllMemos(tag)}
          />
        ) : isManageMode ? (
          <ManagerPanel
            managerQuery={managerQuery}
            setManagerQuery={setManagerQuery}
            maxChars={maxChars}
            setMaxChars={setMaxChars}
            selectedCount={selectedPaths.size}
            filteredDetails={filteredDetails}
            managerSearchError={managerSearchError}
            managerSearchPending={managerSearchPending}
            selectedPaths={selectedPaths}
            onSelectAllFiltered={selectAllFiltered}
            onClearSelection={clearSelection}
            onClose={closeManager}
            onDeleteSelected={() => void deleteSelected()}
            onToggleSelect={toggleSelect}
            onOpenNote={(path) =>
              void openNote(
                path,
                undefined,
                managerQuery.trim() ? { query: managerQuery, mode: managerSearchMode } : null
              )
            }
            onOpenInNewWindow={handleOpenInNewWindow}
            onPinOrUnpin={(note) => void pinOrUnpinNote(note)}
            onDelete={(note) => void deleteNote(note)}
            onOpenHoverPreview={openHoverPreview}
            onMoveHoverPreview={moveHoverPreview}
            onCloseHoverPreview={closeHoverPreview}
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            {currentPresentation?.active && (
              <PresentationBar
                status={currentPresentation}
                onPushUpdate={() => void handlePushPresentationUpdate()}
                onCopyUrl={() => void handleCopyPresentationUrl()}
                onToggleRealtime={() => void handleTogglePresentationRealtime()}
                onEnd={() => void handleEndPresentation()}
              />
            )}
            {!currentPresentation?.active && activePresentations.length > 0 && (
              <PresentationScopeHint
                activePresentations={activePresentations}
                onOpenPresentedNote={(path) => void openNote(path, undefined, null)}
              />
            )}
            <ReadingEditorPane
              isEditMode={isEditMode}
              isReadOnly={isCurrentSystemNote}
              currentPath={currentPath}
              currentFileName={currentFileName}
              input={input}
              contentScale={contentScale}
              previewWidth={previewWidth}
              templateTags={templateTags}
              onEnterEditMode={enterEditMode}
              onEnterPreviewMode={enterPreviewMode}
              onChangeInput={setInput}
              onToggleTemplateTag={toggleTemplateTag}
              onStartPreviewResize={startPreviewResize}
              onAdjustContentScale={adjustContentScale}
              onResetContentScale={resetContentScale}
              onDeleteCurrentNote={deleteCurrentNote}
              onOpenInNewWindow={currentPath ? handleOpenCurrentInNewWindow : undefined}
              onPresentInBrowser={() => void handleStartPresentation()}
              onPresentationPreviewScroll={
                currentPresentation?.active ? handlePresentationPreviewScroll : undefined
              }
              searchQuery={previewSearch?.query ?? ""}
              searchMode={previewSearch?.mode ?? "body"}
              editorRef={editorRef}
            />
          </div>
        )}
      </div>

      <Overlays
        contextMenu={contextMenu}
        hoverPreview={hoverPreview}
        onPinOrUnpin={(note) => void pinOrUnpinNote(note)}
        onDelete={(note) => void deleteNote(note)}
        onOpenInNewWindow={handleOpenInNewWindow}
      />

      {presentationStartOpen && (
        <PresentationStartDialog
          fileName={currentFileName}
          realtime={presentationStartRealtime}
          onChangeRealtime={setPresentationStartRealtime}
          onConfirm={() => void handleConfirmPresentationStart()}
          onCancel={() => setPresentationStartOpen(false)}
        />
      )}

      {showFirstRunSetup && (
        <FirstRunSetupDialog
          notesDir={firstRunNotesDir}
          busy={isSavingConfig}
          onChangeNotesDir={setFirstRunNotesDir}
          onConfirm={() => void handleCompleteInitialSetup()}
        />
      )}
    </div>
  );
}

export default App;
