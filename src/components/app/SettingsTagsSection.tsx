import { useState } from "react";
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
import { messages } from "@/lib/messages";

type SettingsTagsSectionProps = {
  config: AppConfig;
  templateTags: string[];
  orphanTags: string[];
  notes: NoteMeta[];
  reservedTagsInUse: string[];
  onChangeConfig: (next: AppConfig) => void;
  onReplaceTagGlobally: (from: string, to: string) => Promise<void>;
  onAddOrphanToTemplate: (tag: string) => void;
  onRemoveTagFromAllMemos: (tag: string) => Promise<void>;
};

export function SettingsTagsSection(props: SettingsTagsSectionProps) {
  const {
    config,
    templateTags,
    orphanTags,
    notes,
    reservedTagsInUse,
    onChangeConfig,
    onReplaceTagGlobally,
    onAddOrphanToTemplate,
    onRemoveTagFromAllMemos,
  } = props;

  const [tagDraft, setTagDraft] = useState("");
  const [replaceFrom, setReplaceFrom] = useState("");
  const [replaceTo, setReplaceTo] = useState("");
  const [replaceBusy, setReplaceBusy] = useState(false);
  const [orphanBusy, setOrphanBusy] = useState<string | null>(null);

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
    <>
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
    </>
  );
}
