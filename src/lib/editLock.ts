import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

export const EDIT_LOCK_CHANGED = "edit-lock-changed";

export type EditLockState = {
  holderLabel: string;
  notePath: string | null;
};

export async function acquireEditLock(notePath: string | null): Promise<void> {
  await invoke("acquire_edit_lock", {
    windowLabel: getCurrentWindow().label,
    notePath,
  });
}

export async function releaseEditLock(): Promise<void> {
  await invoke("release_edit_lock", {
    windowLabel: getCurrentWindow().label,
  });
}

export async function listenEditLockChanged(
  handler: (state: EditLockState) => void | Promise<void>
): Promise<UnlistenFn> {
  return listen<EditLockState>(EDIT_LOCK_CHANGED, (event) => {
    void handler(event.payload);
  });
}
