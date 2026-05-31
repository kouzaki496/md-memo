import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { messages } from "@/lib/messages";

export async function resolveNotesDirPath(notesDir: string): Promise<string | null> {
  const trimmed = notesDir.trim();
  if (!trimmed) return null;
  try {
    return await invoke<string>("resolve_notes_dir", { notesDir: trimmed });
  } catch {
    return null;
  }
}

export async function pickNotesDirFolder(currentNotesDir: string): Promise<string | null> {
  const defaultPath = currentNotesDir.trim() || undefined;
  const selected = await open({
    directory: true,
    multiple: false,
    defaultPath,
    title: messages.settings.notesDirBrowseTitle,
  });
  if (typeof selected === "string") return selected;
  return null;
}

export async function openNotesDirInExplorer(notesDir: string): Promise<void> {
  const trimmed = notesDir.trim();
  if (!trimmed) {
    throw new Error("notes_dir_empty");
  }
  await invoke("open_notes_dir", { notesDir: trimmed });
}
