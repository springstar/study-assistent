import { completeSimple } from "@earendil-works/pi-ai";
import type { AssistantMessage, Context, Model } from "@earendil-works/pi-ai";

/** 通用重试：fn 抛错或结果不 ok 就退避重试。多次仍不 ok 时返回最后一次结果（让调用方降级）；
 * 若每次都抛错则抛出最后的错误。delayMs 在测试里传 0。 */
export async function retry<T>(
  fn: () => Promise<T>,
  ok: (r: T) => boolean,
  opts: { tries?: number; delayMs?: number } = {},
): Promise<T> {
  const tries = opts.tries ?? 3;
  const delay = opts.delayMs ?? 400;
  let lastResult: T | undefined;
  let got = false;
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fn();
      if (ok(r)) return r;
      lastResult = r;
      got = true;
    } catch (e) {
      lastErr = e;
    }
    if (i < tries - 1) await new Promise((res) => setTimeout(res, delay * (i + 1)));
  }
  if (got) return lastResult as T;
  throw lastErr;
}

/** completeSimple + 瞬时错误（stopReason==="error"，如 403/限流/网络抖动）重试。
 * 多次仍错则返回最后的错误响应，调用方按既有解析降级（不抛）。
 * options 可传 maxTokens 等（默认 apiKey 从 env 取）。 */
export function completeWithRetry(
  model: Model<any>,
  context: Context,
  options: { maxTokens?: number } = {},
): Promise<AssistantMessage> {
  return retry(
    () =>
      completeSimple(model, context, {
        apiKey: process.env.ANTHROPIC_API_KEY,
        ...(options.maxTokens ? { maxTokens: options.maxTokens } : {}),
      }),
    (r) => r.stopReason !== "error",
    { tries: 3 },
  );
}
