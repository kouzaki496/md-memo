import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sharedDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../shared");

describe("shared theme CSS assets", () => {
  it("theme-presets.css defines sepia and high-contrast overrides", () => {
    const css = readFileSync(path.join(sharedDir, "theme-presets.css"), "utf8");
    expect(css).toContain('html[data-theme-preset="sepia"]');
    expect(css).toContain('html.dark[data-theme-preset="high-contrast"]');
    expect(css).toContain("--background: oklch(0.97 0.02 85)");
  });

  it("theme-viewer-base.css defines default light and dark tokens", () => {
    const css = readFileSync(path.join(sharedDir, "theme-viewer-base.css"), "utf8");
    expect(css).toContain("color-scheme: light");
    expect(css).toContain("html.dark");
    expect(css).toContain("--background: oklch(0.988 0.006 250)");
  });
});
