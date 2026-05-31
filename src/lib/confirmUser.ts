import { ask } from "@tauri-apps/plugin-dialog";

const APP_TITLE = "Scriptax";

export async function confirmUser(message: string): Promise<boolean> {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    return ask(message, { title: APP_TITLE, kind: "warning" });
  }
  return window.confirm(message);
}
