import { messages } from "@/lib/messages";

type AppErrorPayload = {
  code: string;
  detail?: string;
};

type ErrorMessage = string | ((detail?: string) => string);

function parsePayload(raw: unknown): AppErrorPayload {
  const text = raw instanceof Error ? raw.message : String(raw);
  try {
    const parsed = JSON.parse(text) as Partial<AppErrorPayload>;
    if (parsed && typeof parsed.code === "string") {
      return { code: parsed.code, detail: parsed.detail };
    }
  } catch {
    /* plain code or legacy text */
  }
  if (/^[a-z][a-z0-9_]*$/.test(text)) {
    return { code: text };
  }
  return { code: "unknown", detail: text };
}

/** Rust コマンドの Err 文字列（エラーコード）をユーザー向け文言に変換する */
export function formatAppError(raw: unknown): string {
  const payload = parsePayload(raw);
  const entry = messages.errors[payload.code as keyof typeof messages.errors] as
    | ErrorMessage
    | undefined;
  if (entry) {
    return typeof entry === "function" ? entry(payload.detail) : entry;
  }
  return messages.errors.unknown(payload.detail);
}
