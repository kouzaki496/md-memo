import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AppConfig } from "@/types/config";
import { DEFAULT_NEW_NOTE_TAG, isInboxTagName } from "@/lib/noteTags";

type SettingsPanelProps = {
  config: AppConfig;
  isSaving: boolean;
  /** ディスクに保存済みの内容と差分がある */
  hasUnsavedChanges: boolean;
  onChangeConfig: (next: AppConfig) => void;
  onSave: () => void;
  onClose: () => void;
  /** 全メモのフロントマター tags とテンプレートタグの一括置換 */
  onReplaceTagGlobally: (from: string, to: string) => Promise<void>;
};

export function SettingsPanel(props: SettingsPanelProps) {
  const { config, isSaving, hasUnsavedChanges, onChangeConfig, onSave, onClose, onReplaceTagGlobally } = props;
  const [tagDraft, setTagDraft] = useState("");
  const [replaceFrom, setReplaceFrom] = useState("");
  const [replaceTo, setReplaceTo] = useState("");
  const [replaceBusy, setReplaceBusy] = useState(false);

  const addTag = () => {
    const normalized = tagDraft.trim().replace(/^#+/, "");
    if (!normalized) return;
    if (isInboxTagName(normalized)) {
      setTagDraft("");
      return;
    }
    if (config.templateTags.some((t) => t.toLowerCase() === normalized.toLowerCase())) {
      setTagDraft("");
      return;
    }
    onChangeConfig({ ...config, templateTags: [...config.templateTags, normalized] });
    setTagDraft("");
  };

  const removeTag = (tag: string) => {
    if (isInboxTagName(tag)) return;
    onChangeConfig({ ...config, templateTags: config.templateTags.filter((t) => t !== tag) });
  };

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="h-12 border-b flex items-center justify-between px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider bg-background/80">
        <span>設定</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            閉じる
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
            {isSaving ? "保存中..." : "保存"}
          </Button>
        </div>
      </div>

      {hasUnsavedChanges && (
        <div
          className="border-b border-amber-500/40 bg-amber-500/12 px-4 py-2 text-sm text-amber-950 dark:text-amber-100"
          role="status"
        >
          変更が保存されていません。「保存」を押すと config.json に書き込まれます。
        </div>
      )}

      <div className="p-4 space-y-5 overflow-y-auto">
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">メモ保存先</h3>
          <Input
            value={config.notesDir}
            onChange={(e) => onChangeConfig({ ...config, notesDir: e.target.value })}
            placeholder="例: zen-memo-notes または C:\\Users\\...\\notes"
          />
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
              システム（ライト）
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

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">テンプレートタグ</h3>
          <p className="text-xs text-muted-foreground">
            「{DEFAULT_NEW_NOTE_TAG}」は受信箱用に固定され、削除・重複追加はできません。
          </p>
          <div className="flex gap-2">
            <Input
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              placeholder="例: meeting"
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
            {config.templateTags.map((tag) =>
              isInboxTagName(tag) ? (
                <span
                  key={tag}
                  className="rounded-md border border-border bg-muted/50 px-2 py-1 text-xs text-muted-foreground"
                  title="受信箱タグ（固定）"
                >
                  #{tag}
                </span>
              ) : (
                <button
                  key={tag}
                  type="button"
                  className="rounded-md border border-border bg-muted px-2 py-1 text-xs hover:bg-muted/70"
                  onClick={() => removeTag(tag)}
                  title="クリックで削除"
                >
                  #{tag} ×
                </button>
              )
            )}
            {config.templateTags.length === 0 && (
              <div className="text-xs text-muted-foreground">タグがありません</div>
            )}
          </div>
        </section>

        <section className="space-y-2 border-t border-border pt-5">
          <h3 className="text-sm font-semibold">タグの一括置換</h3>
          <p className="text-xs text-muted-foreground">
            メモ保存先のすべての <code className="rounded bg-muted px-1">.md</code> の先頭 YAML{" "}
            <code className="rounded bg-muted px-1">tags:</code> 行だけを対象にします。タグ名の大文字小文字は同一視します。
            置換後は inbox 以外が残る場合は inbox は外れます（エディタのタグ操作と同じルール）。テンプレートタグ一覧に同じ名前があれば{" "}
            <code className="rounded bg-muted px-1">config.json</code> も更新されます。
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex min-w-[120px] flex-1 flex-col gap-1">
              <label className="text-xs text-muted-foreground" htmlFor="tag-replace-from">
                置換元
              </label>
              <Input
                id="tag-replace-from"
                value={replaceFrom}
                onChange={(e) => setReplaceFrom(e.target.value)}
                placeholder="例: educ."
                disabled={replaceBusy}
              />
            </div>
            <div className="flex min-w-[120px] flex-1 flex-col gap-1">
              <label className="text-xs text-muted-foreground" htmlFor="tag-replace-to">
                置換先
              </label>
              <Input
                id="tag-replace-to"
                value={replaceTo}
                onChange={(e) => setReplaceTo(e.target.value)}
                placeholder="例: 教育"
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
                replaceFrom.trim().toLowerCase() === replaceTo.trim().toLowerCase()
              }
              onClick={() => {
                const from = replaceFrom.trim();
                const to = replaceTo.trim();
                if (!from || !to) return;
                if (from.toLowerCase() === to.toLowerCase()) return;
                const ok = window.confirm(
                  `すべてのメモの tags に含まれる「${from}」を「${to}」に置き換えます（大文字小文字は同一視）。テンプレートに同じ名前があれば config も更新します。実行しますか？`
                );
                if (!ok) return;
                setReplaceBusy(true);
                void onReplaceTagGlobally(from, to)
                  .then(() => {
                    setReplaceFrom("");
                    setReplaceTo("");
                  })
                  .catch((err: unknown) => {
                    console.error(err);
                    window.alert(err instanceof Error ? err.message : String(err));
                  })
                  .finally(() => {
                    setReplaceBusy(false);
                  });
              }}
            >
              {replaceBusy ? "実行中…" : "全メモに適用"}
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}

