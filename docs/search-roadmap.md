# 検索まわり TODO（あいまい検索の前）

最終更新: 2026-05-29

あいまい検索に着手する前に、exact 検索の整理と拡張の土台を固めるためのメモ。

## 現状（2026-05-29 時点）

| 層 | 内容 |
|----|------|
| Rust | `src-tauri/src/notes/search.rs` — タグ検索（`#` 全語）/ 本文 AND（スペース区切り） |
| API | `search_notes(app, query)` → `SearchNotesResult`（`mode`, `hits[]`） |
| フロント | `useNoteSearch` 経由（サイドバー / 一覧管理） |
| タグ判定 UI | Rust の `SearchNotesResult.mode` / `SearchHit.mode` |
| 未使用 | ~~`useSearchHighlight` 未接続~~ → プレビューハイライト接続済み |

### 検索モード

| 入力例 | モード | 条件 |
|--------|--------|------|
| `#work #draft` | タグ | フロントマター tags の AND（大小区別なし） |
| `hello world` | 本文 | 同一 `.md` 内の AND（大文字含む語は大小区別） |
| `#work メモ` | **タグ+本文** | タグ `work` AND 本文に `メモ`（両方同一ファイル） |

### 既知のギャップ

- ~~本文検索はフロントマター（`---` ブロック）も対象~~ → 除外済み（2026-05-29）
- ~~サイドバーは全件数を表示するがリストは最大 8 件~~ → 超過時は一覧管理へ誘導（§8）
- ~~入力のたびに全 `.md` をディスク走査（デバウンスなし）~~ → 250ms デバウンス済み（2026-05-29）
- ~~`resolve_notes_root` 失敗時 Rust は黙って `[]` を返す（0 件と区別不可）~~ → §10 で `Err` 化済み
- 一覧管理プレースホルダー「タイトル・内容で検索」は実態（本文 AND）と不一致

---

## 優先度: 高（あいまい検索の土台）

### 1. マッチ戦略の抽象化（Rust） ✅ 2026-05-29

- [x] `MatchMode`（`Exact` / 将来 `Fuzzy`）
- [x] `LineTermMatcher`（本文部分一致）・`TagTermMatcher`（タグ完全一致）
- [x] `ExactMatcher` 実装 + AND ヘルパー（`all_terms_match_lines` / `all_terms_match_tags`）
- [x] `search_notes_in_root_with_mode` でモード差し替え可能

**関連:** `src-tauri/src/notes/match_strategy.rs`, `src-tauri/src/notes/search.rs`

### 2. デバウンス + 検索フック共通化（フロント） ✅ 2026-05-29

- [x] `useNoteSearch(query)` フックを新設（invoke + cancelled + エラー処理）
- [x] 250ms デバウンス
- [x] サイドバー / 一覧管理の両方から利用

**関連:** `src/hooks/useNoteSearch.ts`, `src/hooks/useNotesData.ts`

### 3. 本文検索からフロントマターを除外（Rust） ✅ 2026-05-29

- [x] `searchable_lines` でフロントマター以降のみ走査
- [x] テスト追加（frontmatter 内の語はヒットしない）

**関連:** `src-tauri/src/notes/search.rs`

### 4. `SearchHit` / 結果モデルの拡張 ✅ 2026-05-29

- [x] `score: Option<f32>`（exact では `None` → TS では `null`）
- [x] `SearchHit.mode` + `SearchNotesResult.mode`（`tag` | `body`）
- [x] フロント `src/types/note.ts` を同期

**関連:** `src-tauri/src/notes/types.rs`, `src/types/note.ts`

### 5. タグ判定の単一ソース化 ✅ 2026-05-29

- [x] Rust が `mode` を返す（0 件でも tag クエリなら `mode: tag`）
- [x] Sidebar は `searchMode` / `SearchHit.mode` を参照
- [x] `src/lib/tagSearch.ts` 削除

**関連:** `src/components/app/Sidebar.tsx`, `src/hooks/useNoteSearch.ts`

---

## 優先度: 中（仕様・UX のすり合わせ）

### 6. 混在クエリの仕様決定 ✅ 2026-05-29

**方針 B:** `#` 始まりの語はタグ、それ以外は本文。両方あれば複合 AND（`SearchMode::Mixed`）。

- [x] `parse_query` で tag / body / mixed を分岐
- [x] `#work メモ` → タグ `work` + 本文 `メモ`
- [x] プレースホルダー・Sidebar 見出しを更新

