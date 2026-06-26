// 后端 API 封装 + SSE 流读取
import type { Spec } from "./spec.ts";

export type Verdict = { understood: boolean; confidence: number; gaps: string[]; reason: string };

async function postJson(path: string, body: unknown) {
  const r = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

export const getSubjects = (): Promise<{ subjects: string[] }> => fetch("/api/subjects").then((r) => r.json());
export const getStatus = (): Promise<{ tutor: string; evaluator: string }> =>
  fetch("/api/status").then((r) => r.json());
export const createSession = (subject: string): Promise<{ sessionId: string; subject: string }> =>
  postJson("/api/session", { subject });
export const loadSession = (
  sessionId: string,
): Promise<{ sessionId: string; subject: string; turns: { role: "student" | "assistant"; content: string }[] }> =>
  postJson("/api/session/load", { sessionId });
export const archive = (sessionId: string) => postJson("/api/archive", { sessionId });
export const fetchMistakes = (q: { type?: string; due?: boolean; unmastered?: boolean }) => {
  const p = new URLSearchParams();
  if (q.type) p.set("type", q.type);
  if (q.due) p.set("due", "1");
  if (q.unmastered) p.set("unmastered", "1");
  return fetch(`/api/mistakes?${p}`).then((r) => r.json());
};
export const reviewDue = () => fetch("/api/review/due").then((r) => r.json());
export const reviewStart = (mistakeId: string) => postJson("/api/review/start", { mistakeId });
export const reviewGrade = (sessionId: string, mistakeId: string) =>
  postJson("/api/review/grade", { sessionId, mistakeId });
export const listSessions = () => fetch("/api/sessions").then((r) => r.json());
export const getSessionTurns = (id: string) =>
  fetch(`/api/session/${encodeURIComponent(id)}`).then((r) => r.json());

export type StreamHandlers = {
  onDelta?: (text: string) => void;
  onVerdict?: (v: Verdict) => void;
  onSpec?: (s: Spec) => void;
  onError?: (msg: string) => void;
};

/** POST 一条消息，读 SSE 流，分派事件，返回完整回复。
 * 带空闲超时：流长时间无数据（LLM/服务挂起）则中止，避免输入框永久蒙灰。 */
export async function streamMessage(
  path: string,
  body: unknown,
  h: StreamHandlers,
): Promise<string> {
  const ctrl = new AbortController();
  const IDLE_MS = 60000; // 单次 read 60s 无数据视为挂起
  let timer: ReturnType<typeof setTimeout> | undefined;
  const reset = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => ctrl.abort(), IDLE_MS);
  };
  reset();

  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e) {
    if (timer) clearTimeout(timer);
    h.onError?.((e as Error).name === "AbortError" ? "响应超时，请重发" : (e as Error).message);
    return "";
  }
  if (!res.body) {
    if (timer) clearTimeout(timer);
    throw new Error("无响应流");
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let reply = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      reset(); // 收到任意数据，重置空闲计时
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        const chunk = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const ev = /^event: (.*)$/m.exec(chunk)?.[1];
        const dataStr = /^data: (.*)$/m.exec(chunk)?.[1];
        if (!ev || dataStr === undefined) continue;
        const data = JSON.parse(dataStr);
        if (ev === "delta") {
          reply += data.text;
          h.onDelta?.(data.text);
        } else if (ev === "verdict") h.onVerdict?.(data);
        else if (ev === "spec") h.onSpec?.(data);
        else if (ev === "error") h.onError?.(data.message);
        else if (ev === "done" && data.reply) reply = data.reply;
      }
    }
  } catch (e) {
    // 中止/网络断开：若已有部分回复就当成功返回，否则报错
    if (!reply) h.onError?.((e as Error).name === "AbortError" ? "响应超时，请重发" : "连接中断");
  } finally {
    if (timer) clearTimeout(timer);
    try {
      reader.releaseLock();
    } catch {
      // 已锁/已关，忽略
    }
  }
  return reply;
}
