export type ThemeMode = "system" | "light" | "dark";
export type ThemePreset = "default" | "sepia" | "high-contrast";

export type AppConfig = {
  notesDir: string;
  pinnedPaths: string[];
  templateTags: string[];
  themeMode: ThemeMode;
  themePreset: ThemePreset;
  /** 旧設定の後方互換（読み取り専用） */
  darkMode?: boolean;
};

