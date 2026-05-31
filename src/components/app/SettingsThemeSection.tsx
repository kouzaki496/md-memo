import type { AppConfig } from "@/types/config";
import { messages } from "@/lib/messages";

type SettingsThemeSectionProps = {
  themeMode: AppConfig["themeMode"];
  themePreset: AppConfig["themePreset"];
  onChangeThemeMode: (themeMode: AppConfig["themeMode"]) => void;
  onChangeThemePreset: (themePreset: AppConfig["themePreset"]) => void;
};

export function SettingsThemeSection(props: SettingsThemeSectionProps) {
  const { themeMode, themePreset, onChangeThemeMode, onChangeThemePreset } = props;

  return (
    <>
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">表示テーマ</h3>
        <div className="space-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="theme-mode"
              checked={themeMode === "system"}
              onChange={() => onChangeThemeMode("system")}
              className="h-4 w-4 border-border accent-primary"
            />
            {messages.settings.themeSystem}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="theme-mode"
              checked={themeMode === "light"}
              onChange={() => onChangeThemeMode("light")}
              className="h-4 w-4 border-border accent-primary"
            />
            ライト
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="theme-mode"
              checked={themeMode === "dark"}
              onChange={() => onChangeThemeMode("dark")}
              className="h-4 w-4 border-border accent-primary"
            />
            ダーク
          </label>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">テーマプリセット</h3>
        <div className="space-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="theme-preset"
              checked={themePreset === "default"}
              onChange={() => onChangeThemePreset("default")}
              className="h-4 w-4 border-border accent-primary"
            />
            デフォルト
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="theme-preset"
              checked={themePreset === "sepia"}
              onChange={() => onChangeThemePreset("sepia")}
              className="h-4 w-4 border-border accent-primary"
            />
            セピア
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="theme-preset"
              checked={themePreset === "high-contrast"}
              onChange={() => onChangeThemePreset("high-contrast")}
              className="h-4 w-4 border-border accent-primary"
            />
            ハイコントラスト
          </label>
        </div>
      </section>
    </>
  );
}
