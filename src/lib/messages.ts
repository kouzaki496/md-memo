/** アプリ内でユーザーに見せる文言（ステータス・説明・確認など） */

export const messages = {
  status: {
    ready: "準備完了",
    saving: "保存中…",
    saved: "保存しました",
    saveFailed: "保存に失敗しました",
    loaded: "読み込みました",
    editMode: "編集モード",
    previewMode: "プレビューモード",
    settings: "設定",
    settingsSaved: "設定を保存しました",
    settingsLoadFailed: "設定を読み込めませんでした",
    settingsSaveFailed: "設定を保存できませんでした",
    notesLoadFailed: "メモ一覧を読み込めませんでした",
    searchFailed: "検索に失敗しました",
    pinned: "ピン留めしました",
    unpinned: "ピン留めを解除しました",
    deleted: "削除しました",
    deletedCount: (n: number) => `${n} 件のメモを削除しました`,
    deletedCountSkippedBuiltin: (n: number) =>
      `${n} 件を削除しました（アプリ付属メモは除く）`,
    tagReplaced: (n: number) => `${n} 件のメモのタグを置き換えました`,
    tagRemoved: (tag: string, n: number) =>
      `「${tag}」を ${n} 件のメモから外しました`,
    openNoteFailed: (detail: string) => `メモを開けませんでした: ${detail}`,
    builtinReadOnly: "このメモは閲覧専用です",
    builtinNoDelete: "このメモは削除できません",
    builtinNoUnpin: "このメモはピン留め解除できません",
    shortcutMemoFailed:
      "ショートカット説明メモを作成できませんでした。保存先フォルダの権限を確認してください",
  },

  confirm: {
    deleteNote: (title: string) => `「${title}」を削除しますか？`,
    deleteSelected: (n: number) => `選択した ${n} 件を削除しますか？`,
    settingsDiscard: "変更を保存せず閉じますか？",
    removeTagGlobally: (tag: string) =>
      `すべてのメモから「${tag}」タグを外します。よろしいですか？`,
    replaceTagGlobally: (from: string, to: string) =>
      `すべてのメモで「${from}」を「${to}」に置き換えます。タグ一覧にも同じ名前があれば更新します。実行しますか？`,
  },

  tags: {
    inboxExclusive: "「受信箱」タグは、他のタグと一緒には使えません",
    builtinReserved: "アプリ用タグは変更できません",
    inboxLabel: "受信箱（固定）",
    builtinLabel: "アプリ用（固定）",
    attach: (tag: string) => `「${tag}」を付ける`,
    detach: (tag: string) => `「${tag}」を外す`,
    attachHint: "メモ先頭のタグ欄に追加します",
    detachHint: "メモ先頭のタグ欄から外します",
    previewLabel: "タグ",
    readOnlyBadge: "閲覧のみ",
    builtinNote: "アプリ付属メモ（閲覧のみ）",
  },

  settings: {
    unsaved: "未保存の変更があります。「保存」で反映されます。",
    notesDirPlaceholder: "例: zen-memo-notes",
    notesDirHint: "メモを保存するフォルダです。相対パスの場合は「ドキュメント」配下になります。",
    tagListTitle: "よく使うタグ",
    tagListHint:
      "編集画面のタグボタンに表示されます。一覧から外しても、すでに付いているメモのタグは残ります。",
    tagAddPlaceholder: "例: 会議",
    tagRemoveHint: "一覧から外す（メモのタグは残る）",
    tagEmpty: "タグがありません",
    orphanTitle: "メモだけで使われているタグ",
    orphanHint:
      "タグ一覧にないタグが、一部のメモで使われています。一覧に追加するか、すべてのメモから外せます。",
    orphanAdd: "一覧に追加",
    orphanRemove: "すべてのメモから外す",
    orphanCount: (n: number) => `${n} 件のメモ`,
    replaceTitle: "タグの一括置換",
    replaceHint:
      "すべてのメモ先頭にあるタグを一括で置き換えます。大文字・小文字は区別しません。受信箱タグとアプリ用タグは対象外です。",
    replaceFrom: "変更前",
    replaceTo: "変更後",
    replaceFromPlaceholder: "例: 勉強",
    replaceToPlaceholder: "例: 学習",
    replaceButton: "一括置換",
    themeSystem: "システムに合わせる",
  },

  sidebar: {
    appName: "メモ",
    newMemo: "新規メモ",
    manager: "一覧管理",
    settings: "設定",
    searchPlaceholder: "メモを検索…",
    pinned: "ピン留め",
    recent: "最近",
    recentCollapse: "最近を折りたたむ",
    recentExpand: "最近を展開",
    searchResults: "検索結果",
    empty: "なし",
    lineHit: (line: number, text: string) => `${line} 行目: ${text}`,
  },

  editor: {
    editorTitle: "編集",
    previewTitle: "プレビュー",
    previewOnly: "プレビューのみ",
    editMode: "編集する",
    zoomOut: "文字を小さく",
    zoomIn: "文字を大きく",
    deleteNote: "このメモを削除",
    deleteNoteDisabled: "未保存のメモは削除できません",
    openInNewWindow: "別ウィンドウで開く",
    presentInBrowser: "ブラウザで提示…",
    placeholder: "メモを入力…",
    tagsBar: "タグ",
    tagsNone: "（なし）",
    lineCount: (n: number) => `${n} 行`,
  },

  presentation: {
    active: (fileName: string) => `提示中: ${fileName}`,
    startDialogTitle: "ブラウザで提示",
    startDialogBody: (fileName: string) =>
      `「${fileName}」を別タブで提示します。他のメモは別タブで共有できます。`,
    startConfirmButton: "提示を開始",
    startCancel: "キャンセル",
    realtimeLabel: "リアルタイム同期",
    realtimeHint:
      "オンにすると、提示中メモを編集した内容が自動でブラウザへ反映されます。オフのときは「ブラウザを更新」でのみ反映します。",
    realtimeToggle: "リアルタイム",
    realtimeOnBadge: "同期オン",
    realtimeOffBadge: "同期オフ",
    realtimeEnable: "リアルタイム同期をオンにする",
    realtimeDisable: "リアルタイム同期をオフにする",
    realtimeEnabled: "リアルタイム同期をオンにしました",
    realtimeDisabled: "リアルタイム同期をオフにしました",
    pushUpdate: "ブラウザを更新",
    pushUpdateHint: "いまの提示内容をブラウザへ手動で反映します",
    copyUrl: "URL をコピー",
    end: "提示を終了",
    started: "ブラウザで提示を開始しました",
    reopened: "ブラウザの提示タブを開きました",
    ended: "提示を終了しました",
    updated: "ブラウザに反映しました",
    urlCopied: "URL をコピーしました",
    copyFailed: "URL をコピーできませんでした",
    startFailed: (detail: string) => `提示を開始できませんでした: ${detail}`,
    updateFailed: (detail: string) => `ブラウザを更新できませんでした: ${detail}`,
    endFailed: (detail: string) => `提示を終了できませんでした: ${detail}`,
    realtimeFailed: (detail: string) => `リアルタイム同期の切替に失敗しました: ${detail}`,
  },

  manager: {
    title: "メモ一覧管理",
    searchPlaceholder: "タイトル・内容で検索",
    maxCharsPlaceholder: "最大文字数（例: 100）",
    selectAll: "表示中を全選択",
    clearSelection: "選択解除",
    close: "閉じる",
    deleteSelected: (n: number) => `選択を削除 (${n})`,
    empty: "条件に一致するメモはありません",
    charCount: (n: number) => `${n} 文字`,
    emptyPreview: "（空のメモ）",
  },

  overlay: {
    loading: "読み込み中…",
  },

  contextMenu: {
    pin: "ピン留め",
    unpin: "ピン留めを解除",
    delete: "削除",
    openInNewWindow: "別ウィンドウで開く",
  },

  aria: {
    builtinNote: "アプリ付属メモ",
  },
} as const;
