---
tags: _builtin, shortcuts
---
# エディタショートカット

このメモはショートカット設定から自動生成されます。

## 文字サイズ
- `Ctrl/Cmd + +` / `Ctrl/Cmd + =`: 拡大
- `Ctrl/Cmd + -` / `Ctrl/Cmd + _`: 縮小
- `Ctrl/Cmd + 0`: リセット
- `Ctrl/Cmd + マウスホイール`: 拡大/縮小

## 書式
- `Ctrl/Cmd + B`: 太字
- `Ctrl/Cmd + T`: GFM テーブルを挿入
- `Ctrl/Cmd + Shift + K`: 選択範囲の Markdown 記法を外してプレーン化
- `Ctrl/Cmd + 1`: 見出し h1（同じレベルで解除）
- `Ctrl/Cmd + 2`: 見出し h2（同じレベルで解除）
- `Ctrl/Cmd + 3`: 見出し h3（同じレベルで解除）
- `Ctrl/Cmd + 4`: 見出し h4（同じレベルで解除）
- `Ctrl/Cmd + 5`: 見出し h5（同じレベルで解除）
- `Ctrl/Cmd + 6`: 見出し h6（同じレベルで解除）

## 選択
- `Alt + D`: 選択中テキストの次の一致箇所を選択

## リスト
- `Ctrl/Cmd + L`: プレーン -> 箇条書き -> 番号付き -> タスク を循環
- `Tab`: 下位階層へ
- `Shift + Tab`: 上位階層へ
- `Alt + Tab`: 上位階層へ（OSに奪われる場合あり）

## 行
- `Alt + ↑` / `Alt + ↓`: カーソル行または選択範囲に含まれる**行全体のブロック**を、直上・直下の 1 行と入れ替え
- `Alt + Shift + ↑` / `Alt + Shift + ↓`: カーソル行または選択範囲に含まれる**行全体のブロック**を直上・直下へ複製

---
設定定義: `src/config/editorShortcuts.ts`
