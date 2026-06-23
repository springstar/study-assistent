import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { Agent, type AgentMessage } from "@earendil-works/pi-agent-core";
import type { ImageContent } from "@earendil-works/pi-ai";
import { SKILL_PATH, TUTOR_MODEL, model, getApiKey } from "./config.ts";

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

export function createTutor(): Agent {
  const systemPrompt = readFileSync(SKILL_PATH, "utf8");
  const agent = new Agent({
    initialState: { systemPrompt, model: model(TUTOR_MODEL) },
    getApiKey,
  });
  // 流式打印助理输出
  agent.subscribe((event) => {
    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
      process.stdout.write(event.assistantMessageEvent.delta);
    }
  });
  return agent;
}

/** 发一条 prompt（可带图片），等 Tutor 跑完，返回这一轮的助理回复全文。
 * 出错（网络/服务）时回滚这一轮并抛出，便于调用方提示重试而不污染对话。 */
export async function ask(agent: Agent, text: string, images?: ImageContent[]): Promise<string> {
  const before = agent.state.messages.length;
  await agent.prompt(text, images);
  const last = agent.state.messages.at(-1);
  const reply = textOf(last);
  if ((last as any)?.stopReason === "error" || !reply.trim()) {
    agent.state.messages = agent.state.messages.slice(0, before); // 回滚，保持可重试
    throw new Error(agent.state.errorMessage || "助理无响应（网络或服务问题）");
  }
  return reply;
}
