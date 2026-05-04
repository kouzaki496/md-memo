/**
 * Tauri の beforeDev / beforeBuild から npm を起動するとき、子プロセスの PATH だけが
 * fnm 等の古い node 先頭になることがある。nvm-windows の実体パスを先頭に足してから npm を実行する。
 * 起動に使う node（PATH 上の最初の node）が古くても、ここは spawn の env だけ補正すればよい。
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const task = process.argv[2];
if (task !== "dev" && task !== "build") {
  console.error("usage: node scripts/tauri-npm.mjs <dev|build>");
  process.exit(1);
}

function readNvmrcVersion() {
  const p = path.join(root, ".nvmrc");
  if (!fs.existsSync(p)) return "22.22.2";
  return fs.readFileSync(p, "utf8").trim().replace(/^v/, "") || "22.22.2";
}

function prependNvmToPath(env) {
  const ver = readNvmrcVersion();
  const home = os.homedir();
  const paths = [];

  if (process.platform === "win32") {
    const dir = path.join(home, "AppData", "Roaming", "nvm", `v${ver}`);
    const exe = path.join(dir, "node.exe");
    if (fs.existsSync(exe)) paths.push(dir);
  } else {
    const bin = path.join(home, ".nvm", "versions", "node", `v${ver}`, "bin");
    const exe = path.join(bin, "node");
    if (fs.existsSync(exe)) paths.push(bin);
  }

  if (paths.length === 0) return env;

  const extra = paths.join(path.delimiter);
  const cur = env.PATH ?? env.Path ?? "";
  const merged = `${extra}${path.delimiter}${cur}`;
  if (process.platform === "win32") {
    return { ...env, PATH: merged, Path: merged };
  }
  return { ...env, PATH: merged };
}

const env = prependNvmToPath({ ...process.env });
const child = spawn("npm", ["run", task], {
  cwd: root,
  env,
  shell: true,
  stdio: "inherit",
  windowsHide: true,
});

child.on("exit", (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 0);
});
