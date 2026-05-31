import { useCallback, useRef } from "react";
import { Sidebar } from "@/components/app/Sidebar";
import { CollapsedSidebarRail } from "@/components/app/CollapsedSidebarRail";
import { SidebarProvider } from "@/contexts/SidebarContext";
import { ManagerPanel } from "@/components/app/ManagerPanel";
import { FirstRunSetupDialog } from "@/components/app/FirstRunSetupDialog";
import { SettingsPanel } from "@/components/app/SettingsPanel";
import { ReadingEditorPane } from "@/components/app/ReadingEditorPane";
import { Overlays } from "@/components/app/Overlays";
import { PresentationBar } from "@/components/app/PresentationBar";
import { PresentationScopeHint } from "@/components/app/PresentationScopeHint";
import { PresentationStartDialog } from "@/components/app/PresentationStartDialog";
import { useNotesData } from "@/hooks/useNotesData";
import { useHoverPreview } from "@/hooks/useHoverPreview";
import { useNoteEditorSession } from "@/hooks/useNoteEditorSession";
import { useAppLayout } from "@/hooks/useAppLayout";
import { useAppSettings } from "@/hooks/useAppSettings";
import { usePresentationSession } from "@/hooks/usePresentationSession";
import { useNoteNavigation } from "@/hooks/useNoteNavigation";
import { useNoteContextMenu } from "@/hooks/useNoteContextMenu";
import { useSearchHitScroll } from "@/hooks/useSearchHitScroll";
import { useOpenManager } from "@/hooks/useOpenManager";
import { useSidebarContextValue } from "@/hooks/useSidebarContextValue";
import { isSystemNotePath } from "@/lib/systemNotes";
import "./App.css";

