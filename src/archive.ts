import { EVAL_MODEL, model } from "./config.ts";
import { completeWithRetry } from "./llm.ts";
import { SUBJECTS } from "./subjects.ts";
import type { Turn, Verdict } from "./evaluator.ts";

export type MistakeFields = {
  coreAbility: string;
  problemType: string;
  blockPoint: string;
  summary: string;
  keySteps: string;
  solution: string;
};

/** 用一次独立 LLM 调用把对话提炼成错题字段。用标签行格式而非 JSON——数学/LaTeX 内容会破坏 JSON 转义 */
export async function summarizeMistake(transcript: Turn[], subject: string): Promise<MistakeFields> {
  const types = SUBJECTS[subject].problemTypes.join("/");
  const dialog = transcript.map((t) => `${t.role === "student" ? "学生" : "老师"}：${t.content}`).join("\n");
  const context = {
    systemPrompt:
      `把以下${subject}辅导对话提炼成错题档案。严格按下面 6 行格式输出，每项一行，冒号后写内容，不要 markdown、不要多余文字：\n` +
      `核心能力: (抽象/逻辑推理/建模/运算 之一)\n` +
      `题型: (${types} 之一)\n` +
      `卡点: (学生具体卡在哪个环节)\n` +
      `概述: (题目与关键难点，一句话)\n` +
      `关键步骤: (解题骨架，关键转折，一行写完)\n` +
      `解法: (最终解法要点，一行写完)`,
    messages: [{ role: "user" as const, content: dialog, timestamp: Date.now() }],
  };
  const res = await completeWithRetry(model(EVAL_MODEL), context);
  const text = (res.content as any[]).filter((c) => c.type === "text").map((c) => c.text).join("");
  const grab = (label: string): string => {
    const m = text.match(new RegExp(`^\\s*${label}\\s*[:：]\\s*(.+)$`, "m"));
    return m ? m[1].trim() : "";
  };
  return {
    coreAbility: grab("核心能力"),
    problemType: grab("题型"),
    blockPoint: grab("卡点"),
    summary: grab("概述"),
    keySteps: grab("关键步骤"),
    solution: grab("解法"),
  };
}

/** Evaluator 判定 → SM-2 质量分（0..5）。由裁判判定，不让学生自评，防作弊 */
export function toQuality(v: Verdict | null): number {
  if (!v) return 2; // 没产生有效判定
  if (!v.understood) return v.confidence >= 0.4 ? 2 : 1;
  if (v.confidence >= 0.85) return 5;
  if (v.confidence >= 0.7) return 4;
  return 3;
}
