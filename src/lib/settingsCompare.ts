import type { AppConfig } from "@/types/config";
import { normalizeAppConfig, normalizeThemeMode, normalizeThemePreset } from "@/lib/config";

/** 設定画面で編集する項目だけを比較用に正規化する */
export function getSettingsComparable(config: AppConfig) {
  const normalized = normalizeAppConfig(config);
  return {
    notesDir: normalized.notesDir,
    templateTags: normalized.templateTags,
    themeMode: normalizeThemeMode(normalized),
    themePreset: normalizeThemePreset(normalized.themePreset),
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
