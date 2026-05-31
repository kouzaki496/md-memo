# 検索まわり TODO

最終更新: 2026-05-29

exact 土台・あいまい検索（常時 + `"` 完全一致）まで実装済み。

## 現状（2026-05-29 時点）

| 層 | 内容 |
|----|------|
| Rust | `search.rs` — タグ exact / 本文 fuzzy（`"` 囲みは exact）/ タグ+本文 |
| マッチ | `FuzzyMatcher` — 編集距離 + 部分一致、`MIN_FUZZY_SCORE = 0.75` |
| API | `search_notes(app, query)` → `Result<SearchNotesResult, String>` |
| フロント | `useNoteSearch` — サイドバー / 一覧管理 |
| 一覧管理 | `managerSearchFilter.ts` — ヒットと `noteDetails` 突合 |
| ハイライト | `searchQueryParse.ts` + `searchHighlight.tsx` |

### 検索仕様

| 入力例 | 解釈 |
|--------|------|
| `meetng` | 本文 fuzzy（typo 許容） |
| `"meeting"` | 本文 exact（部分一致） |
| `"hello world"` | exact フレーズ 1 語 |
| `#work meetng` | タグ exact + 本文 fuzzy |
| `#work "weekly report"` | タグ exact + exact フレーズ |

- タグ（`#` 始まり・引用符外）: 常に exact
- 引用符内の `#` は本文語の一部
- 未閉じ `"` → 末尾まで exact 語
- `""` / 空白のみ → 0 件
- 並び: `score` 降順 → 更新日時（exact のみヒットは `score: null`）
- スコア詳細: [search-scoring.md](./search-scoring.md)

### 既知のギャップ（軽微）

- ~~フロントの検索ユニットテストなし~~ → Vitest で `fuzzyMatch` / `searchQueryParse` 等をカバー（2026-05-29）
- FE↔BE 契約: `docs/search-contract.json` + `npm run test:contract`（2026-05-29）
- tantivy は必要になったら
- 非同期 invoke ✅（`search_notes` + フロント世代 ID）

---

## 完了済み

### exact 土台（§1〜§12） ✅

デバウンス、フロントマター除外、`SearchHit.score/mode`、混在クエリ、エラー区別、キャッシュ、テスト — すべて完了。

### 一覧管理検索（§13） ✅

`managerSearchFilter` / `managerDetailsReady` / `closeManager` 等。

### あいまい検索 Rust（§13 相当） ✅ 2026-05-29

- [x] `FuzzyMatcher` + 編集距離
- [x] `parse_raw_terms` — `"` 囲み exact
- [x] デフォルト `search_notes_in_root` = fuzzy 本文
- [x] `MatchMode::Exact` — 全語 exact（テスト用 `search_notes_in_root_with_mode`）
- [x] スコアソート
- [x] テスト（typo / 引用符 / 混在 / パース）

**関連:** `match_strategy.rs`, `search.rs`

### あいまい検索フロント（§14） ✅ 2026-05-29

- [x] プレースホルダーに `"完全一致"` / あいまいの説明
- [x] `searchQueryParse.ts` — ハイライト語パース
- [x] リストに「？」バッジ（ホバーで説明ツールチップ）
- [x] プレビューハイライト（exact / fuzzy とも amber、fuzzy は本文語を強調）

### OR 検索（見送り）

- スペース区切りは AND のまま

### パフォーマンス（§11 残）

- [x] 非同期 invoke — `search_notes` を `spawn_blocking`、フロントは世代 ID で古い結果を破棄
- [x] サイドバー「検索中…」
- [ ] tantivy（必要なら）

---

## 関連ファイル

| 用途 | パス |
|------|------|
| マッチ戦略 | `src-tauri/src/notes/match_strategy.rs` |
| 検索 Rust | `src-tauri/src/notes/search.rs` |
| 検索キャッシュ | `src-tauri/src/notes/search_cache.rs` |
| 型 | `src-tauri/src/notes/types.rs`, `src/types/note.ts` |
| 検索フック | `src/hooks/useNoteSearch.ts` |
| フロント state | `src/hooks/useNotesData.ts` |
| クエリパース（TS） | `src/lib/searchQueryParse.ts`, `src/lib/fuzzyMatch.ts` |
| 一覧フィルタ | `src/lib/managerSearchFilter.ts` |
| ハイライト | `src/lib/searchHighlight.tsx`, `src/hooks/useSearchHighlight.tsx` |
| 文言 | `src/lib/messages.ts` |
| スコアリング | [search-scoring.md](./search-scoring.md) |
