import { type MouseEvent, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { NoteMeta } from "@/types/note";

export type HoverPreviewState = {
  note: NoteMeta;
  x: number;
  y: number;
  content: string;
  loading: boolean;
};

export function useHoverPreview() {
  const [hoverPreview, setHoverPreview] = useState<HoverPreviewState | null>(null);
  const hoverTimerRef = useRef<number | null>(null);

  const openHoverPreview = (e: MouseEvent, note: NoteMeta) => {
    if (hoverTimerRef.current != null) {
      window.clearTimeout(hoverTimerRef.current);
    }
    const x = e.clientX + 14;
    const y = e.clientY + 14;
    setHoverPreview({ note, x, y, content: "", loading: true });
    hoverTimerRef.current = window.setTimeout(() => {
      void invoke<string>("read_note", { path: note.path })
        .then((content) => {
          setHoverPreview((prev) => {
            if (!prev || prev.note.path !== note.path) return prev;
            return { ...prev, content, loading: false };
          });
        })
        .catch(() => {
          setHoverPreview((prev) => {
            if (!prev || prev.note.path !== note.path) return prev;
            return { ...prev, content: "プレビュー取得に失敗しました", loading: false };
          });
        });
    }, 120);
  };

  const moveHoverPreview = (e: MouseEvent) => {
    setHoverPreview((prev) => (prev ? { ...prev, x: e.clientX + 14, y: e.clientY + 14 } : prev));
  };

  const closeHoverPreview = () => {
    if (hoverTimerRef.current != null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHoverPreview(null);
  };

  useEffect(
    () => () => {
      if (hoverTimerRef.current != null) {
        window.clearTimeout(hoverTimerRef.current);
      }
    },
    []
  );

  return {
    hoverPreview,
    openHoverPreview,
    moveHoverPreview,
    closeHoverPreview,
  };
}
