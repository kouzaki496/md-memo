import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import { useEffect } from "react";
import { messages } from "@/lib/messages";

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "svg"];
const IMAGE_PATH_RE = /\.(png|jpe?g|gif|webp|svg)$/i;

type AttachmentPayload = {
  mimeType: string;
  bytes: number[];
};

export function buildImageMarkdown(relativePath: string, alt = "image"): string {
  return `![${alt}](${relativePath})`;
}

export function isImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  return IMAGE_PATH_RE.test(file.name);
}

export function isImagePath(path: string): boolean {
  return IMAGE_PATH_RE.test(path);
}

export async function resolveAttachmentDisplayUrl(src: string): Promise<string | null> {
  const trimmed = src.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("data:")) {
    return trimmed;
  }
  try {
    const payload = await invoke<AttachmentPayload>("read_note_attachment", { src: trimmed });
    const blob = new Blob([Uint8Array.from(payload.bytes)], { type: payload.mimeType });
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

export async function saveImageBytes(bytes: number[], extension?: string): Promise<string> {
  return invoke<string>("save_note_attachment", { bytes, extension: extension ?? null });
}

export async function saveImageFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = Array.from(new Uint8Array(buffer));
  const ext = file.type.split("/")[1] || file.name.split(".").pop() || "png";
  return saveImageBytes(bytes, ext);
}

export async function importImagePath(sourcePath: string): Promise<string> {
  return invoke<string>("import_note_attachment", { sourcePath });
}

export async function importImageFromDialog(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    filters: [{ name: messages.editor.imageFilterName, extensions: IMAGE_EXTENSIONS }],
    title: messages.editor.insertImage,
  });
  if (typeof selected !== "string") return null;
  return importImagePath(selected);
}

export function insertTextAtSelection(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  insertion: string
): { nextText: string; nextCursor: number } {
  const needsLeadingNewline =
    selectionStart > 0 && text[selectionStart - 1] !== "\n" && !insertion.startsWith("\n");
  const needsTrailingNewline =
    selectionEnd < text.length && text[selectionEnd] !== "\n" && !insertion.endsWith("\n");
  const block = `${needsLeadingNewline ? "\n" : ""}${insertion}${needsTrailingNewline ? "\n" : ""}`;
  const nextText = `${text.slice(0, selectionStart)}${block}${text.slice(selectionEnd)}`;
  const nextCursor = selectionStart + block.length;
  return { nextText, nextCursor };
}

function fileFromDataUrl(dataUrl: string, name = "clipboard.png"): File | null {
  try {
    const [header, encoded] = dataUrl.split(",");
    if (!encoded) return null;
    const mime = header.match(/data:(image\/[^;]+)/i)?.[1] ?? "image/png";
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    const ext = mime.split("/")[1] || "png";
    return new File([bytes], name.replace(/\.\w+$/, `.${ext}`), { type: mime });
  } catch {
    return null;
  }
}

function fileFromHtmlClipboard(html: string): File | null {
  const match = html.match(/src=["'](data:image\/[^"']+)["']/i);
  if (!match) return null;
  return fileFromDataUrl(match[1]);
}

function readSyncClipboardImageFile(clipboardData: DataTransfer): File | null {
  if (clipboardData.files?.length) {
    for (let i = 0; i < clipboardData.files.length; i += 1) {
      const file = clipboardData.files[i];
      if (isImageFile(file)) return file;
    }
  }

  for (let i = 0; i < clipboardData.items.length; i += 1) {
    const item = clipboardData.items[i];
    if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
    const file = item.getAsFile();
    if (file && file.size > 0) return file;
  }

  const html = clipboardData.getData("text/html");
  if (html) {
    const fromHtml = fileFromHtmlClipboard(html);
    if (fromHtml) return fromHtml;
  }

  return null;
}

async function readAsyncClipboardImageFile(): Promise<File | null> {
  if (!navigator.clipboard?.read) return null;
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      for (const type of item.types) {
        if (!type.startsWith("image/")) continue;
        const blob = await item.getType(type);
        if (blob.size === 0) continue;
        const ext = type.split("/")[1] || "png";
        return new File([blob], `clipboard.${ext}`, { type });
      }
    }
  } catch {
    /* WebView2 may reject outside secure gesture */
  }
  return null;
}

export function clipboardMayContainImage(clipboardData: DataTransfer | null): boolean {
  if (!clipboardData) return false;
  if (clipboardData.files?.length) {
    for (let i = 0; i < clipboardData.files.length; i += 1) {
      if (isImageFile(clipboardData.files[i])) return true;
    }
  }
  for (let i = 0; i < clipboardData.items.length; i += 1) {
    if (clipboardData.items[i].type.startsWith("image/")) return true;
  }
  const html = clipboardData.getData("text/html");
  return Boolean(html && /data:image\//i.test(html));
}

export async function readClipboardImageFile(
  clipboardData: DataTransfer | null
): Promise<File | null> {
  if (clipboardData) {
    const syncFile = readSyncClipboardImageFile(clipboardData);
    if (syncFile) return syncFile;
  }
  return readAsyncClipboardImageFile();
}

/** Tauri では OS ドロップが DOM に届かないため Webview API で受ける */
export function useTauriImageDrop(
  enabled: boolean,
  onDropImagePaths: (paths: string[]) => void
) {
  useEffect(() => {
    if (!enabled || !isTauri()) return undefined;

    let unlisten: (() => void) | undefined;
    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type !== "drop") return;
        const imagePaths = event.payload.paths.filter(isImagePath);
        if (imagePaths.length > 0) onDropImagePaths(imagePaths);
      })
      .then((fn) => {
        unlisten = fn;
      });

    return () => {
      unlisten?.();
    };
  }, [enabled, onDropImagePaths]);
}
