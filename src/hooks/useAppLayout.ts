import { useCallback, useState } from "react";
import { startPaneResize } from "@/lib/paneResize";

const COLLAPSED_SIDEBAR_WIDTH = 72;
const DEFAULT_SIDEBAR_WIDTH = 288;
const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_OFFSET = 520;
const PREVIEW_LEFT_GUTTER = 280;
const PREVIEW_MAX_WIDTH = 900;

export function useAppLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);

  const startSidebarResize = useCallback(
    (startClientX: number) => {
      const maxWidth = Math.min(SIDEBAR_MAX_OFFSET, window.innerWidth - SIDEBAR_MAX_OFFSET);
      startPaneResize({
        startClientX,
        startWidth: sidebarWidth,
        minWidth: SIDEBAR_MIN_WIDTH,
        maxWidth,
        onResize: setSidebarWidth,
        direction: "grow-right",
      });
    },
    [sidebarWidth]
  );

  const getPreviewMaxWidth = useCallback(() => {
    const leftArea = (isSidebarOpen ? sidebarWidth : COLLAPSED_SIDEBAR_WIDTH) + PREVIEW_LEFT_GUTTER;
    return Math.min(PREVIEW_MAX_WIDTH, window.innerWidth - leftArea);
  }, [isSidebarOpen, sidebarWidth]);

  return {
    collapsedSidebarWidth: COLLAPSED_SIDEBAR_WIDTH,
    isSidebarOpen,
    setIsSidebarOpen,
    sidebarWidth,
    startSidebarResize,
    getPreviewMaxWidth,
  };
}
