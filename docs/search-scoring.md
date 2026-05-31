# 検索スコアリング

最終更新: 2026-05-29

Scriptax の `search_notes` が返す `SearchHit.score` の算出方法と、結果の並び順をまとめる。

**実装:** `src-tauri/src/notes/match_strategy.rs`（語スコア）、`src-tauri/src/notes/search.rs`（ヒット集約・ソート）

---

## API 上の `score`

| フィールド | 型（Rust / TS） | 意味 |
|-----------|----------------|------|
| `SearchHit.score` | `Option<f32>` / `number \| null` | 本文・mixed ヒットの関連度。タグ検索は常に `None` / `null` |

- **`null`（`None`）** — そのメモは **exact のみ** で条件を満たした（部分一致・引用符 exact など）。ソート時は **1.0 相当** として扱う。
- **数値（`Some(f32)`）** — **fuzzy 語が 1 つ以上** 含まれ、typo 許容でマッチした。値は **0.75 〜 1.0 未満**（後述）。

フロントは現状スコアを UI 表示していない。並び順への反映のみ。

---

## スコアが付く条件（メモ 1 件あたり）

`compute_body_hit_score`（`search.rs`）で決まる。

1. クエリ内の **本文語**（`BodyTerm`）ごとに、フロントマター除外後の **全行** から最良スコアを取る。
2. 各語の最良スコアの **最小値** をメモのスコア候補とする（AND 検索のため「一番弱い語」に引っ張られる）。
3. 次のいずれかなら **`score = null`**:
   - 本文語が 0 個（**タグ検索のみ**）
   - すべての本文語が **exact**（`"` 囲み、または `MatchMode::Exact` 強制）
   - fuzzy 語があっても、すべて **部分一致で 1.0**（typo 補正なし）
4. **fuzzy 語**（引用符なし）のうち **1 つでも** 最良スコアが 1.0 未満なら **`score = Some(min)`**。

```text
score = min( 各本文語 term の max_{行} body_term_score(行, term) )
```

タグ条件（`#work` など）は **スコア計算に含めない**。タグヒットの `SearchHit.score` は常に `null`。

---

## 語スコア `body_term_score(行, term)`

| 条件 | マッチャ | スコア |
|------|----------|--------|
| `term.exact == true`（`"..."`） | `ExactMatcher` | 部分一致なら `1.0`、それ以外 `None` |
| 通常の fuzzy 語 | `FuzzyMatcher` | 下記 |
| `MatchMode::Exact` 強制 | `ExactMatcher` | 部分一致なら `1.0` |

---

## `FuzzyMatcher` の語スコア（行内）

### 1. 部分一致が最優先

行全体に対し `ExactMatcher` と同じルールで部分一致したら **即 `1.0`**（fuzzy 計算はしない）。

- 語に大文字が含まれる → **大小区別** の部分一致のみ
- それ以外 → **大小区別なし** の部分一致

### 2. 部分一致しない場合の fuzzy

次を **すべて** 満たすときだけ編集距離を使う。

| 定数 | 値 | 役割 |
|------|-----|------|
| `MIN_FUZZY_TERM_LEN` | `3` | これ未満の語長は fuzzy しない（部分一致のみ） |
| 大文字を含む語 | — | fuzzy **無効**（部分一致のみ） |

**比較単位:** 行を「語」に分割した各トークン（空白・`-`・`_`・`/` で分割）と、検索語 1 語を **Levenshtein 距離**（Unicode コードポイント / `char` 単位）で比較する。

行内の **最高スコア** のトークンをその行のスコアとする。

### 3. トークン 1 組のスコア式

```text
max_len = max( len(word), len(term) )   // 文字数（char count）
dist    = Levenshtein(word, term)
allowed = max_allowed_edits(max_len)

max_allowed_edits(n):
  n < 3  → 0
  n ≤ 4  → 1
  n > 4  → ceil(n × 0.34)

if dist ≤ allowed:
  score = 1.0 - dist / max_len
  if score ≥ 0.75 (MIN_FUZZY_SCORE):
    採用
  else:
    不一致
else:
  不一致
```

| 定数 | 値 |
|------|-----|
| `MAX_EDIT_RATIO` | `0.34` |
| `MIN_FUZZY_SCORE` | `0.75` |

fuzzy 比較時は **小文字化** してから距離を測る（部分一致の大文字ルールとは別）。

---

## 計算例

### 部分一致（fuzzy 語でも 1.0 → 最終 `score` は null になりうる）

| 行 | 検索語 | 結果 |
|----|--------|------|
| `team meeting` | `meeting` | 部分一致 → **1.0** |

### typo（fuzzy）

| 行 | 検索語 | word | dist | max_len | allowed | score | 採用 |
|----|--------|------|------|---------|---------|-------|------|
| `weekly meeting notes` | `meetng` | `meeting` | 1 | 7 | 3 | 1 - 1/7 ≈ **0.857** | ✓ |
| 同上 | `meetngs` | `meeting` | 2 | 7 | 3 | 1 - 2/7 ≈ **0.714** | ✗ (< 0.75) |

### 複合 AND

クエリ: `meetng "stand up"`

- `meetng` → fuzzy、スコア ≈ 0.857
- `"stand up"` → exact、スコア 1.0

メモの `score = min(0.857, 1.0) = 0.857` → **`Some(0.857)`**（fuzzy 語があるため）。

クエリ: `"weekly meeting"` のみ → すべて exact かつ 1.0 → **`null`**。

---

## 結果の並び順

`sort_hits`（`search.rs`）:

1. **スコア降順** — `score.unwrap_or(1.0)` で比較（`null` は 1.0 扱い）
2. **更新日時**（`modified` ms）降順
3. **作成日時**降順
4. **path** 昇順（安定 tie-break）

タグ検索・exact のみの本文検索も、更新日時順で並ぶ（スコアはすべて 1.0 相当）。

---

## スコアの対象外

| ケース | `score` |
|--------|---------|
| タグ検索（`#work` など） | 常に `null` |
| 本文 exact のみでヒット | `null` |
| タグ + 本文 mixed | 本文側の fuzzy 有無のみ反映 |

---

## 将来の変更ポイント

- 定数（`MIN_FUZZY_SCORE` / `MAX_EDIT_RATIO` / `MIN_FUZZY_TERM_LEN`）は `match_strategy.rs` 先頭。設定画面連携は未実装。
- フロントでのスコア表示・fuzzy マッチ範囲のハイライトは未実装（`dev/search-roadmap.md` 参照）。
- 日本語形態素解析ベースの fuzzy は未対応（現状は **単語トークン + Levenshtein**）。
