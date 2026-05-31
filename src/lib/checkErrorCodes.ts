import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** FE のみ（Rust から返さないフォールバック） */
export const FE_ONLY_ERROR_CODES = new Set(["unknown"]);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const RUST_PATH = path.join(root, "src-tauri/src/app_error.rs");
const MESSAGES_PATH = path.join(root, "src/lib/messages.ts");

export function parseRustErrorCodes(source: string): string[] {
  const codes: string[] = [];
  const re = /pub const \w+: &str = "([a-z][a-z0-9_]*)";/g;
  for (const match of source.matchAll(re)) {
    codes.push(match[1]);
  }
  return [...new Set(codes)].sort();
}

export function parseFeErrorCodes(source: string): string[] {
  const blockMatch = source.match(/errors:\s*\{([\s\S]*?)\n  \},/);
  if (!blockMatch) {
    throw new Error("messages.ts: errors ブロックが見つかりません");
  }
  const keys: string[] = [];
  const re = /^\s{4}([a-z][a-z0-9_]*):/gm;
  for (const match of blockMatch[1].matchAll(re)) {
    keys.push(match[1]);
  }
  return [...new Set(keys)].sort();
}

export type ErrorCodeSyncResult = {
  rust: string[];
  fe: string[];
  missingInFe: string[];
  missingInRust: string[];
};

export function checkErrorCodes(
  rustSource = readFileSync(RUST_PATH, "utf8"),
  messagesSource = readFileSync(MESSAGES_PATH, "utf8")
): ErrorCodeSyncResult {
  const rust = parseRustErrorCodes(rustSource);
  const fe = parseFeErrorCodes(messagesSource);

  const rustSet = new Set(rust);
  const feSet = new Set(fe);

  const missingInFe = rust.filter((code) => !feSet.has(code));
  const missingInRust = fe.filter((code) => !FE_ONLY_ERROR_CODES.has(code) && !rustSet.has(code));

  return { rust, fe, missingInFe, missingInRust };
}

export function formatErrorCodeSyncFailure(result: ErrorCodeSyncResult): string {
  const lines = ["app_error.rs ↔ messages.errors の不一致:"];
  if (result.missingInFe.length > 0) {
    lines.push(`  Rust にあって FE にない: ${result.missingInFe.join(", ")}`);
  }
  if (result.missingInRust.length > 0) {
    lines.push(`  FE にあって Rust にない: ${result.missingInRust.join(", ")}`);
  }
  lines.push(
    `  Rust: ${result.rust.length}  FE: ${result.fe.length} (unknown 除く ${result.fe.length - FE_ONLY_ERROR_CODES.size})`
  );
  return lines.join("\n");
}
