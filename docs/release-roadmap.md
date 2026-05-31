# リリースロードマップ

最終更新: 2026-05-29

Scriptax（Tauri 2）を **GitHub Releases + GitHub Actions** で配布するまでの TODO と運用方針。

関連:

- リポジトリ: https://github.com/kouzaki496/md-memo
- ドキュメント索引: [docs/README.md](./README.md)
- CI: [.github/workflows/ci.yml](../.github/workflows/ci.yml)
- バンドル設定: [src-tauri/tauri.conf.json](../src-tauri/tauri.conf.json)
- ローカル TODO（gitignore）: [dev/refactoring-roadmap.md](../dev/refactoring-roadmap.md)、[dev/search-roadmap.md](../dev/search-roadmap.md)

---

## 方針

| 項目 | 決定 |
|------|------|
| 配布チャネル | GitHub Releases（インストーラ / バイナリ添付） |
| ビルド | GitHub Actions（タグ push で起動） |
| ターゲット | **Windows / macOS / Linux**（Release workflow の matrix） |
| 初回バージョン | `v0.1.0` |
| 署名 | v0.1.0 は **なし**（SmartScreen / Gatekeeper 警告は許容） |
| 自動更新 | v0.1.0 では **Tauri Updater 未導入**（手動 DL） |

---

## 現状（2026-05-29）

| 項目 | 状態 |
|------|------|
| 開発ブランチ | `main`（`feature/001` マージ済み） |
| CI | `main` / `master` で test + `npm run build` |
| Release workflow | [.github/workflows/release.yml](../.github/workflows/release.yml)（Windows / macOS / Linux、`v*` タグ） |
| README | 利用者向けに差し替え済み |
| LICENSE | MIT（ルート [LICENSE](../LICENSE)） |
| バージョン | `0.1.0`（`package.json` / `tauri.conf.json` / `Cargo.toml` で一致） |

---

## フェーズ 0 — リリース前の整理（Actions より先）

### 必須

- [x] **`main` にマージ** — 以降のタグ・CI・Release は `main` 基準
- [x] **README 差し替え** — 用途・対応 OS・インストール・メモ保存場所・提示機能の制約
- [x] **`LICENSE` 追加** — MIT 等（配布に必須）
- [x] **ローカルで `npm run tauri build` 成功** — Windows 上でインストーラが `src-tauri/target/release/bundle/` に生成されること
- [x] **バージョン更新手順の固定** — 下記 3 ファイルを同じ値に揃える

| ファイル | キー |
|---------|------|
| [package.json](../package.json) | `"version"` |
| [src-tauri/tauri.conf.json](../src-tauri/tauri.conf.json) | `"version"` |
| [src-tauri/Cargo.toml](../src-tauri/Cargo.toml) | `[package].version` |

### 推奨

- [ ] **初回 Release notes 草稿** — `feature/001` 以降の変更を箇条書き（後述テンプレ）
- [ ] **CI に `tauri build` を追加するか判断** — Linux headless の成否を確認。難しければ Release 専用 workflow のみでも可
- [ ] **リポジトリ名 / 製品名** — 製品名は `Scriptax`（`tauri.conf.json`）。GitHub リポジトリ名 `md-memo` のままでも可。README で対応関係を明記

### 後回し（v0.1.0 では不要）

- Windows / macOS コード署名
- macOS 公証（notarization）
- Tauri Updater
- Microsoft Store / Mac App Store / winget / Homebrew
- 全 OS 同時ビルド（Release workflow で Windows / macOS / Linux）

---

## フェーズ 1 — GitHub Actions（Release workflow）

### トリガー

```yaml
on:
  push:
    tags:
      - 'v*'
```

タグ `v0.1.0` の push → ビルド → GitHub Release 作成 → 成果物アップロード。

### ジョブ（Release workflow）

| ジョブ | runner | 成果物（例） |
|--------|--------|--------------|
| Windows | `windows-latest` | `.msi`, `.exe`（NSIS） |
| macOS (Apple Silicon) | `macos-latest` | `.dmg`（`aarch64-apple-darwin`） |
| macOS (Intel) | `macos-latest` | `.dmg`（`x86_64-apple-darwin`） |
| Linux | `ubuntu-22.04` | `.deb`, `.AppImage` |

### ジョブ（旧・初版メモ）

Windows のみで開始したが、macOS / Linux を matrix に追加済み。

