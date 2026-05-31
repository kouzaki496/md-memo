import { invoke, isTauri } from "@tauri-apps/api/core";

const NOTE_PATH_PARAM = "notePath";

function decodeNotePath(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** URL ハッシュ `#?notePath=...`（別ウィンドウ用・推奨） */
export function getNotePathFromHash(): string | null {
  const raw = window.location.hash.replace(/^#/, "").trim();
  if (!raw) return null;
  const query = raw.startsWith("?") ? raw.slice(1) : raw;
  const path = new URLSearchParams(query).get(NOTE_PATH_PARAM);
  if (!path) return null;
  return decodeNotePath(path);
}

/** 旧形式: 検索クエリ `?notePath=...` */
export function getNotePathFromUrl(): string | null {
  const raw = new URLSearchParams(window.location.search).get(NOTE_PATH_PARAM);
  if (!raw) return null;
  return decodeNotePath(raw);
}

export function resolveNoteWindowPathSync(): string | null {
  return getNotePathFromHash() ?? getNotePathFromUrl();
}

export async function openNoteInNewWindow(path: string): Promise<void> {
  if (!isTauri()) {
    throw new Error("Tauri アプリ内でのみ利用できます");
  }
  await invoke("open_note_window", { path });
}
