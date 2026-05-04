/**
 * Vite 7 は Node 20.19+ または 22.12+ が必要（それ以外の 20.x / 22.x は不可）。
 * Git Bash でまだ Node 16 になる場合は、プロジェクト直下で nvm / fnm で切り替えてください。
 */
const v = process.version;
const m = /^v(\d+)\.(\d+)\.(\d+)/.exec(v);
if (!m) {
  console.error(`[md-memo] 想定外の Node バージョン文字列: ${v}`);
  process.exit(1);
}
const major = Number(m[1]);
const minor = Number(m[2]);

let ok = false;
if (major < 20) ok = false;
else if (major === 20) ok = minor >= 19;
else if (major === 21) ok = true;
else if (major === 22) ok = minor >= 12;
else ok = major >= 23;

if (!ok) {
  console.error("");
  console.error(`[md-memo] 現在の Node は ${v} です。Vite 7 には Node 20.19+ または 22.12+ が必要です。`);
  console.error(`[md-memo] 実行中のバイナリ: ${process.execPath}`);
  console.error("");
  console.error("Git Bash (MINGW64) で次のいずれかを実行し、再度 npm run tauri dev してください:");
  console.error("  nvm install 22 && nvm use 22");
  console.error("  または:  cd このディレクトリ  &&  nvm use   （.nvmrc があれば 22 を選択）");
  console.error("  fnm を使う場合: fnm install && fnm use");
  console.error("");
  console.error("確認: node -v が v20.19 以上、または v22.12 以上になっていること。");
  console.error("");
  process.exit(1);
}
