import { describe, expect, it } from "vitest";
import type { AppConfig } from "@/types/config";
import { getSettingsComparable, isSettingsConfigDirty } from "@/lib/settingsCompare";

function baseConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    notesDir: "scriptax-notes",
    pinnedPaths: [],
    templateTags: ["inbox"],
    themeMode: "light",
    themePreset: "default",
    setupCompleted: true,
    ...overrides,
  };
}

describe("getSettingsComparable", () => {
  it("normalizes legacy darkMode to themeMode", () => {
    expect(getSettingsComparable(baseConfig({ darkMode: true, themeMode: undefined }))).toMatchObject({
      themeMode: "dark",
    });
  });

  it("trims notesDir and ensures inbox in template tags", () => {
    expect(getSettingsComparable(baseConfig({ notesDir: "  my-notes  ", templateTags: ["work"] }))).toEqual({
      notesDir: "my-notes",
      templateTags: ["inbox", "work"],
      themeMode: "light",
      themePreset: "default",
    });
  });
});

describe("isSettingsConfigDirty", () => {
  it("returns false when draft matches saved snapshot", () => {
    const draft = baseConfig();
    const snapshot = JSON.stringify(draft);
    expect(isSettingsConfigDirty(draft, snapshot)).toBe(false);
  });

  it("returns true when theme changes", () => {
    const saved = baseConfig();
    const draft = baseConfig({ themeMode: "dark" });
    expect(isSettingsConfigDirty(draft, JSON.stringify(saved))).toBe(true);
  });

  it("returns false when draft or snapshot is missing", () => {
    expect(isSettingsConfigDirty(null, "{}")).toBe(false);
    expect(isSettingsConfigDirty(baseConfig(), null)).toBe(false);
  });
});
