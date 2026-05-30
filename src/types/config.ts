export type ThemeMode = "system" | "light" | "dark";
export type ThemePreset = "default" | "sepia" | "high-contrast";

export type AppConfig = {
  notesDir: string;
  pinnedPaths: string[];
  templateTags: string[];
  themeMode: ThemeMode;
  themePreset: ThemePreset;
  /** 初回セットアップ完了。未設定は従来インストール扱い（完了） */
  setupCompleted?: boolean;
  /** 旧設定の後方互換（読み取り専用） */
  darkMode?: boolean;
};

