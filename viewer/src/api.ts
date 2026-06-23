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
export const createSession = (subject: string): Promise<{ sessionId: string; subject: string }> =>
  postJson("/api/session", { subject });
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

/** POST 一条消息，读 SSE 流，分派事件，返回完整回复 */
export async function streamMessage(
  path: string,
  body: unknown,
  h: StreamHandlers,
): Promise<string> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.body) throw new Error("无响应流");
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let reply = "";
  for (;;) {
    const { done, value } = await reader.read();
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
  return reply;
}
