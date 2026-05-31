import { isTauri } from "@tauri-apps/api/core";

/** Tauri 外（Vitest 等）では Vite が package.json から注入した値を使う。 */
export async function resolveAppVersion(): Promise<string> {
  if (isTauri()) {
    const { getVersion } = await import("@tauri-apps/api/app");
    return getVersion();
  }
  return import.meta.env.VITE_APP_VERSION;
}
