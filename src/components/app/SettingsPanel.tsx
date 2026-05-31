import { useEffect, useState } from "react";
import { ExternalLink, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SettingsTagsSection } from "@/components/app/SettingsTagsSection";
import { SettingsThemeSection } from "@/components/app/SettingsThemeSection";
import type { AppConfig } from "@/types/config";
import type { NoteMeta } from "@/types/note";
import { handleInvokeError } from "@/lib/handleInvokeError";
import { messages } from "@/lib/messages";
import { openNotesDirInExplorer, pickNotesDirFolder, resolveNotesDirPath } from "@/lib/notesDir";

type SettingsPanelProps = {
  config: AppConfig;
  templateTags: string[];
  orphanTags: string[];
  notes: NoteMeta[];
  reservedTagsInUse: string[];
  isSaving: boolean;
  /** ディスクに保存済みの内容と差分がある */
  hasUnsavedChanges: boolean;
  onChangeConfig: (next: AppConfig) => void;
  onSave: () => void;
  onClose: () => void;
  onStatus?: (message: string) => void;
  onReplaceTagGlobally: (from: string, to: string) => Promise<void>;
  onAddOrphanToTemplate: (tag: string) => void;
  onRemoveTagFromAllMemos: (tag: string) => Promise<void>;
};

export function SettingsPanel(props: SettingsPanelProps) {
  const {
    config,
    templateTags,
    orphanTags,
    notes,
    reservedTagsInUse,
    isSaving,
    hasUnsavedChanges,
    onChangeConfig,
    onSave,
    onClose,
    onStatus,
    onReplaceTagGlobally,
    onAddOrphanToTemplate,
    onRemoveTagFromAllMemos,
  } = props;

  const [notesDirBusy, setNotesDirBusy] = useState(false);
  const [notesDirOpening, setNotesDirOpening] = useState(false);
  const [resolvedNotesDir, setResolvedNotesDir] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void resolveNotesDirPath(config.notesDir).then((path) => {
      if (!cancelled) setResolvedNotesDir(path);
    });
    return () => {
      cancelled = true;
    };
  }, [config.notesDir]);

  const handlePickNotesDir = () => {
    setNotesDirBusy(true);
    void pickNotesDirFolder(config.notesDir)
      .then((selected) => {
        if (selected) onChangeConfig({ ...config, notesDir: selected });
      })
      .catch((err) => handleInvokeError(err, "pickNotesDir"))
      .finally(() => setNotesDirBusy(false));
  };

  const handleOpenNotesDir = () => {
    setNotesDirOpening(true);
    void openNotesDirInExplorer(config.notesDir)
      .catch((err) => {
        onStatus?.(handleInvokeError(err, "openNotesDir"));
      })
      .finally(() => setNotesDirOpening(false));
  };

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="h-12 border-b flex items-center justify-between px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider bg-background/80">
        <span>設定</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            {messages.manager.close}
          </Button>
          <Button
            size="sm"
            variant={hasUnsavedChanges ? "default" : "outline"}
            className={
              hasUnsavedChanges
                ? "shadow-md ring-2 ring-primary/35 ring-offset-2 ring-offset-background"
                : undefined
            }
            onClick={onSave}
            disabled={isSaving || !hasUnsavedChanges}
          >
            {isSaving ? messages.status.saving : "保存"}
          </Button>
        </div>
      </div>

      {hasUnsavedChanges && (
        <div
          className="border-b border-amber-500/40 bg-amber-500/12 px-4 py-2 text-sm text-amber-950 dark:text-amber-100"
          role="status"
        >
          {messages.settings.unsaved}
        </div>
      )}

      <div className="p-4 space-y-5 overflow-y-auto">
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">メモ保存先</h3>
          <div className="flex flex-wrap gap-2">
            <Input
              className="min-w-[12rem] flex-1"
              value={config.notesDir}
              onChange={(e) => onChangeConfig({ ...config, notesDir: e.target.value })}
              placeholder={messages.settings.notesDirPlaceholder}
            />
            <Button
              type="button"
              variant="outline"
              className="shrink-0"
              disabled={notesDirBusy || !config.notesDir.trim()}
              onClick={handleOpenNotesDir}
            >
              <ExternalLink className="h-4 w-4" />
              {messages.settings.notesDirOpen}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="shrink-0"
              disabled={notesDirBusy || notesDirOpening}
              onClick={handlePickNotesDir}
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
          <p className="text-xs text-muted-foreground">{messages.settings.notesDirHint}</p>
        </section>

        <SettingsThemeSection
          themeMode={config.themeMode}
          themePreset={config.themePreset}
          onChangeThemeMode={(themeMode) => onChangeConfig({ ...config, themeMode })}
          onChangeThemePreset={(themePreset) => onChangeConfig({ ...config, themePreset })}
        />

        <SettingsTagsSection
          config={config}
          templateTags={templateTags}
          orphanTags={orphanTags}
          notes={notes}
          reservedTagsInUse={reservedTagsInUse}
          onChangeConfig={onChangeConfig}
          onReplaceTagGlobally={onReplaceTagGlobally}
          onAddOrphanToTemplate={onAddOrphanToTemplate}
          onRemoveTagFromAllMemos={onRemoveTagFromAllMemos}
        />
      </div>
    </main>
  );
}
