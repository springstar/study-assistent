import type { ImageContent } from "@earendil-works/pi-ai";
import { EVAL_MODEL, model } from "./config.ts";
import { completeWithRetry } from "./llm.ts";

// 与 viewer/src/spec.ts 保持一致（两个包，无共享构建，故镜像一份）
export type SolidKind = "cube" | "pyramid" | "prism" | "sphere";
export type Spec =
  | { kind: "solid"; solid: SolidKind; size?: number; label?: string }
  | { kind: "function"; expr: string; domain: [number, number]; tangentAt?: number; label?: string };

const SOLIDS: SolidKind[] = ["cube", "pyramid", "prism", "sphere"];

const SYSTEM = `判断这道数学题是否适合几何可视化，输出严格 JSON（无 markdown、无多余文字）：
- 立体几何（正方体/长方体→cube，棱锥→pyramid，棱柱→prism，球→sphere）：
  {"kind":"solid","solid":"cube|pyramid|prism|sphere"}
- 含具体一元函数 f(x)（求导/单调/最值/图像）：
  {"kind":"function","expr":"用 x 写的表达式，只用 + - * / ^ 和 sin cos tan sqrt abs exp log，如 x^3-3*x+1","domain":[下界,上界],"tangentAt":可选的切点x}
- 其余（数列/概率/纯代数/新定义等不适合上面两类的）：
  {"kind":"none"}
只输出一个 JSON 对象。`;

function valid(o: any): o is Spec {
  if (o?.kind === "solid") return SOLIDS.includes(o.solid);
  if (o?.kind === "function") {
    return typeof o.expr === "string" && Array.isArray(o.domain) && o.domain.length === 2 &&
      o.domain.every((n: any) => typeof n === "number");
  }
  return false;
}

function textOf(msg: any): string {
  const c = msg?.content;
  if (typeof c === "string") return c;
  if (!Array.isArray(c)) return "";
  return c.filter((x: any) => x.type === "text").map((x: any) => x.text).join("");
}

/** 让 LLM 判断题目是否可可视化，返回 Spec 或 null（不可视化/解析失败） */
export async function genSpec(problemText: string, images?: ImageContent[]): Promise<Spec | null> {
  const text = problemText || "（题目在图片中）";
  const content = images?.length
    ? [{ type: "text" as const, text }, ...images]
    : text;
  const context = {
    systemPrompt: SYSTEM,
    messages: [{ role: "user" as const, content, timestamp: Date.now() }],
  };
  try {
    const res = await completeWithRetry(model(EVAL_MODEL), context);
    const m = textOf(res).match(/\{[\s\S]*\}/);
    if (!m) return null;
    const o = JSON.parse(m[0]);
    return valid(o) ? o : null;
  } catch {
    return null;
  }
}
