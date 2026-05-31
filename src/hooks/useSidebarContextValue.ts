import { useMemo } from "react";
import type { SidebarContextValue } from "@/contexts/SidebarContext";
import type { useNoteContextMenu } from "@/hooks/useNoteContextMenu";
import type { useNoteNavigation } from "@/hooks/useNoteNavigation";
import type { useNotesData } from "@/hooks/useNotesData";
import type { useHoverPreview } from "@/hooks/useHoverPreview";
import type { usePresentationSession } from "@/hooks/usePresentationSession";

type NotesData = Pick<
  ReturnType<typeof useNotesData>,
  | "query"
  | "setQuery"
  | "searchResults"
  | "searchMode"
  | "searchError"
  | "searchPending"
  | "status"
  | "pinned"
  | "recent"
>;

type Navigation = Pick<
  ReturnType<typeof useNoteNavigation>,
  "activeHit" | "currentPath" | "createNew"
>;

type ContextMenu = Pick<
  ReturnType<typeof useNoteContextMenu>,
  "openContextMenu" | "openContextMenuForPath"
>;

type HoverPreview = Pick<
  ReturnType<typeof useHoverPreview>,
  "openHoverPreview" | "moveHoverPreview" | "closeHoverPreview"
>;

type Presentation = Pick<
  ReturnType<typeof usePresentationSession>,
  "activePresentations" | "presentedPaths" | "handleShowPresentationInBrowser"
>;

type UseSidebarContextValueParams = {
  notesData: NotesData;
  navigation: Navigation;
  contextMenu: ContextMenu;
  hoverPreview: HoverPreview;
  presentation: Presentation;
  onOpenManager: SidebarContextValue["actions"]["openManager"];
  onOpenSettings: () => void;
  onOpenNote: SidebarContextValue["actions"]["openNote"];
  onCloseSidebar: () => void;
  onOpenPresentedNote: (path: string) => void;
};

/** App から SidebarProvider へ渡す値を memo 化して組み立てる */
export function useSidebarContextValue(params: UseSidebarContextValueParams): SidebarContextValue {
  const {
    notesData,
    navigation,
    contextMenu,
    hoverPreview,
    presentation,
    onOpenManager,
    onOpenSettings,
    onOpenNote,
    onCloseSidebar,
    onOpenPresentedNote,
  } = params;

  const search = useMemo(
    () => ({
      query: notesData.query,
      setQuery: notesData.setQuery,
      results: notesData.searchResults,
      mode: notesData.searchMode,
      error: notesData.searchError,
      pending: notesData.searchPending,
      activeHit: navigation.activeHit,
    }),
    [
      notesData.query,
      notesData.setQuery,
      notesData.searchResults,
      notesData.searchMode,
      notesData.searchError,
      notesData.searchPending,
      navigation.activeHit,
    ]
  );

  const notes = useMemo(
    () => ({
      pinned: notesData.pinned,
      recent: notesData.recent,
      currentPath: navigation.currentPath,
    }),
    [notesData.pinned, notesData.recent, navigation.currentPath]
  );

  const presentationState = useMemo(
    () => ({
      activePresentations: presentation.activePresentations,
      presentedPaths: presentation.presentedPaths,
      openPresentedNote: onOpenPresentedNote,
      reopenPresentationTab: presentation.handleShowPresentationInBrowser,
    }),
    [
      presentation.activePresentations,
      presentation.presentedPaths,
      presentation.handleShowPresentationInBrowser,
      onOpenPresentedNote,
    ]
  );

  const actions = useMemo(
    () => ({
      createNew: navigation.createNew,
      openManager: onOpenManager,
      openSettings: onOpenSettings,
      openNote: onOpenNote,
      closeSidebar: onCloseSidebar,
    }),
    [navigation.createNew, onOpenManager, onOpenSettings, onOpenNote, onCloseSidebar]
  );

  const interactions = useMemo(
    () => ({
      openContextMenu: contextMenu.openContextMenu,
      openContextMenuForPath: contextMenu.openContextMenuForPath,
      openHoverPreview: hoverPreview.openHoverPreview,
      moveHoverPreview: hoverPreview.moveHoverPreview,
      closeHoverPreview: hoverPreview.closeHoverPreview,
    }),
    [
      contextMenu.openContextMenu,
      contextMenu.openContextMenuForPath,
      hoverPreview.openHoverPreview,
      hoverPreview.moveHoverPreview,
      hoverPreview.closeHoverPreview,
    ]
  );

  return useMemo(
    () => ({
      search,
      notes,
      presentation: presentationState,
      actions,
      interactions,
      status: notesData.status,
    }),
    [search, notes, presentationState, actions, interactions, notesData.status]
  );
}
