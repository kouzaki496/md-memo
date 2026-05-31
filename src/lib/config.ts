import type { AppConfig, ThemeMode, ThemePreset } from "@/types/config";
import { ensureLockedInboxInTemplateTags } from "@/lib/noteTags";
import { applyTheme, applyThemePreset } from "@/lib/theme";

export const DEFAULT_NOTES_DIR = "scriptax-notes";

/** 旧 `darkMode` を含めて themeMode を正規化 */
export function normalizeThemeMode(config: Pick<AppConfig, "themeMode" | "darkMode">): ThemeMode {
  return config.themeMode ?? (config.darkMode ? "dark" : "light");
}

export function normalizeThemePreset(preset: ThemePreset | undefined): ThemePreset {
  return preset ?? "default";
}

/** Rust から読み込んだ設定を UI 用に正規化 */
export function normalizeAppConfig(cfg: AppConfig): AppConfig {
  const setupPending = needsInitialSetup(cfg);
  return {
    ...cfg,
    notesDir: cfg.notesDir?.trim() || DEFAULT_NOTES_DIR,
    pinnedPaths: cfg.pinnedPaths ?? [],
    templateTags: ensureLockedInboxInTemplateTags(cfg.templateTags ?? []),
    themeMode: normalizeThemeMode(cfg),
    themePreset: normalizeThemePreset(cfg.themePreset),
    setupCompleted: setupPending ? false : cfg.setupCompleted,
  };
}

export function applyConfigTheme(config: Pick<AppConfig, "themeMode" | "themePreset">): void {
  applyTheme(config.themeMode);
  applyThemePreset(config.themePreset);
}

/** 初回セットアップが未完了か（`setupCompleted: false`、または保存先未設定） */
export function needsInitialSetup(config: AppConfig | null | undefined): boolean {
  if (!config) return false;
  if (config.setupCompleted === false) return true;
  if (config.setupCompleted === true) return false;
  return (config.notesDir ?? "").trim() === "";
}

export function isSetupCompleted(config: AppConfig | null | undefined): boolean {
  return !needsInitialSetup(config);
}
