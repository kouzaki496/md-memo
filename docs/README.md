# docs — リポジトリ管理ドキュメント

CI・契約テスト・公開仕様で参照されるファイルを置く。**ロードマップ類は `dev/`（gitignore）へ。**

## ファイル一覧

| ファイル | 用途 |
|---------|------|
| [search-scoring.md](./search-scoring.md) | 検索スコアリング仕様（FE/BE 共通の説明） |
| [release-roadmap.md](./release-roadmap.md) | GitHub Releases + Actions 向けリリース TODO |
| [search-contract.json](./search-contract.json) | 検索 FE↔BE 契約（`npm run test:contract`） |
| [frontmatter-contract.json](./frontmatter-contract.json) | タグ / FM 契約 |
| [callout-contract.json](./callout-contract.json) | Callout パース契約 |

## ローカル専用（`dev/`）

進捗メモ・リファクタリング TODO などは [dev/](../dev/) に置く（`.gitignore` 対象）。

- `refactoring-roadmap.md`
- `search-roadmap.md`
- `screen-share-browser-view.md`
