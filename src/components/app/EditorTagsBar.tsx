import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { messages } from "@/lib/messages";
import { cn } from "@/lib/utils";

const TAGS_BAR_EXPANDED_KEY = "scriptax-editor-tags-bar-expanded";

function readTagsBarExpanded(): boolean {
  try {
    const v = localStorage.getItem(TAGS_BAR_EXPANDED_KEY);
    if (v === "0") return false;
    if (v === "1") return true;
  } catch {
    /* ignore */
  }
  return true;
}

function writeTagsBarExpanded(expanded: boolean) {
  try {
    localStorage.setItem(TAGS_BAR_EXPANDED_KEY, expanded ? "1" : "0");
  } catch {
    /* ignore */
  }
}

type EditorTagsBarProps = {
  editorTagChips: string[];
  previewFmTags: string[];
  activeTagSet: Set<string>;
  tagsBarExpanded: boolean;
  onToggleTagsBar: () => void;
  onToggleTemplateTag: (tag: string) => void;
};

export function readInitialTagsBarExpanded(): boolean {
  return readTagsBarExpanded();
}

export function persistTagsBarExpanded(expanded: boolean) {
  writeTagsBarExpanded(expanded);
}

export function EditorTagsBar(props: EditorTagsBarProps) {
  const {
    editorTagChips,
    previewFmTags,
    activeTagSet,
    tagsBarExpanded,
    onToggleTagsBar,
    onToggleTemplateTag,
  } = props;

  if (editorTagChips.length === 0) return null;

  return (
    <div className="shrink-0 border-t bg-background/80">
      <button
        type="button"
        id="editor-tags-bar-toggle"
        className="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-muted/50"
        aria-expanded={tagsBarExpanded}
        aria-controls="editor-tags-bar-panel"
        onClick={onToggleTagsBar}
      >
        {tagsBarExpanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground shrink-0">
          {messages.editor.tagsBar}
        </span>
        {!tagsBarExpanded && (
          <span
            className="min-w-0 truncate text-xs text-muted-foreground"
            title={previewFmTags.join(", ") || undefined}
          >
            {previewFmTags.length > 0 ? previewFmTags.join(", ") : messages.editor.tagsNone}
          </span>
        )}
      </button>
      {tagsBarExpanded && (
        <div
          id="editor-tags-bar-panel"
          className="flex flex-wrap items-center gap-2 border-t border-border/50 px-4 pb-2 pt-1"
          role="group"
          aria-labelledby="editor-tags-bar-toggle"
        >
          {editorTagChips.map((tag) => {
            const on = activeTagSet.has(tag.toLowerCase());
            return (
              <Button
                key={tag}
                type="button"
                variant={on ? "default" : "outline"}
                size="xs"
                className={cn(
                  "rounded-full whitespace-nowrap font-medium",
                  on ? "shadow-sm" : "border-dashed text-muted-foreground hover:text-foreground"
                )}
                title={
                  on
                    ? `${messages.tags.detach(tag)}（${messages.tags.detachHint}）`
                    : `${messages.tags.attach(tag)}（${messages.tags.attachHint}）`
                }
                onClick={() => onToggleTemplateTag(tag)}
              >
                {tag}
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}
