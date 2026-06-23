import { EVAL_MODEL, model } from "./config.ts";
import { completeWithRetry } from "./llm.ts";

export type Verdict = {
  understood: boolean;
  confidence: number;
  gaps: string[];
  reason: string;
};

export type Turn = { role: "student" | "assistant"; content: string };

const SYSTEM = `你是数学辅导的理解度评估员，与授课老师相互独立——你没有"推进对话"的动机，只客观判断学生是否真懂。
依据：学生能否复述解题思路、逻辑是否完整、能否应用，而非是否说了正确关键词。
只输出严格 JSON，不要任何额外文字、不要 markdown 代码块：
{"understood": boolean, "confidence": 0到1的数, "gaps": [还缺哪一步或哪个概念的字符串数组], "reason": "一句话理由"}`;

function buildPrompt(transcript: Turn[]): string {
  const dialog = transcript
    .map((t) => `${t.role === "student" ? "学生" : "老师"}：${t.content}`)
    .join("\n");
  return `以下是辅导对话记录。判断学生此刻对这道题的理解程度。\n\n${dialog}\n\n只返回 JSON。`;
}

export function parseVerdict(text: string): Verdict | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const o = JSON.parse(match[0]);
    if (
      typeof o.understood === "boolean" &&
      typeof o.confidence === "number" &&
      Array.isArray(o.gaps) &&
      typeof o.reason === "string"
    ) {
      return o as Verdict;
    }
  } catch {
    // fall through
  }
  return null;
}

function textOf(msg: any): string {
  const c = msg?.content;
  if (typeof c === "string") return c;
  if (!Array.isArray(c)) return "";
  return c.filter((x: any) => x.type === "text").map((x: any) => x.text).join("");
}

export async function evaluate(transcript: Turn[]): Promise<Verdict> {
  const m = model(EVAL_MODEL);
  const context = {
    systemPrompt: SYSTEM,
    messages: [{ role: "user" as const, content: buildPrompt(transcript), timestamp: Date.now() }],
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await completeWithRetry(m, context);
    const verdict = parseVerdict(textOf(res));
    if (verdict) return verdict;
  }
  // 两次都解析失败：保守默认，绝不误判为已理解
  return { understood: false, confidence: 0, gaps: ["评估解析失败"], reason: "Evaluator 返回非法 JSON" };
}
