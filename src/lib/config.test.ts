import { describe, expect, it } from "vitest";
import {
  DEFAULT_NOTES_DIR,
  normalizeAppConfig,
  normalizeThemeMode,
  normalizeThemePreset,
} from "@/lib/config";
import type { AppConfig } from "@/types/config";

function baseConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    notesDir: "my-notes",
    pinnedPaths: [],
    templateTags: ["work"],
    themeMode: "light",
    themePreset: "default",
    setupCompleted: true,
    ...overrides,
  };
}

describe("normalizeThemeMode", () => {
  it("prefers themeMode over legacy darkMode", () => {
    expect(normalizeThemeMode({ themeMode: "system", darkMode: true })).toBe("system");
  });

  it("maps legacy darkMode when themeMode is missing", () => {
    expect(normalizeThemeMode({ themeMode: undefined as unknown as "light", darkMode: true })).toBe(
      "dark"
    );
  });
});

describe("normalizeThemePreset", () => {
  it("defaults to default", () => {
    expect(normalizeThemePreset(undefined)).toBe("default");
  });
});

describe("normalizeAppConfig", () => {
  it("trims notesDir and ensures inbox in template tags", () => {
    const normalized = normalizeAppConfig(baseConfig({ notesDir: "  notes  ", templateTags: ["draft"] }));
    expect(normalized.notesDir).toBe("notes");
    expect(normalized.templateTags).toEqual(["inbox", "draft"]);
  });

  it("uses default notes dir when empty", () => {
    expect(normalizeAppConfig(baseConfig({ notesDir: "   " })).notesDir).toBe(DEFAULT_NOTES_DIR);
  });

  it("forces setupCompleted false when initial setup is pending", () => {
    const normalized = normalizeAppConfig(
      baseConfig({ notesDir: "", setupCompleted: undefined })
    );
    expect(normalized.setupCompleted).toBe(false);
  });

  it("keeps setupCompleted when notes dir is configured", () => {
    expect(normalizeAppConfig(baseConfig({ setupCompleted: true })).setupCompleted).toBe(true);
  });
});
