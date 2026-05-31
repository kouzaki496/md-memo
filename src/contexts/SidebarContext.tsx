import {
  createContext,
  useContext,
  useMemo,
  type MouseEvent,
  type ReactNode,
} from "react";
import type { PresentationStatus } from "@/types/presentation";
import type { NoteMeta, SearchHit, SearchMode } from "@/types/note";

export type SidebarSearchState = {
  query: string;
  setQuery: (value: string) => void;
  results: SearchHit[];
  mode: SearchMode;
  error: boolean;
  pending: boolean;
  activeHit: SearchHit | null;
};

export type SidebarNotesState = {
  pinned: NoteMeta[];
  recent: NoteMeta[];
  currentPath: string | null;
};

export type SidebarPresentationState = {
  activePresentations: PresentationStatus[];
  presentedPaths: Set<string>;
  openPresentedNote: (path: string) => void;
  reopenPresentationTab: (presentation: PresentationStatus) => void;
};

export type SidebarActions = {
  createNew: () => void;
  openManager: (options?: { withCurrentSearch?: boolean }) => void;
  openSettings: () => void;
  openNote: (path: string, hit?: SearchHit) => void;
  closeSidebar: () => void;
};

export type SidebarInteractions = {
  openContextMenu: (event: MouseEvent, note: NoteMeta) => void;
  openContextMenuForPath: (event: MouseEvent, path: string) => void;
  openHoverPreview: (event: MouseEvent, note: NoteMeta) => void;
  moveHoverPreview: (event: MouseEvent) => void;
  closeHoverPreview: () => void;
};

export type SidebarContextValue = {
  search: SidebarSearchState;
  notes: SidebarNotesState;
  presentation: SidebarPresentationState;
  actions: SidebarActions;
  interactions: SidebarInteractions;
  status: string;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

export type SidebarProviderProps = SidebarContextValue & {
  children: ReactNode;
};

export function SidebarProvider(props: SidebarProviderProps) {
  const {
    children,
    search,
    notes,
    presentation,
    actions,
    interactions,
    status,
  } = props;

  const value = useMemo<SidebarContextValue>(
    () => ({ search, notes, presentation, actions, interactions, status }),
    [search, notes, presentation, actions, interactions, status]
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebarContext(): SidebarContextValue {
  const value = useContext(SidebarContext);
  if (!value) {
    throw new Error("useSidebarContext must be used within SidebarProvider");
  }
  return value;
}
