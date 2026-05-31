import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useEffect } from "react";
import { isImagePath } from "@/lib/noteImages";

/** Tauri では OS ドロップが DOM に届かないため Webview API で受ける */
export function useTauriImageDrop(
  enabled: boolean,
  onDropImagePaths: (paths: string[]) => void
) {
  useEffect(() => {
    if (!enabled || !isTauri()) return undefined;

    let unlisten: (() => void) | undefined;
    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type !== "drop") return;
        const imagePaths = event.payload.paths.filter(isImagePath);
        if (imagePaths.length > 0) onDropImagePaths(imagePaths);
      })
      .then((fn) => {
        unlisten = fn;
      });

    return () => {
      unlisten?.();
    };
  }, [enabled, onDropImagePaths]);
}
