import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AppConfig } from "@/types/config";
import type { NoteMeta, ReplaceTagGloballyResult } from "@/types/note";
import {
  collectTagsFromNotes,
  dedupeTagsCaseInsensitive,
  ensureLockedInboxInTemplateTags,
  getOrphanTags,
  replaceTagTokenInList,
} from "@/lib/noteTags";
import { isBuiltinReservedTagName } from "@/lib/reservedTags";
import {
  DEFAULT_NOTES_DIR,
  applyConfigTheme,
  isSetupCompleted,
  needsInitialSetup,
  normalizeAppConfig,
} from "@/lib/config";
import { normalizeNotePath } from "@/lib/notePath";
import { isSettingsConfigDirty } from "@/lib/settingsCompare";
import { applyTheme } from "@/lib/theme";
import { reportStatusError, handleInvokeError } from "@/lib/handleInvokeError";
import { confirmUser } from "@/lib/confirmUser";
import { messages } from "@/lib/messages";
import { releaseEditLock } from "@/lib/editLock";

type UseAppSettingsOptions = {
  setStatus: (status: string) => void;
  notes: NoteMeta[];
  loadNotes: () => Promise<void>;
  loadNoteDetails: () => Promise<void>;
  currentPath: string | null;
  setInput: (value: string) => void;
  isEditMode: boolean;
  flushSave: () => Promise<void>;
  setIsEditMode: (value: boolean) => void;
  setIsManageMode: (value: boolean) => void;
  activePresentationCount: number | (() => number);
  onSyncPresentationTheme: () => Promise<void>;
};

