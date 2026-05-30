import type { ThemeMode, ThemePreset } from "@/types/config";

export function resolveIsDark(mode: ThemeMode): boolean {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyTheme(mode: ThemeMode) {
  document.documentElement.classList.toggle("dark", resolveIsDark(mode));
}

export function applyThemePreset(preset: ThemePreset) {
  const root = document.documentElement;
  if (preset === "default") root.removeAttribute("data-theme-preset");
  else root.setAttribute("data-theme-preset", preset);
}
