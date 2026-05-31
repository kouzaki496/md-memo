import { type MouseEvent, useCallback, useEffect, useState } from "react";
import type { NoteDetail, NoteMeta } from "@/types/note";
import { noteMetaFromPath } from "@/lib/noteMeta";

export type NoteContextMenuState = {
  note: NoteMeta;
  x: number;
  y: number;
};

type UseNoteContextMenuOptions = {
  notes: NoteMeta[];
  filteredDetails: NoteDetail[];
};

export function useNoteContextMenu(options: UseNoteContextMenuOptions) {
  const { notes, filteredDetails } = options;
  const [contextMenu, setContextMenu] = useState<NoteContextMenuState | null>(null);

  const openContextMenu = useCallback((e: MouseEvent, note: NoteMeta) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ note, x: e.clientX, y: e.clientY });
  }, []);

  const openContextMenuForPath = useCallback(
    (e: MouseEvent, path: string) => {
      openContextMenu(e, noteMetaFromPath(path, notes, filteredDetails));
    },
    [filteredDetails, notes, openContextMenu]
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

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

  return {
    contextMenu,
    openContextMenu,
    openContextMenuForPath,
    closeContextMenu,
  };
}
