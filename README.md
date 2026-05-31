# Scriptax

ローカルに Markdown メモを保存・編集するデスクトップアプリです。タグ付け、検索、プレビュー、ブラウザへの「提示」表示に対応しています。

ソースコードは GitHub リポジトリ [kouzaki496/md-memo](https://github.com/kouzaki496/md-memo) で公開しています（製品名は **Scriptax**）。

## ダウンロード

[Releases](https://github.com/kouzaki496/md-memo/releases) から最新版を取得してください。

| 項目 | 内容 |
|------|------|
| 対応 OS | **Windows** / **macOS** / **Linux** |
| バージョン | アプリ内のサイドバーまたは **設定 → アプリについて** に表示 |

### インストール（Windows）

1. Releases の **Assets** から `.msi` または `.exe`（NSIS）をダウンロード
2. インストーラを実行
3. 初回起動時に **メモの保存先フォルダ** を指定

> **SmartScreen** — 未署名のため「不明な発行元」と表示される場合があります。「詳細情報」→「実行」で続行できます。

### インストール（macOS）

1. お使いの Mac に合った `.dmg` を選ぶ（Apple Silicon 用 / Intel 用）
2. `.dmg` を開き、アプリを Applications にドラッグ
3. 初回起動時に **メモの保存先フォルダ** を指定

> **Gatekeeper** — 未署名・未公証のため「開発元を確認できない」と出る場合があります。**右クリック → 開く** で起動してください。

### インストール（Linux）

1. Releases の **Assets** から `.deb` または `.AppImage` をダウンロード
2. **`.deb`**: ディストリのパッケージマネージャでインストール（例: `sudo dpkg -i Scriptax_*.deb`）
3. **`.AppImage`**: 実行権限を付与して起動（例: `chmod +x Scriptax_*.AppImage && ./Scriptax_*.AppImage`）

> Ubuntu 22.04 系でビルドしています。他ディストリでは依存関係の追加が必要な場合があります。

## メモの保存場所

- 初回起動時、または **設定** で保存先フォルダ（`notesDir`）を指定します
- フォルダ名だけ（例: `scriptax-notes`）を指定した場合、**ドキュメント** 配下に作成されます
- メモは **ローカルの `.md` ファイル** として保存されます（クラウド同期や外部サーバーへの送信は行いません）

## 主な機能

- Markdown 編集・プレビュー（GFM: テーブル、タスクリスト、脚注、打ち消し線 など）
- Mermaid 図（アプリ内プレビュー・ブラウザ提示）
- Callout（`::: note` / `note::` 記法）
- タグ・フロントマター
- 検索（あいまい検索 + `"完全一致"` / `#タグ`）
- **提示** — localhost 上でブラウザに表示（画面共有・Meet 等向け）
- テーマ（ライト / ダーク / プリセット）

アプリ付属の **ショートカット一覧**・**Markdown リファレンス** メモ（ピン留め）も参照できます。

## 提示（ブラウザ表示）について

- アプリから **提示** を開始すると、同一 PC のブラウザで viewer が開きます
- 提示 viewer の Mermaid は **jsDelivr CDN** 経由で描画されます（オフラインでは Mermaid が表示されない場合があります）
- 提示用 URL は `localhost` のみです。同じ PC のブラウザで開き、Meet 等でその画面を共有する想定です（他の端末から URL を開いて見ることはできません）

## 既知の制約（v0.1.0）

- 自動更新（Updater）は未対応 — 新版は Releases から手動で取得
- コード署名・macOS 公証なし — OS のセキュリティ警告が出る場合あり
- 提示 viewer の Mermaid は CDN 依存

## 開発

### 必要環境

- Node.js 20.19 以上
- Rust（stable）
- **Windows**: [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/)（通常は OS 同梱）
- **Linux**: `libwebkit2gtk-4.1-dev` など（[Tauri 前提条件](https://v2.tauri.app/start/prerequisites/) 参照）
- **macOS**: Xcode Command Line Tools

### コマンド

```bash
npm ci
npm run tauri dev    # 開発
npm test             # テスト
npm run tauri build  # 配布用ビルド（成果物: src-tauri/target/release/bundle/）
```

詳細なリリース手順は [docs/release-roadmap.md](docs/release-roadmap.md) を参照してください。

## ライセンス

[MIT License](LICENSE)
