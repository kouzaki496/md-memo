import { invoke } from "@tauri-apps/api/core";
import type { PresentationStatus, StartPresentationResult } from "@/types/presentation";

export async function getPresentationStatus(
  boundPath: string | null
): Promise<PresentationStatus | null> {
  return invoke<PresentationStatus | null>("get_presentation_status", { boundPath });
}

export async function startPresentation(args: {
  boundPath: string | null;
  fileName: string;
  body: string;
  openBrowser: boolean;
  realtime: boolean;
}): Promise<StartPresentationResult> {
  return invoke<StartPresentationResult>("start_presentation", {
    boundPath: args.boundPath,
    fileName: args.fileName,
    body: args.body,
    openBrowser: args.openBrowser,
    realtime: args.realtime,
  });
}

export async function pushPresentationUpdate(
  boundPath: string | null,
  body: string
): Promise<void> {
  await invoke("push_presentation_update", { boundPath, body });
}

export async function setPresentationRealtime(
  boundPath: string | null,
  realtime: boolean
): Promise<boolean> {
  return invoke<boolean>("set_presentation_realtime", { boundPath, realtime });
}

export async function endPresentation(boundPath: string | null): Promise<void> {
  await invoke("end_presentation", { boundPath });
}

export function isSamePresentationMemo(
  status: PresentationStatus,
  currentPath: string | null
): boolean {
  return status.boundPath === currentPath;
}
