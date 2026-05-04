import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

function App() {
  const [input, setInput] = useState("");
  // 保存先パスは ref に保持。直列キューと組み合わせないと、invoke が重なったときに
  // まだ ref が null のままの保存が先に走り、毎回「新規ファイル」分岐になる。
  const currentPathRef = useRef<string | null>(null);
  const saveChainRef = useRef(Promise.resolve());

  // 自動保存の仕組み
  useEffect(() => {
    // 入力が空の時は保存しない
    if (!input) return;

    // 0.5秒間操作が止まったら保存を実行（デバウンス）
    const timer = setTimeout(() => {
      const snapshot = input;
      saveChainRef.current = saveChainRef.current
        .then(async () => {
          // Tauri の IPC は引数を camelCase で渡す（currentPath → Rust の current_path）
          const args: { content: string; currentPath?: string } = { content: snapshot };
          const p = currentPathRef.current;
          if (p != null && p !== "") {
            args.currentPath = p;
          }
          const savedPath = await invoke<string>("save_note", args);
          console.log("Saved to:", savedPath);
          currentPathRef.current = savedPath;
        })
        .catch((err) => {
          console.error("[save_note]", err);
        });
    }, 500);

    return () => clearTimeout(timer); // 次の入力があったらタイマーをリセット
  }, [input]);

  const createNew = () => {
    setInput("");
    currentPathRef.current = null;
    saveChainRef.current = Promise.resolve();
  };

  return (
    <div className="container" style={{ display: "flex", height: "100vh", flexDirection: "column" }}>
      <div style={{ padding: "8px 12px", borderBottom: "1px solid #ddd", display: "flex", alignItems: "center", gap: "8px" }}>
        <button type="button" onClick={createNew}>
          新規メモ
        </button>
      </div>
      <div style={{ display: "flex", flex: 1, minHeight: 0, flexDirection: "row" }}>
        {/* 左側：エディタ */}
        <textarea
          style={{ width: "50%", height: "100%", padding: "20px", fontSize: "16px" }}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="ここにメモを入力..."
        />

        {/* 右側：プレビュー（一旦はただのテキスト表示） */}
        <div style={{ width: "50%", padding: "20px", background: "#f9f9f9", overflowY: "auto" }}>
          <h2 style={{ fontSize: "1.2rem", color: "#666" }}>Preview</h2>
          <div style={{ whiteSpace: "pre-wrap" }}>{input}</div>
        </div>
      </div>
    </div>
  );
}

export default App;