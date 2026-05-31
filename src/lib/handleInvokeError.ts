import { formatAppError } from "@/lib/appError";

/** Tauri invoke 失敗をログし、ユーザー向け文言を返す */
export function handleInvokeError(err: unknown, context?: string): string {
  if (context !== undefined) {
    console.error(context, err);
  } else {
    console.error(err);
  }
  return formatAppError(err);
}

/** ログ + ステータスバーへエラー表示 */
export function reportStatusError(
  setStatus: (message: string) => void,
  err: unknown,
  context?: string
): void {
  setStatus(handleInvokeError(err, context));
}
