import type { AppConfig } from "@/types/config";

export const DEFAULT_NOTES_DIR = "scriptax-notes";

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
