import { editorShortcutConfig } from "@/config/editorShortcuts";

import {
  BUILTIN_TAGS_SHORTCUTS,
  formatBuiltinTagsLine,
} from "@/lib/reservedTags";

function fmtShortcut(key: string): string {
  return `Ctrl/Cmd + ${key.toUpperCase()}`;
}

export function buildShortcutMemoContent(): string {
  const headingKeys = editorShortcutConfig.headingShortcutKeys
    .map((k) => `- \`${fmtShortcut(k)}\`: 見出し h${k}（同じレベルで解除）`)
    .join("\n");

  const listCycle = editorShortcutConfig.listCycleOrder
    .map((k) => (k === "plain" ? "プレーン" : k === "unordered" ? "箇条書き" : k === "ordered" ? "番号付き" : "タスク"))
    .join(" -> ");

  return `---
${formatBuiltinTagsLine(BUILTIN_TAGS_SHORTCUTS)}
---
# エディタショートカット

このメモはアプリ起動時に内容が自動更新されます（閲覧専用）。

## 文字サイズ
- \`${fmtShortcut(editorShortcutConfig.zoomIn.key)}\` / \`${fmtShortcut(editorShortcutConfig.zoomInAlt.key)}\`: 拡大
- \`${fmtShortcut(editorShortcutConfig.zoomOut.key)}\` / \`${fmtShortcut(editorShortcutConfig.zoomOutAlt.key)}\`: 縮小
- \`${fmtShortcut(editorShortcutConfig.zoomReset.key)}\`: リセット
- \`Ctrl/Cmd + マウスホイール\`: 拡大/縮小

## 書式
- \`${fmtShortcut(editorShortcutConfig.boldToggle.key)}\`: 太字
- \`Ctrl/Cmd + Shift + ${editorShortcutConfig.clearMarkdown.key.toUpperCase()}\`: 選択範囲の Markdown 記法を外してプレーン化
${headingKeys}

## 選択
- \`Alt + ${editorShortcutConfig.selectNextOccurrence.key.toUpperCase()}\`: 選択中テキストの次の一致箇所を選択

## リスト
- \`${fmtShortcut(editorShortcutConfig.listCycle.key)}\`: ${listCycle} を循環
- \`${editorShortcutConfig.listIndentKey}\`: 下位階層へ
- \`Shift + ${editorShortcutConfig.listIndentKey}\`: 上位階層へ
- \`Alt + ${editorShortcutConfig.listIndentKey}\`: 上位階層へ（OSに奪われる場合あり）

## 行
- \`Alt + ↑\` / \`Alt + ↓\`: カーソル行または選択範囲に含まれる**行全体のブロック**を、直上・直下の 1 行と入れ替え
- \`Alt + Shift + ↑\` / \`Alt + Shift + ↓\`: カーソル行または選択範囲に含まれる**行全体のブロック**を直上・直下へ複製

---
内容はアプリのショートカット設定に合わせて自動更新されます。
`;
}
