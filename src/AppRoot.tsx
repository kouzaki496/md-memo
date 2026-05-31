import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import App from "./App";
import { NoteWindowApp } from "./NoteWindowApp";
import { resolveNoteWindowPathSync } from "./lib/noteWindow";
import "./App.css";

function NoteWindowFallback() {
  const close = () => {
    void getCurrentWindow().close();
  };

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center text-sm text-muted-foreground">
      <p>メモを読み込めませんでした。</p>
      <button
        type="button"
        className="rounded-md border border-border bg-muted px-4 py-2 text-foreground hover:bg-muted/80"
        onClick={close}
      >
        ウィンドウを閉じる
      </button>
    </div>
  );
}

export function AppRoot() {
  const notePath = resolveNoteWindowPathSync();

  if (notePath) {
    return <NoteWindowApp notePath={notePath} />;
  }

  if (isTauri() && getCurrentWindow().label.startsWith("note-")) {
    return <NoteWindowFallback />;
  }

  return <App />;
}
