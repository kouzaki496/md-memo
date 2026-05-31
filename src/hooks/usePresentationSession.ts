import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { AppConfig } from "@/types/config";
import type { PresentationStatus } from "@/types/presentation";
import { getMarkdownBody } from "@/lib/noteTags";
import { messages } from "@/lib/messages";
import { reportStatusError, handleInvokeError } from "@/lib/handleInvokeError";
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

type UsePresentationSessionOptions = {
  currentPath: string | null;
  currentFileName: string;
  input: string;
  isEditMode: boolean;
  configDraft: AppConfig | null;
  setStatus: (status: string) => void;
};

export function usePresentationSession(options: UsePresentationSessionOptions) {
  const { currentPath, currentFileName, input, isEditMode, configDraft, setStatus } = options;

  const [activePresentations, setActivePresentations] = useState<PresentationStatus[]>([]);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [presentationStartOpen, setPresentationStartOpen] = useState(false);
  const [presentationStartRealtime, setPresentationStartRealtime] = useState(true);

  const viewerOpenedRef = useRef(false);
  const presentationPushTimerRef = useRef<number | null>(null);
  const presentationScrollTimerRef = useRef<number | null>(null);
  const lastPresentationScrollRatioRef = useRef<number | null>(null);
  const activePresentationsRef = useRef(activePresentations);
  activePresentationsRef.current = activePresentations;

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

  const resolveCurrentPresentationBody = useCallback(() => getMarkdownBody(input), [input]);

  const refreshActivePresentations = useCallback(async () => {
    const list = await listPresentationStatuses();
    setActivePresentations(list);
    if (list[0]?.url) {
      setViewerUrl(list[0].url);
    } else {
      const url = await getPresentationViewerUrl();
      if (url) setViewerUrl(url);
    }
    return list;
  }, []);

  const syncTheme = useCallback(async () => {
    if (!configDraft) return;
    if (activePresentationsRef.current.length === 0) return;
    await syncPresentationTheme(configDraft.themeMode, configDraft.themePreset);
  }, [configDraft]);

  const openViewerTab = useCallback(
    async (statusMessage?: string) => {
      const url =
        viewerUrl ??
        currentPresentation?.url ??
        activePresentations[0]?.url ??
        (await getPresentationViewerUrl());
      if (!url) return;
      await openUrl(url);
      viewerOpenedRef.current = true;
      setViewerUrl(url);
      setStatus(statusMessage ?? messages.presentation.reopened);
    },
    [activePresentations, currentPresentation?.url, setStatus, viewerUrl]
  );

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
          handleInvokeError(err, "setPresentationScroll");
        });
      }, 80);
    },
    [currentPresentation, currentPath]
  );

  const handleStartPresentation = useCallback(() => {
    if (currentPresentation?.active && isSamePresentationMemo(currentPresentation, currentPath)) {
      void openViewerTab().catch((err) => {
        reportStatusError(setStatus, err, "openViewerTab");
      });
      return;
    }
    setPresentationStartRealtime(true);
    setPresentationStartOpen(true);
  }, [currentPath, currentPresentation, openViewerTab, setStatus]);

  const handleConfirmPresentationStart = useCallback(async () => {
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
      reportStatusError(setStatus, err);
    }
  }, [
    configDraft,
    currentFileName,
    currentPath,
    presentationStartRealtime,
    refreshActivePresentations,
    resolveCurrentPresentationBody,
    setStatus,
  ]);

  const handlePushPresentationUpdate = useCallback(async () => {
    if (!currentPresentation?.active) return;
    try {
      await pushPresentationUpdate(currentPath, resolveCurrentPresentationBody());
      setStatus(messages.presentation.updated);
    } catch (err) {
      reportStatusError(setStatus, err);
    }
  }, [currentPresentation?.active, currentPath, resolveCurrentPresentationBody, setStatus]);

  const handleCopyPresentationUrl = useCallback(async () => {
    const url =
      viewerUrl ??
      currentPresentation?.url ??
      activePresentations[0]?.url ??
      (await getPresentationViewerUrl());
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setStatus(messages.presentation.urlCopied);
    } catch (err) {
      handleInvokeError(err, "copyPresentationUrl");
      setStatus(messages.presentation.copyFailed);
    }
  }, [activePresentations, currentPresentation?.url, setStatus, viewerUrl]);

  const handleEndPresentation = useCallback(async () => {
    try {
      await endPresentation(currentPath);
      const list = await refreshActivePresentations();
      if (list.length === 0) {
        viewerOpenedRef.current = false;
      }
      setStatus(messages.presentation.ended);
    } catch (err) {
      reportStatusError(setStatus, err);
    }
  }, [currentPath, refreshActivePresentations, setStatus]);

  const handleTogglePresentationRealtime = useCallback(async () => {
    if (!currentPresentation?.active) return;
    const next = !currentPresentation.realtime;
    try {
      await setPresentationRealtime(currentPath, next);
      setActivePresentations((prev) =>
        prev.map((p) => (isSamePresentationMemo(p, currentPath) ? { ...p, realtime: next } : p))
      );
      if (next) {
        await pushPresentationUpdate(currentPath, resolveCurrentPresentationBody());
      }
      setStatus(next ? messages.presentation.realtimeEnabled : messages.presentation.realtimeDisabled);
    } catch (err) {
      reportStatusError(setStatus, err);
    }
  }, [
    currentPath,
    currentPresentation?.active,
    currentPresentation?.realtime,
    resolveCurrentPresentationBody,
    setStatus,
  ]);

  const handleShowPresentationInBrowser = useCallback(
    async (status: PresentationStatus) => {
      try {
        await setPresentationDisplay(status.boundPath);
        if (!viewerOpenedRef.current) {
          await openViewerTab(messages.presentation.reopened);
        } else {
          setStatus(messages.presentation.displaySwitched(status.fileName));
        }
      } catch (err) {
        reportStatusError(setStatus, err, "showPresentationInBrowser");
      }
    },
    [openViewerTab, setStatus]
  );

  useEffect(() => {
    void refreshActivePresentations().catch((err) =>
      handleInvokeError(err, "refreshActivePresentations")
    );
  }, [refreshActivePresentations]);

  useEffect(() => {
    if (!currentPresentation?.active) return;
    void setPresentationDisplay(currentPath).catch((err) =>
      handleInvokeError(err, "setPresentationDisplay")
    );
  }, [currentPath, currentPresentation?.active, currentPresentation?.boundPath]);

  useEffect(() => {
    lastPresentationScrollRatioRef.current = null;
  }, [currentPath, currentPresentation?.active, currentPresentation?.boundPath]);

  useEffect(() => {
    const status = activePresentationsRef.current.find((p) => isSamePresentationMemo(p, currentPath));
    if (!status?.active || !status.realtime) return;
    if (!isEditMode) return;

    if (presentationPushTimerRef.current != null) {
      window.clearTimeout(presentationPushTimerRef.current);
    }
    presentationPushTimerRef.current = window.setTimeout(() => {
      void pushPresentationUpdate(currentPath, resolveCurrentPresentationBody()).catch((err) => {
        handleInvokeError(err, "pushPresentationUpdate");
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
    resolveCurrentPresentationBody,
  ]);

  useEffect(() => {
    if (!configDraft) return;
    if (activePresentations.length === 0) return;
    void syncPresentationTheme(configDraft.themeMode, configDraft.themePreset).catch((err) =>
      handleInvokeError(err, "syncPresentationTheme")
    );
  }, [configDraft?.themeMode, configDraft?.themePreset, activePresentations.length]);

  return {
    activePresentations,
    presentedPaths,
    currentPresentation,
    viewerUrl,
    presentationStartOpen,
    setPresentationStartOpen,
    presentationStartRealtime,
    setPresentationStartRealtime,
    handlePresentationPreviewScroll,
    handleStartPresentation,
    handleConfirmPresentationStart,
    handlePushPresentationUpdate,
    handleCopyPresentationUrl,
    handleEndPresentation,
    handleTogglePresentationRealtime,
    handleShowPresentationInBrowser,
    syncTheme,
  };
}
