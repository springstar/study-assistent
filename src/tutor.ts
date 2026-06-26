import { readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { Agent, type AgentMessage } from "@earendil-works/pi-agent-core";
import type { ImageContent } from "@earendil-works/pi-ai";
import { TUTOR_MODEL, ROOT, model, getApiKey } from "./config.ts";
import { SUBJECTS } from "./subjects.ts";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/** 读图片文件 → base64 ImageContent（vision 直接读题，含公式/图形） */
export function loadImage(path: string): ImageContent {
  const mimeType = MIME[extname(path).toLowerCase()];
  if (!mimeType) throw new Error(`不支持的图片类型：${path}（支持 png/jpg/webp/gif）`);
  return { type: "image", data: readFileSync(path).toString("base64"), mimeType };
}

/** 从 assistant/user 消息里抽纯文本 */
export function textOf(msg: AgentMessage | undefined): string {
  if (!msg) return "";
  const content = (msg as any).content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((c: any) => c.type === "text")
    .map((c: any) => c.text)
    .join("");
}

export type SimpleTurn = { role: "student" | "assistant"; content: string; ts?: number };

/** 把 DB turns（role/content 字符串）重建为 pi-ai Message[]，灌进 Agent.state.messages 让它"记住"历史。
 *  AssistantMessage 需补齐 api/provider/usage/stopReason 等字段（用占位值，convertToLlm 只看 role/content）。 */
export function buildMessagesFromTurns(turns: SimpleTurn[]): any[] {
  return turns.map((t) => {
    if (t.role === "student") {
      return { role: "user", content: t.content, timestamp: t.ts ?? Date.now() };
    }
    return {
      role: "assistant",
      content: [{ type: "text", text: t.content }],
      api: "anthropic-messages",
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: "end_turn",
      timestamp: t.ts ?? Date.now(),
    };
  });
}

/** 按科目加载对应 skill 作 systemPrompt 建 Tutor。流式输出不在这里绑定——由 ask 的 onDelta 注入。 */
export function createTutor(subject: string): Agent {
  const cfg = SUBJECTS[subject];
  if (!cfg) throw new Error(`未支持的科目：${subject}`);
  const systemPrompt = readFileSync(join(ROOT, "skills", cfg.skillDir, "SKILL.md"), "utf8");
  return new Agent({
    initialState: { systemPrompt, model: model(TUTOR_MODEL) },
    getApiKey,
  });
}

export type AskOpts = { images?: ImageContent[]; onDelta?: (delta: string) => void };

/** 发一条 prompt（可带图片），等 Tutor 跑完，返回这一轮的助理回复全文。
 * onDelta 存在时本次调用临时订阅 text_delta 推给它（CLI→stdout、服务→SSE）。
 * 出错（网络/服务）时回滚这一轮并抛出，便于调用方提示重试而不污染对话。 */
export async function ask(agent: Agent, text: string, opts: AskOpts = {}): Promise<string> {
  const { images, onDelta } = opts;
  const before = agent.state.messages.length;
  let unsub: (() => void) | undefined;
  if (onDelta) {
    unsub = agent.subscribe((event) => {
      if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
        onDelta(event.assistantMessageEvent.delta);
      }
    });
  }
  try {
    await agent.prompt(text, images);
  } finally {
    unsub?.();
  }
  const last = agent.state.messages.at(-1);
  const reply = textOf(last);
  if ((last as any)?.stopReason === "error" || !reply.trim()) {
    agent.state.messages = agent.state.messages.slice(0, before); // 回滚，保持可重试
    throw new Error(agent.state.errorMessage || "助理无响应（网络或服务问题）");
  }
  return reply;
}
