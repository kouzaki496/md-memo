export type ShortcutEventLike = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
};

export type KeyShortcut = {
  key: string;
  requireMod: boolean;
  shift?: boolean;
  alt?: boolean;
};

export const editorShortcutConfig = {
  zoomIn: { key: "+", requireMod: true } as KeyShortcut,
  zoomInAlt: { key: "=", requireMod: true } as KeyShortcut,
  zoomOut: { key: "-", requireMod: true } as KeyShortcut,
  zoomOutAlt: { key: "_", requireMod: true } as KeyShortcut,
  zoomReset: { key: "0", requireMod: true } as KeyShortcut,
  boldToggle: { key: "b", requireMod: true, shift: false, alt: false } as KeyShortcut,
  headingShortcutKeys: ["1", "2", "3", "4", "5", "6"] as const,
  listCycle: { key: "l", requireMod: true, shift: false, alt: false } as KeyShortcut,
  clearMarkdown: { key: "k", requireMod: true, shift: true, alt: false } as KeyShortcut,
  selectNextOccurrence: { key: "d", requireMod: false, shift: false, alt: true } as KeyShortcut,
  listIndentKey: "Tab",
  outdentWithAltTab: true,
  outdentWithShiftTab: true,
  listCycleOrder: ["plain", "unordered", "ordered", "task"] as const,
};

export function matchesShortcut(event: ShortcutEventLike, shortcut: KeyShortcut): boolean {
  if (shortcut.requireMod && !(event.ctrlKey || event.metaKey)) return false;
  if (shortcut.shift !== undefined && event.shiftKey !== shortcut.shift) return false;
  if (shortcut.alt !== undefined && event.altKey !== shortcut.alt) return false;
  return event.key.toLowerCase() === shortcut.key.toLowerCase();
}