export function useAppSettings(options: UseAppSettingsOptions) {
  const {
    setStatus,
    notes,
    loadNotes,
    loadNoteDetails,
    currentPath,
    setInput,
    isEditMode,
    flushSave,
    setIsEditMode,
    setIsManageMode,
    activePresentationCount: activePresentationCountInput,
    onSyncPresentationTheme,
  } = options;

  const getActivePresentationCount =
    typeof activePresentationCountInput === "function"
      ? activePresentationCountInput
      : () => activePresentationCountInput;

  const [isSettingsMode, setIsSettingsMode] = useState(false);
  const [configDraft, setConfigDraft] = useState<AppConfig | null>(null);
  const [savedSettingsSnapshot, setSavedSettingsSnapshot] = useState<string | null>(null);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [firstRunNotesDir, setFirstRunNotesDir] = useState(DEFAULT_NOTES_DIR);

  const configDraftRef = useRef<AppConfig | null>(null);
  const savedSettingsSnapshotRef = useRef<string | null>(null);
  const isSettingsModeRef = useRef(false);

  configDraftRef.current = configDraft;
  savedSettingsSnapshotRef.current = savedSettingsSnapshot;
  isSettingsModeRef.current = isSettingsMode;

  const setConfigDraftLive = useCallback((next: AppConfig) => {
    configDraftRef.current = next;
    setConfigDraft(next);
  }, []);

  const setSavedSettingsSnapshotLive = useCallback((snapshot: string) => {
    savedSettingsSnapshotRef.current = snapshot;
    setSavedSettingsSnapshot(snapshot);
  }, []);

  const notesInitEnabled = isSetupCompleted(configDraft);
  const showFirstRunSetup = configDraft != null && needsInitialSetup(configDraft);

  const isSettingsDirty = useMemo(
    () => isSettingsConfigDirty(configDraft, savedSettingsSnapshot),
    [configDraft, savedSettingsSnapshot]
  );

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

  const loadConfig = useCallback(async () => {
    const cfg = await invoke<AppConfig>("get_config");
    const merged = normalizeAppConfig(cfg);
    applyConfigTheme(merged);
    setConfigDraftLive(merged);
    setSavedSettingsSnapshotLive(JSON.stringify(merged));
    return merged;
  }, [setConfigDraftLive, setSavedSettingsSnapshotLive]);

  const discardSettingsChanges = useCallback(() => {
    const snapshot = savedSettingsSnapshotRef.current;
    if (!snapshot) return;
    try {
      const restored = normalizeAppConfig(JSON.parse(snapshot) as AppConfig);
      setConfigDraftLive(restored);
      applyConfigTheme(restored);
    } catch {
      /* ignore */
    }
  }, [setConfigDraftLive]);

  const exitSettingsIfAllowed = useCallback(async (): Promise<boolean> => {
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
  }, [discardSettingsChanges]);

  const openSettings = useCallback(async () => {
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
      handleInvokeError(err, "loadConfig");
      setStatus(messages.status.settingsLoadFailed);
    }
  }, [flushSave, isEditMode, loadConfig, setIsEditMode, setIsManageMode, setStatus]);

  const closeSettings = useCallback(() => {
    void exitSettingsIfAllowed();
  }, [exitSettingsIfAllowed]);

  const leaveSettingsMode = useCallback(() => {
    isSettingsModeRef.current = false;
    setIsSettingsMode(false);
  }, []);

  const handleCompleteInitialSetup = useCallback(async () => {
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
      applyConfigTheme(payload);
      setConfigDraftLive(payload);
      setSavedSettingsSnapshotLive(JSON.stringify(payload));
      setStatus(messages.firstRun.completed);
    } catch (err) {
      reportStatusError(setStatus, err, "completeInitialSetup");
    } finally {
      setIsSavingConfig(false);
    }
  }, [configDraft, firstRunNotesDir, setConfigDraftLive, setSavedSettingsSnapshotLive, setStatus]);

  const saveSettings = useCallback(async () => {
    if (!configDraft) return;
    setIsSavingConfig(true);
    try {
      const payload = {
        ...configDraft,
        templateTags: ensureLockedInboxInTemplateTags(configDraft.templateTags),
      };
      await invoke("save_config", { config: payload });
      applyConfigTheme(payload);
      setConfigDraftLive(payload);
      setSavedSettingsSnapshotLive(JSON.stringify(payload));
      await Promise.all([loadNotes(), loadNoteDetails()]);
      setStatus(messages.status.settingsSaved);
    } catch (err) {
      reportStatusError(setStatus, err, "saveSettings");
    } finally {
      setIsSavingConfig(false);
    }
  }, [
    configDraft,
    loadNoteDetails,
    loadNotes,
    setConfigDraftLive,
    setSavedSettingsSnapshotLive,
    setStatus,
  ]);

  const handleConfigDraftChange = useCallback(
    (next: AppConfig) => {
      setConfigDraftLive(next);
      applyConfigTheme(next);
      if (getActivePresentationCount() > 0) {
        void onSyncPresentationTheme().catch((err) =>
          handleInvokeError(err, "syncPresentationTheme")
        );
      }
    },
    [getActivePresentationCount, onSyncPresentationTheme, setConfigDraftLive]
  );

  const replaceTagGlobally = useCallback(
    async (from: string, to: string) => {
      const res = await invoke<ReplaceTagGloballyResult>("replace_tag_globally", {
        fromTag: from,
        toTag: to,
      });
      await Promise.all([loadNotes(), loadNoteDetails()]);
      const changed = new Set(res.changedPaths.map(normalizeNotePath));
      if (currentPath && changed.has(normalizeNotePath(currentPath))) {
        const content = await invoke<string>("read_note", { path: currentPath });
        setInput(content);
      }
      if (!isSettingsConfigDirty(configDraftRef.current, savedSettingsSnapshotRef.current)) {
        await loadConfig();
      } else if (configDraftRef.current) {
        setConfigDraftLive({
          ...configDraftRef.current,
          templateTags: ensureLockedInboxInTemplateTags(
            dedupeTagsCaseInsensitive(replaceTagTokenInList(configDraftRef.current.templateTags, from, to))
          ),
        });
      }
      setStatus(messages.status.tagReplaced(res.filesChanged));
    },
    [currentPath, loadConfig, loadNoteDetails, loadNotes, setConfigDraftLive, setInput, setStatus]
  );

  const addOrphanToTemplate = useCallback(
    (tag: string) => {
      if (!configDraft) return;
      if (configDraft.templateTags.some((t) => t.toLowerCase() === tag.toLowerCase())) return;
      setConfigDraftLive({
        ...configDraft,
        templateTags: ensureLockedInboxInTemplateTags([...configDraft.templateTags, tag]),
      });
    },
    [configDraft, setConfigDraftLive]
  );

  const removeTagFromAllMemos = useCallback(
    async (tag: string) => {
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
      if (
        currentPath &&
        res.changedPaths.some((p) => normalizeNotePath(p) === normalizeNotePath(currentPath))
      ) {
        const content = await invoke<string>("read_note", { path: currentPath });
        setInput(content);
      }
      setStatus(messages.status.tagRemoved(tag, res.filesChanged));
    },
    [
      configDraft,
      currentPath,
      isSettingsDirty,
      loadNoteDetails,
      loadNotes,
      setConfigDraftLive,
      setInput,
      setSavedSettingsSnapshotLive,
      setStatus,
    ]
  );

  useEffect(() => {
    void loadConfig().catch((err) => {
      handleInvokeError(err, "loadConfigOnMount");
      applyConfigTheme({ themeMode: "light", themePreset: "default" });
    });
  }, [loadConfig]);

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
      void onSyncPresentationTheme().catch((err) =>
        handleInvokeError(err, "syncPresentationThemeOnSystemChange")
      );
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [configDraft?.themeMode, getActivePresentationCount, onSyncPresentationTheme]);

  return {
    configDraft,
    isSettingsMode,
    isSavingConfig,
    firstRunNotesDir,
    setFirstRunNotesDir,
    notesInitEnabled,
    showFirstRunSetup,
    isSettingsDirty,
    templateTags,
    orphanTags,
    reservedTagsInUse,
    loadConfig,
    openSettings,
    closeSettings,
    exitSettingsIfAllowed,
    leaveSettingsMode,
    saveSettings,
    handleCompleteInitialSetup,
    handleConfigDraftChange,
    replaceTagGlobally,
    addOrphanToTemplate,
    removeTagFromAllMemos,
  };
}