**関連:** `src-tauri/src/notes/search.rs`, `src/lib/messages.ts`

### 7. プレースホルダー文言の修正 ✅ 2026-05-29

- [x] 一覧管理・サイドバーを複合検索の説明に更新

**関連:** `src/lib/messages.ts`

### 8. サイドバー 8 件上限の見直し ✅ 2026-05-29

件数バッジは全件、リストは最大 8 件。超過時は「一覧管理で見る」で一覧管理を開き、サイドバーと同じ検索語を引き継ぐ。

- [x] `SIDEBAR_SEARCH_PREVIEW_LIMIT = 8`
- [x] 超過時リンク → `openManager({ searchQuery })`

### 9. プレビューハイライト ✅ 2026-05-29

- [x] 本文 / mixed のときプレビューでヒット語を `<mark>` 強調
- [x] `#` 始まりの語（タグ条件）はハイライトしない
- [x] インライン `code` / コードブロック内はスキップ
- [ ] あいまい検索時は部分一致範囲のハイライトを別途設計

**関連:** `src/lib/searchHighlight.tsx`, `src/lib/markdownPreviewComponents.tsx`

### OR 検索（見送り）

- スペース区切りは AND のまま。OR は未対応（需要が出たら明示構文を検討）

### 10. エラーと 0 件の区別 ✅ 2026-05-29

- [x] `search_notes` を `Result<SearchNotesResult, String>` にする、または失敗時のみ `Err`
- [x] フロントで「検索失敗」と「一致なし」を分けて表示（`messages.status.searchFailed` は既存）

---

## 優先度: 低（fuzzy とセットでも可）

### 11. パフォーマンス / インデックス ✅ 2026-05-29

メモ数増加時、exact でもフルスキャンは重くなる。fuzzy 前後で検討。

- [x] mtime/size キャッシュ（`search_cache.rs`）— パス一覧 + 解析済みファイル内容
- [x] 保存・削除・タグ一括・保存先変更でキャッシュ無効化
- [x] タグ検索の `par_iter` 並列化
- [x] 手動ベンチマーク `search_warm_cache_benchmark`（500 件、`--ignored`）
- [x] キャッシュ単体・検索連携テスト（`search_cache.rs` / `search.rs`）
- [ ] tantivy 等の全文インデックス（fuzzy 前後で必要なら）
- [ ] 非同期コマンド（UI ブロック回避が必要なら）

**関連:** `src-tauri/src/notes/search_cache.rs`, `src-tauri/src/notes/search.rs`

### 12. テスト追加（exact） ✅ 2026-05-29

- [x] 大小区別（`Hello` vs `hello`）— `match_strategy.rs` + `search.rs`
- [x] フロントマター除外 — `body_search_ignores_frontmatter`
- [x] 混在クエリ `#work foo` — `mixed_search_with_short_body_term`
- [x] 空語・空白のみ — `empty_and_whitespace_queries_*`, `hash_only_tag_queries_*`
- [x] あいまい検索 placeholder — `#[ignore]`（`fuzzy_*_placeholder`）

**関連:** `src-tauri/src/notes/search.rs`, `src-tauri/src/notes/match_strategy.rs`

---

## 推奨実装順

1. ~~フロントマター除外 + デバウンス + フック共通化~~ ✅
2. ~~`MatchMode` / `TermMatcher` 抽象化~~ ✅
3. ~~`SearchHit` に `score`・`mode` 追加、タグ判定 TS 重複解消~~ ✅
4. ~~プレースホルダー・混在クエリ仕様・エラー処理~~ ✅
5. ~~exact テスト補強（§12）~~ ✅
6. **あいまい検索**（`TermMatcher` の Fuzzy 実装、スコア順ソート）
7. 必要に応じて §8 サイドバー上限・インデックス（tantivy）

---

## あいまい検索（将来・メモのみ）

- タグ検索は完全一致のままが自然
- 本文: 編集距離 / n-gram / Skim 等 — `TermMatcher` に差し込み
- 閾値・最小語長は設定 or 定数で調整可能に
- 結果は `score` 降順 + 更新日時 tie-break
- パフォーマンス次第でインデックス必須の可能性大

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
| サイドバー UI | `src/components/app/Sidebar.tsx` |
| 一覧 UI | `src/components/app/ManagerPanel.tsx` |
| ハイライト | `src/lib/searchHighlight.tsx`, `src/hooks/useSearchHighlight.tsx` |
| 文言 | `src/lib/messages.ts` |
