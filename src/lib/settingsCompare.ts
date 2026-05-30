import type { AppConfig } from "@/types/config";
import { ensureLockedInboxInTemplateTags } from "@/lib/noteTags";

/** 設定画面で編集する項目だけを比較用に正規化する */
export function getSettingsComparable(config: AppConfig) {
  return {
    notesDir: config.notesDir.trim(),
    templateTags: ensureLockedInboxInTemplateTags(config.templateTags ?? []),
    themeMode: config.themeMode ?? (config.darkMode ? "dark" : "light"),
    themePreset: config.themePreset ?? "default",
  };
}

export function isSettingsConfigDirty(
  draft: AppConfig | null | undefined,
  savedSnapshot: string | null | undefined
): boolean {
  if (!draft || savedSnapshot == null) return false;
  try {
    const saved = JSON.parse(savedSnapshot) as AppConfig;
    return (
      JSON.stringify(getSettingsComparable(draft)) !== JSON.stringify(getSettingsComparable(saved))
    );
  } catch {
    return false;
  }
}