function App() {
  const leaveSettingsModeRef = useRef<() => void>(() => {});
  const syncPresentationThemeRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const activePresentationCountRef = useRef(0);
  const exitSettingsIfAllowedRef = useRef<() => Promise<boolean>>(() => Promise.resolve(true));
  const setInputRef = useRef<(value: string) => void>(() => {});
  const isEditModeRef = useRef(false);
  const flushSaveRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const setIsEditModeRef = useRef<(value: boolean) => void>(() => {});

  const layout = useAppLayout();
  const notesData = useNotesData(true);

  const navigation = useNoteNavigation({
    setStatus: notesData.setStatus,
    setInput: (value) => setInputRef.current(value),
    getIsEditMode: () => isEditModeRef.current,
    flushSave: () => flushSaveRef.current(),
    setIsEditMode: (value) => setIsEditModeRef.current(value),
    setIsManageMode: notesData.setIsManageMode,
    exitSettingsIfAllowed: () => exitSettingsIfAllowedRef.current(),
    loadNotes: notesData.loadNotes,
    loadNoteDetails: notesData.loadNoteDetails,
    notes: notesData.notes,
    pinned: notesData.pinned,
    recent: notesData.recent,
    filteredDetails: notesData.filteredDetails,
    isSidebarOpen: layout.isSidebarOpen,
    setIsSidebarOpen: layout.setIsSidebarOpen,
  });

  const isCurrentSystemNote = isSystemNotePath(navigation.currentPath);

  const editor = useNoteEditorSession({
    notePath: navigation.currentPath,
    isReadOnly: isCurrentSystemNote,
    setStatus: notesData.setStatus,
    onSaved: async (savedPath) => {
      navigation.setCurrentPath(savedPath);
      await notesData.loadNotes();
    },
    getMaxPreviewWidth: layout.getPreviewMaxWidth,
    onEnterEditModeSuccess: () => {
      notesData.setIsManageMode(false);
      leaveSettingsModeRef.current();
      navigation.setActiveHit(null);
    },
    onEnterPreviewMode: () => {
      notesData.setIsManageMode(false);
      leaveSettingsModeRef.current();
    },
  });

  setInputRef.current = editor.setInput;
  isEditModeRef.current = editor.isEditMode;
  flushSaveRef.current = editor.flushSave;
  setIsEditModeRef.current = editor.setIsEditMode;

  const settings = useAppSettings({
    setStatus: notesData.setStatus,
    notes: notesData.notes,
    loadNotes: notesData.loadNotes,
    loadNoteDetails: notesData.loadNoteDetails,
    currentPath: navigation.currentPath,
    setInput: editor.setInput,
    isEditMode: editor.isEditMode,
    flushSave: editor.flushSave,
    setIsEditMode: editor.setIsEditMode,
    setIsManageMode: notesData.setIsManageMode,
    activePresentationCount: () => activePresentationCountRef.current,
    onSyncPresentationTheme: () => syncPresentationThemeRef.current(),
  });

  leaveSettingsModeRef.current = settings.leaveSettingsMode;
  exitSettingsIfAllowedRef.current = settings.exitSettingsIfAllowed;

  const presentation = usePresentationSession({
    currentPath: navigation.currentPath,
    currentFileName: navigation.currentFileName,
    input: editor.input,
    isEditMode: editor.isEditMode,
    configDraft: settings.configDraft,
    setStatus: notesData.setStatus,
  });

  syncPresentationThemeRef.current = presentation.syncTheme;
  activePresentationCountRef.current = presentation.activePresentations.length;

  const contextMenu = useNoteContextMenu({
    notes: notesData.notes,
    filteredDetails: notesData.filteredDetails,
  });

  useSearchHitScroll({
    activeHit: navigation.activeHit,
    currentPath: navigation.currentPath,
    input: editor.input,
    isEditMode: editor.isEditMode,
    editorRef: editor.editorRef,
  });

  const hoverPreview = useHoverPreview();

  const handleOpenManager = useOpenManager({
    exitSettingsIfAllowed: settings.exitSettingsIfAllowed,
    isEditMode: editor.isEditMode,
    flushSave: editor.flushSave,
    setIsEditMode: editor.setIsEditMode,
    openManager: notesData.openManager,
    sidebarQuery: notesData.query,
    sidebarSearchResults: notesData.searchResults,
  });

  const openNoteWithSidebarSearch = useCallback(
    (path: string, hit?: Parameters<typeof navigation.openNote>[1]) => {
      void navigation.openNote(
        path,
        hit,
        notesData.query.trim() ? { query: notesData.query, mode: notesData.searchMode } : null
      );
    },
    [navigation.openNote, notesData.query, notesData.searchMode]
  );

  const openPresentedNote = useCallback(
    (path: string) => {
      void navigation.openNote(path, undefined, null);
    },
    [navigation.openNote]
  );

  const handleOpenSettings = useCallback(() => {
    void settings.openSettings();
  }, [settings.openSettings]);

  const handleCloseSidebar = useCallback(() => {
    layout.setIsSidebarOpen(false);
  }, [layout.setIsSidebarOpen]);

  const handleOpenManagerFromSidebar = useCallback(
    (options?: { withCurrentSearch?: boolean }) => {
      handleOpenManager(options?.withCurrentSearch);
    },
    [handleOpenManager]
  );

  const sidebarContextValue = useSidebarContextValue({
    notesData,
    navigation,
    contextMenu,
    hoverPreview,
    presentation,
    onOpenManager: handleOpenManagerFromSidebar,
    onOpenSettings: handleOpenSettings,
    onOpenNote: openNoteWithSidebarSearch,
    onCloseSidebar: handleCloseSidebar,
    onOpenPresentedNote: openPresentedNote,
  });

  const openNoteFromManager = (path: string) => {
    void navigation.openNote(
      path,
      undefined,
      notesData.managerQuery.trim()
        ? { query: notesData.managerQuery, mode: notesData.managerSearchMode }
        : null
    );
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-gradient-to-br from-background via-background to-muted/30 text-foreground">
      {layout.isSidebarOpen ? (
        <>
          <div
            style={{ width: `${layout.sidebarWidth}px` }}
            className="h-full min-h-0 shrink-0 min-w-0"
          >
            <SidebarProvider {...sidebarContextValue}>
              <Sidebar />
            </SidebarProvider>
          </div>
          <div
            role="separator"
            aria-orientation="vertical"
            className="pane-resizer"
            onMouseDown={(e) => {
              e.preventDefault();
              layout.startSidebarResize(e.clientX);
            }}
          />
        </>
      ) : (
        <CollapsedSidebarRail
          widthPx={layout.collapsedSidebarWidth}
          onOpenSidebar={() => layout.setIsSidebarOpen(true)}
          onCreateNew={navigation.createNew}
        />
      )}

      <div className="flex min-h-0 flex-1 min-w-0 flex-col">
        {settings.isSettingsMode && settings.configDraft ? (
          <SettingsPanel
            config={settings.configDraft}
            templateTags={settings.templateTags}
            orphanTags={settings.orphanTags}
            notes={notesData.notes}
            reservedTagsInUse={settings.reservedTagsInUse}
            isSaving={settings.isSavingConfig}
            hasUnsavedChanges={settings.isSettingsDirty}
            onChangeConfig={settings.handleConfigDraftChange}
            onSave={() => void settings.saveSettings()}
            onClose={settings.closeSettings}
            onStatus={notesData.setStatus}
            onReplaceTagGlobally={(from, to) => settings.replaceTagGlobally(from, to)}
            onAddOrphanToTemplate={settings.addOrphanToTemplate}
            onRemoveTagFromAllMemos={(tag) => settings.removeTagFromAllMemos(tag)}
          />
        ) : notesData.isManageMode ? (
          <ManagerPanel
            managerQuery={notesData.managerQuery}
            setManagerQuery={notesData.setManagerQuery}
            maxChars={notesData.maxChars}
            setMaxChars={notesData.setMaxChars}
            selectedCount={notesData.selectedPaths.size}
            filteredDetails={notesData.filteredDetails}
            managerSearchError={notesData.managerSearchError}
            managerSearchPending={notesData.managerSearchPending}
            selectedPaths={notesData.selectedPaths}
            onSelectAllFiltered={notesData.selectAllFiltered}
            onClearSelection={notesData.clearSelection}
            onClose={notesData.closeManager}
            onDeleteSelected={() => void notesData.deleteSelected()}
            onToggleSelect={notesData.toggleSelect}
            onOpenNote={openNoteFromManager}
            onOpenInNewWindow={(note) =>
              navigation.openNoteInNewWindowFromMeta(note, contextMenu.closeContextMenu)
            }
            onPinOrUnpin={(note) => void navigation.pinOrUnpinNote(note, contextMenu.closeContextMenu)}
            onDelete={(note) => void navigation.deleteNote(note, contextMenu.closeContextMenu)}
            onOpenHoverPreview={hoverPreview.openHoverPreview}
            onMoveHoverPreview={hoverPreview.moveHoverPreview}
            onCloseHoverPreview={hoverPreview.closeHoverPreview}
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            {presentation.currentPresentation?.active && (
              <PresentationBar
                status={presentation.currentPresentation}
                onPushUpdate={() => void presentation.handlePushPresentationUpdate()}
                onCopyUrl={() => void presentation.handleCopyPresentationUrl()}
                onToggleRealtime={() => void presentation.handleTogglePresentationRealtime()}
                onEnd={() => void presentation.handleEndPresentation()}
              />
            )}
            {!presentation.currentPresentation?.active &&
              presentation.activePresentations.length > 0 && (
                <PresentationScopeHint
                  activePresentations={presentation.activePresentations}
                  onOpenPresentedNote={(path) => void navigation.openNote(path, undefined, null)}
                />
              )}
            <ReadingEditorPane
              isEditMode={editor.isEditMode}
              isReadOnly={isCurrentSystemNote}
              currentPath={navigation.currentPath}
              currentFileName={navigation.currentFileName}
              input={editor.input}
              contentScale={editor.contentScale}
              previewWidth={editor.previewWidth}
              templateTags={settings.templateTags}
              onEnterEditMode={editor.enterEditMode}
              onEnterPreviewMode={editor.enterPreviewMode}
              onChangeInput={editor.setInput}
              onToggleTemplateTag={editor.toggleTemplateTag}
              onStartPreviewResize={editor.startPreviewResize}
              onAdjustContentScale={editor.adjustContentScale}
              onResetContentScale={editor.resetContentScale}
              onDeleteCurrentNote={navigation.deleteCurrentNote}
              onOpenInNewWindow={
                navigation.currentPath ? navigation.openCurrentInNewWindow : undefined
              }
              onPresentInBrowser={() => void presentation.handleStartPresentation()}
              onPresentationPreviewScroll={
                presentation.currentPresentation?.active
                  ? presentation.handlePresentationPreviewScroll
                  : undefined
              }
              searchQuery={navigation.previewSearch?.query ?? ""}
              searchMode={navigation.previewSearch?.mode ?? "body"}
              editorRef={editor.editorRef}
            />
          </div>
        )}
      </div>

      <Overlays
        contextMenu={contextMenu.contextMenu}
        hoverPreview={hoverPreview.hoverPreview}
        onPinOrUnpin={(note) => void navigation.pinOrUnpinNote(note, contextMenu.closeContextMenu)}
        onDelete={(note) => void navigation.deleteNote(note, contextMenu.closeContextMenu)}
        onOpenInNewWindow={(note) =>
          navigation.openNoteInNewWindowFromMeta(note, contextMenu.closeContextMenu)
        }
      />

      {presentation.presentationStartOpen && (
        <PresentationStartDialog
          fileName={navigation.currentFileName}
          realtime={presentation.presentationStartRealtime}
          onChangeRealtime={presentation.setPresentationStartRealtime}
          onConfirm={() => void presentation.handleConfirmPresentationStart()}
          onCancel={() => presentation.setPresentationStartOpen(false)}
        />
      )}

      {settings.showFirstRunSetup && (
        <FirstRunSetupDialog
          notesDir={settings.firstRunNotesDir}
          busy={settings.isSavingConfig}
          onChangeNotesDir={settings.setFirstRunNotesDir}
          onConfirm={() => void settings.handleCompleteInitialSetup()}
        />
      )}
    </div>
  );
}

export default App;
