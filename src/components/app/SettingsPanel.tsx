import { useEffect, useState } from "react";
import { ExternalLink, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AppConfig } from "@/types/config";
import type { NoteMeta } from "@/types/note";
import {
  DEFAULT_NEW_NOTE_TAG,
  countNotesWithTag,
  ensureLockedInboxInTemplateTags,
  isInboxTagName,
} from "@/lib/noteTags";
import { BUILTIN_RESERVED_TAG, isBuiltinReservedTagName } from "@/lib/reservedTags";
import { formatAppError } from "@/lib/appError";
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
  const [tagDraft, setTagDraft] = useState("");
  const [replaceFrom, setReplaceFrom] = useState("");
  const [replaceTo, setReplaceTo] = useState("");
  const [replaceBusy, setReplaceBusy] = useState(false);
  const [orphanBusy, setOrphanBusy] = useState<string | null>(null);
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
      .catch((err) => console.error(err))
      .finally(() => setNotesDirBusy(false));
  };

  const handleOpenNotesDir = () => {
    setNotesDirOpening(true);
    void openNotesDirInExplorer(config.notesDir)
      .catch((err) => {
        console.error(err);
        onStatus?.(formatAppError(err));
      })
      .finally(() => setNotesDirOpening(false));
  };

  const addTag = () => {
    const normalized = tagDraft.trim().replace(/^#+/, "");
    if (!normalized) return;
    if (isInboxTagName(normalized) || isBuiltinReservedTagName(normalized)) {
      setTagDraft("");
      return;
    }
    if (config.templateTags.some((t) => t.toLowerCase() === normalized.toLowerCase())) {
      setTagDraft("");
      return;
    }
    onChangeConfig({
      ...config,
      templateTags: ensureLockedInboxInTemplateTags([...config.templateTags, normalized]),
    });
    setTagDraft("");
  };

  const removeTag = (tag: string) => {
    if (isInboxTagName(tag) || isBuiltinReservedTagName(tag)) return;
    onChangeConfig({
      ...config,
      templateTags: config.templateTags.filter((t) => t !== tag),
    });
  };

  const editableTags = templateTags.filter(
    (tag) => !isInboxTagName(tag) && !isBuiltinReservedTagName(tag)
  );

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

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">表示テーマ</h3>
          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="theme-mode"
                checked={config.themeMode === "system"}
                onChange={() => onChangeConfig({ ...config, themeMode: "system" })}
                className="h-4 w-4 border-border accent-primary"
              />
              {messages.settings.themeSystem}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="theme-mode"
                checked={config.themeMode === "light"}
                onChange={() => onChangeConfig({ ...config, themeMode: "light" })}
                className="h-4 w-4 border-border accent-primary"
              />
              ライト
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="theme-mode"
                checked={config.themeMode === "dark"}
                onChange={() => onChangeConfig({ ...config, themeMode: "dark" })}
                className="h-4 w-4 border-border accent-primary"
              />
              ダーク
            </label>
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">テーマプリセット</h3>
          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="theme-preset"
                checked={config.themePreset === "default"}
                onChange={() => onChangeConfig({ ...config, themePreset: "default" })}
                className="h-4 w-4 border-border accent-primary"
              />
              デフォルト
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="theme-preset"
                checked={config.themePreset === "sepia"}
                onChange={() => onChangeConfig({ ...config, themePreset: "sepia" })}
                className="h-4 w-4 border-border accent-primary"
              />
              セピア
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="theme-preset"
                checked={config.themePreset === "high-contrast"}
                onChange={() => onChangeConfig({ ...config, themePreset: "high-contrast" })}
                className="h-4 w-4 border-border accent-primary"
              />
              ハイコントラスト
            </label>
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold">{messages.settings.tagListTitle}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{messages.settings.tagListHint}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span
              className="rounded-md border border-border bg-muted/50 px-2 py-1 text-xs text-muted-foreground"
              title={messages.tags.inboxLabel}
            >
              #{DEFAULT_NEW_NOTE_TAG}
            </span>
            {(reservedTagsInUse.length > 0 ? reservedTagsInUse : [BUILTIN_RESERVED_TAG]).map((tag) => (
              <span
                key={tag}
                className="rounded-md border border-border bg-muted/50 px-2 py-1 text-xs text-muted-foreground"
                title={messages.tags.builtinLabel}
              >
                #{tag}
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              placeholder={messages.settings.tagAddPlaceholder}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag();
                }
              }}
            />
            <Button type="button" variant="outline" onClick={addTag}>
              追加
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {editableTags.map((tag) => (
              <button
                key={tag}
                type="button"
                className="rounded-md border border-border bg-muted px-2 py-1 text-xs hover:bg-muted/70"
                onClick={() => removeTag(tag)}
                title={messages.settings.tagRemoveHint}
              >
                #{tag} ×
              </button>
            ))}
            {editableTags.length === 0 && (
              <div className="text-xs text-muted-foreground">{messages.settings.tagEmpty}</div>
            )}
          </div>
        </section>

        {orphanTags.length > 0 && (
          <section className="space-y-3 border-t border-border pt-5">
            <div>
              <h3 className="text-sm font-semibold">{messages.settings.orphanTitle}</h3>
              <p className="mt-1 text-xs text-muted-foreground">{messages.settings.orphanHint}</p>
            </div>
            <div className="space-y-2">
              {orphanTags.map((tag) => {
                const count = countNotesWithTag(notes, tag);
                const busy = orphanBusy === tag;
                return (
                  <div
                    key={tag}
                    className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-border/80 bg-muted/20 px-3 py-2"
                  >
                    <span className="text-sm font-medium">
                      #{tag}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {messages.settings.orphanCount(count)}
                      </span>
                    </span>
                    <div className="ml-auto flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => onAddOrphanToTemplate(tag)}
                      >
                        {messages.settings.orphanAdd}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                          setOrphanBusy(tag);
                          void onRemoveTagFromAllMemos(tag).finally(() => setOrphanBusy(null));
                        }}
                      >
                        {messages.settings.orphanRemove}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className="space-y-2 border-t border-border pt-5">
          <h3 className="text-sm font-semibold">{messages.settings.replaceTitle}</h3>
          <p className="text-xs text-muted-foreground">{messages.settings.replaceHint}</p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex min-w-[120px] flex-1 flex-col gap-1">
              <label className="text-xs text-muted-foreground" htmlFor="tag-replace-from">
                {messages.settings.replaceFrom}
              </label>
              <Input
                id="tag-replace-from"
                value={replaceFrom}
                onChange={(e) => setReplaceFrom(e.target.value)}
                placeholder={messages.settings.replaceFromPlaceholder}
                disabled={replaceBusy}
              />
            </div>
            <div className="flex min-w-[120px] flex-1 flex-col gap-1">
              <label className="text-xs text-muted-foreground" htmlFor="tag-replace-to">
                {messages.settings.replaceTo}
              </label>
              <Input
                id="tag-replace-to"
                value={replaceTo}
                onChange={(e) => setReplaceTo(e.target.value)}
                placeholder={messages.settings.replaceToPlaceholder}
                disabled={replaceBusy}
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={
                replaceBusy ||
                !replaceFrom.trim() ||
                !replaceTo.trim() ||
                replaceFrom.trim().toLowerCase() === replaceTo.trim().toLowerCase() ||
                isBuiltinReservedTagName(replaceFrom) ||
                isBuiltinReservedTagName(replaceTo)
              }
              onClick={() => {
                const from = replaceFrom.trim();
                const to = replaceTo.trim();
                if (!from || !to) return;
                if (from.toLowerCase() === to.toLowerCase()) return;
                if (isBuiltinReservedTagName(from) || isBuiltinReservedTagName(to)) return;
                const ok = window.confirm(messages.confirm.replaceTagGlobally(from, to));
                if (!ok) return;
                setReplaceBusy(true);
                void onReplaceTagGlobally(from, to)
                  .then(() => {
                    setReplaceFrom("");
                    setReplaceTo("");
                  })
                  .finally(() => setReplaceBusy(false));
              }}
            >
              {messages.settings.replaceButton}
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}
