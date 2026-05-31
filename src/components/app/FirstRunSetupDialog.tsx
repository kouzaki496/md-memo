import { useEffect, useState } from "react";
import { FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEFAULT_NOTES_DIR } from "@/lib/config";
import { messages } from "@/lib/messages";
import { pickNotesDirFolder, resolveNotesDirPath } from "@/lib/notesDir";

type FirstRunSetupDialogProps = {
  notesDir: string;
  busy: boolean;
  onChangeNotesDir: (value: string) => void;
  onConfirm: () => void;
};

export function FirstRunSetupDialog(props: FirstRunSetupDialogProps) {
  const { notesDir, busy, onChangeNotesDir, onConfirm } = props;
  const [pickBusy, setPickBusy] = useState(false);
  const [resolvedNotesDir, setResolvedNotesDir] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void resolveNotesDirPath(notesDir).then((path) => {
      if (!cancelled) setResolvedNotesDir(path);
    });
    return () => {
      cancelled = true;
    };
  }, [notesDir]);

  const handlePickFolder = () => {
    setPickBusy(true);
    void pickNotesDirFolder(notesDir)
      .then((selected) => {
        if (selected) onChangeNotesDir(selected);
      })
      .catch((err) => console.error(err))
      .finally(() => setPickBusy(false));
  };

  const handleUseDefault = () => {
    onChangeNotesDir(DEFAULT_NOTES_DIR);
  };

  const canConfirm = notesDir.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="first-run-setup-title"
    >
      <div className="w-full max-w-lg rounded-lg border bg-background p-5 shadow-lg">
        <h2 id="first-run-setup-title" className="text-base font-semibold">
          {messages.firstRun.title}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{messages.firstRun.body}</p>

        <div className="mt-4 space-y-2">
          <label className="text-sm font-medium" htmlFor="first-run-notes-dir">
            {messages.firstRun.notesDirLabel}
          </label>
          <div className="flex flex-wrap gap-2">
            <Input
              id="first-run-notes-dir"
              className="min-w-[12rem] flex-1"
              value={notesDir}
              onChange={(e) => onChangeNotesDir(e.target.value)}
              placeholder={messages.settings.notesDirPlaceholder}
              disabled={busy || pickBusy}
            />
            <Button
              type="button"
              variant="outline"
              className="shrink-0"
              disabled={busy || pickBusy}
              onClick={handlePickFolder}
            >
              <FolderOpen className="h-4 w-4" />
              {messages.settings.notesDirBrowse}
            </Button>
          </div>
          {resolvedNotesDir && (
            <p className="text-xs text-muted-foreground break-all">
              {messages.settings.notesDirResolved(resolvedNotesDir)}
            </p>
          )}
          <p className="text-xs text-muted-foreground">{messages.firstRun.notesDirHint}</p>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy || pickBusy || notesDir === DEFAULT_NOTES_DIR}
            onClick={handleUseDefault}
          >
            {messages.firstRun.useDefault(DEFAULT_NOTES_DIR)}
          </Button>
          <Button type="button" disabled={busy || pickBusy || !canConfirm} onClick={onConfirm}>
            {busy ? messages.firstRun.confirming : messages.firstRun.confirm}
          </Button>
        </div>
      </div>
    </div>
  );
}
