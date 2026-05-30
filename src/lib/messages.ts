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
    builtinReadOnly: "このメモは閲覧専用です",
    builtinNoDelete: "このメモは削除できません",
    builtinNoUnpin: "このメモはピン留め解除できません",
    shortcutMemoFailed:
      "ショートカット説明メモを作成できませんでした。保存先フォルダの権限を確認してください",
  },

  confirm: {
    deleteNote: (title: string) => `「${title}」を削除しますか？`,
    deleteSelected: (n: number) => `選択した ${n} 件を削除しますか？`,
    settingsDiscard: "設定の変更が保存されていません。保存せず続けますか？",
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
    notesDirPlaceholder: "例: scriptax-notes",
    notesDirHint:
      "メモを保存するフォルダです。「フォルダを選ぶ」で任意の場所を指定できます。相対パス（フォルダ名のみ）の場合は「ドキュメント」配下になります。変更後は既存メモは移動されません。",
    notesDirBrowse: "フォルダを選ぶ",
    notesDirBrowseTitle: "メモの保存先フォルダ",
    notesDirOpen: "フォルダを開く",
    notesDirResolved: (path: string) => `実際の保存先: ${path}`,
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

  firstRun: {
    title: "メモの保存先を選んでください",
    body: "Markdown メモを保存するフォルダを指定します。あとから設定画面でも変更できます。",
    notesDirLabel: "保存先フォルダ",
    notesDirHint:
      "フォルダ名だけ（例: scriptax-notes）を指定すると「ドキュメント」配下に作られます。存在しない場合は自動作成されます。",
    useDefault: (name: string) => `デフォルト（${name}）に戻す`,
    confirm: "この保存先で始める",
    confirming: "設定中…",
    completed: "保存先を設定しました",
  },

  sidebar: {
    appName: "Scriptax",
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
    presenting: "ブラウザ提示中",
    presentingOpenTab: "ブラウザで表示",
    presentingOpenNote: "メモを開く",
    presentingCount: (n: number) => `${n} 件`,
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
    insertImage: "画像を挿入",
    imageFilterName: "画像",
    imageInsertFailed: "画像を挿入できませんでした",
    imageDropHint: "ここに画像をドロップ",
    imageMissing: "画像が見つかりません",
    imageLoading: "画像を読み込み中",
    placeholder: "Markdown を入力…",
    tagsBar: "タグ",
    tagsNone: "（なし）",
    lineCount: (n: number) => `${n} 行`,
  },

  presentation: {
    active: (fileName: string) => `提示中: ${fileName}`,
    startDialogTitle: "ブラウザで提示",
    startDialogBody: (fileName: string) =>
      `「${fileName}」を提示します。ブラウザは共通の 1 タブで表示され、アプリでメモを切り替えると内容も切り替わります。`,
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
    displaySwitched: (fileName: string) => `ブラウザ表示を「${fileName}」に切り替えました`,
    viewingUnpresented: (label: string) =>
      `ブラウザで ${label} を提示中です。編集中のメモは提示されていません`,
    openPresentedMemo: "提示中のメモを開く",
    ended: "提示を終了しました",
    updated: "ブラウザに反映しました",
    urlCopied: "URL をコピーしました",
    copyFailed: "URL をコピーできませんでした",
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

  /** Rust `app_error` コード → ユーザー向け文言 */
  errors: {
    notes_dir_empty: "保存先フォルダが未設定です",
    notes_dir_required: "保存先フォルダを入力してください",
    notes_dir_open_failed: (detail?: string) =>
      detail ? `フォルダを開けませんでした: ${detail}` : "フォルダを開けませんでした",
    notes_dir_resolve_failed: (detail?: string) =>
      detail ? `保存先フォルダを解決できませんでした: ${detail}` : "保存先フォルダを解決できませんでした",
    notes_dir_create_failed: (detail?: string) =>
      detail ? `保存先フォルダを作成できませんでした: ${detail}` : "保存先フォルダを作成できませんでした",
    config_save_failed: (detail?: string) =>
      detail ? `設定を保存できませんでした: ${detail}` : "設定を保存できませんでした",

    note_not_found: (path?: string) =>
      path
        ? `メモが見つかりません（別PCでは「ドキュメント」内のメモフォルダをコピーするか、設定で保存先を合わせてください）: ${path}`
        : "メモが見つかりません",
    note_read_failed: (detail?: string) =>
      detail ? `メモを読み込めませんでした: ${detail}` : "メモを読み込めませんでした",
    note_path_empty: "メモのパスが空です",
    save_path_invalid: "保存先パスが不正です（ファイル名がありません）",
    builtin_note_no_delete: "このメモは削除できません（アプリ付属のメモです）",
    builtin_note_no_unpin: "このメモはピン留め解除できません（アプリ付属のメモです）",
    builtin_note_read_only: "このメモは編集できません（閲覧専用です）",
    note_window_open_failed: (detail?: string) =>
      detail ? `別ウィンドウを開けませんでした: ${detail}` : "別ウィンドウを開けませんでした",
    file_name_empty: "ファイル名が空です",
    file_name_invalid: "ファイル名にパス区切り文字は使えません",
    file_write_failed: (detail?: string) =>
      detail ? `ファイルを保存できませんでした: ${detail}` : "ファイルを保存できませんでした",
    file_delete_failed: (detail?: string) =>
      detail ? `ファイルを削除できませんでした: ${detail}` : "ファイルを削除できませんでした",

    tag_replace_from_empty: "置換元のタグを入力してください",
    tag_replace_to_empty: "置換先のタグを入力してください",
    tag_replace_from_reserved: "アプリ用タグは一括置換できません",
    tag_replace_to_reserved: "アプリ用タグには置換できません",
    tag_remove_empty: "削除するタグを入力してください",
    tag_remove_inbox: "「受信箱」タグは外せません",
    tag_remove_reserved: "アプリ用タグは外せません",

    presentation_server_start_failed: (detail?: string) =>
      detail ? `提示用サーバーを起動できません: ${detail}` : "提示用サーバーを起動できません",
    presentation_port_unavailable: (detail?: string) =>
      detail ?? "提示用ポートが見つかりませんでした",
    presentation_session_not_started: "このメモの提示セッションが開始されていません",
    presentation_already_ended: "提示はすでに終了しています",
    browser_open_failed: (detail?: string) =>
      detail ? `ブラウザを開けませんでした: ${detail}` : "ブラウザを開けませんでした",
    invalid_theme_mode: (detail?: string) =>
      detail ? `不正なテーマ設定です: ${detail}` : "不正なテーマ設定です",
    invalid_theme_preset: (detail?: string) =>
      detail ? `不正なテーマプリセットです: ${detail}` : "不正なテーマプリセットです",

    attachment_empty: "画像データが空です",
    attachment_save_failed: (detail?: string) =>
      detail ? `画像を保存できませんでした: ${detail}` : "画像を保存できませんでした",
    attachment_import_failed: (detail?: string) =>
      detail ? `画像を読み込めませんでした: ${detail}` : "画像を読み込めませんでした",
    attachment_path_invalid: "画像パスが不正です",
    attachment_not_found: "画像が見つかりません",
    attachment_read_failed: (detail?: string) =>
      detail ? `画像を読み込めませんでした: ${detail}` : "画像を読み込めませんでした",

    internal_lock_failed: (detail?: string) =>
      detail ? `内部エラーが発生しました: ${detail}` : "内部エラーが発生しました",
    unknown: (detail?: string) => (detail ? `エラー: ${detail}` : "エラーが発生しました"),
  },
} as const;