### ビルド手順（各ジョブ共通イメージ）

1. `actions/checkout@v4`
2. Node 22 + Rust stable
3. Windows: WebView2 / Linux: システム依存（Tauri 公式 workflow 参照）
4. `npm ci`
5. `npm run tauri build`
6. `src-tauri/target/release/bundle/**` を Release assets に upload

### 参考

- [Tauri — GitHub Actions](https://v2.tauri.app/distribute/pipelines/github/)
- 既存 CI: [.github/workflows/ci.yml](../.github/workflows/ci.yml)（テスト用。Release とは分離推奨）

---

## フェーズ 2 — 初回リリース手順（人間の運用）

1. `main` が最新であることを確認
2. バージョンを 3 ファイルで更新（例: `0.1.0`）
3. 変更を commit & push
4. タグ作成・push

   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```

5. Actions 完了を待つ
6. GitHub → Releases で `v0.1.0` の説明文・チェックサムを確認
7. 別マシン（または VM）でインストーラを試す

### Release notes テンプレ（v0.1.0 草稿）

```markdown
## Scriptax v0.1.0

ローカル Markdown メモエディタの初回公開版。

### 主な機能

- Markdown 編集・プレビュー（GFM: テーブル・タスクリスト・脚注・打ち消し線）
- Mermaid 図（プレビュー・ブラウザ提示）
- Callout（::: note / note:: 記法）
- タグ・フロントマター・検索（あいまい + 完全一致）
- ブラウザ提示（localhost・1 タブ viewer）
- テーマ（ライト / ダーク / preset）

### インストール

1. Assets から OS に合ったファイルを DL
   - Windows: `.msi` / `.exe`
   - macOS: Apple Silicon / Intel 用 `.dmg`
   - Linux: `.deb` / `.AppImage`
2. インストール（macOS 未署名時は右クリック → 開く）
3. 初回起動時にメモ保存フォルダを設定

### 既知の制約

- 未署名のため Windows SmartScreen / macOS Gatekeeper の警告が出る場合あり
- 提示 viewer の Mermaid は CDN（jsDelivr）を利用
- メモはローカル保存（クラウド同期なし）
```

---

## フェーズ 3 — 配布後

- [ ] Issues でフィードバック受付
- [ ] バグ修正 → パッチバージョン（`v0.1.1`）同手順で Release
- [ ] ダウンロード数・要望を見て配布形式（winget / Homebrew 等）を検討
- [ ] 必要ならコード署名・Updater を [release-roadmap.md](./release-roadmap.md) に追記して v0.2 以降で検討

---

## 利用者向けに README に書く内容（チェックリスト）

- [x] Scriptax とは何か（1〜2 文）
- [x] 対応 OS（Windows / macOS / Linux）
- [x] Releases からのインストール手順
- [x] メモの保存場所（設定 → notesDir、デフォルトはドキュメント配下）
- [x] データの扱い（ローカルのみ、外部送信なし）
- [x] 提示機能（localhost、Meet 等での画面共有向け）
- [x] ショートカット一覧メモ（`editor-shortcuts.md`）への言及
- [x] ライセンスへのリンク

---

## セキュリティ・Secrets（将来）

| Secret | 用途 | v0.1.0 |
|--------|------|--------|
| `TAURI_SIGNING_PRIVATE_KEY` | Windows/macOS 署名 | 不要 |
| Apple 証明書 / notarization | macOS | 不要 |
| `GITHUB_TOKEN` | Release upload | Actions デフォルトで可 |

---

## 関連ファイル

| 用途 | パス |
|------|------|
| 製品名・bundle | `src-tauri/tauri.conf.json` |
| Rust クレート | `src-tauri/Cargo.toml` |
| npm パッケージ | `package.json` |
| アイコン | `src-tauri/icons/` |
| CI（テスト） | `.github/workflows/ci.yml` |
| Release workflow | [.github/workflows/release.yml](../.github/workflows/release.yml) |
| 画面共有・提示仕様 | [dev/screen-share-browser-view.md](../dev/screen-share-browser-view.md) |

---

## 進捗メモ

| 日付 | 内容 |
|------|------|
| 2026-05-29 | 初版作成。GitHub Releases + Actions 方針、フェーズ 0〜3 を整理 |
| 2026-05-29 | Release workflow に macOS（Intel / Apple Silicon）・Linux を追加 |
