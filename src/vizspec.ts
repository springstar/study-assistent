import type { ImageContent } from "@earendil-works/pi-ai";
import { EVAL_MODEL, model } from "./config.ts";
import { completeWithRetry } from "./llm.ts";

// 与 viewer/src/spec.ts 保持一致（两个包，无共享构建，故镜像一份）
export type SolidKind = "cube" | "pyramid" | "prism" | "sphere";
export type Force = { label: string; angleDeg: number; mag?: number };
export type EnergyPoint = { label: string; energy: number };
export type Spec =
  | { kind: "solid"; solid: SolidKind; size?: number; label?: string }
  | { kind: "function"; expr: string; domain: [number, number]; tangentAt?: number; label?: string }
  | { kind: "freebody"; object: "box" | "incline"; angle?: number; forces: Force[]; label?: string }
  | { kind: "motion"; quantity: "v" | "x" | "a"; expr: string; domain: [number, number]; label?: string }
  | { kind: "energy"; points: EnergyPoint[]; label?: string };

const SOLIDS: SolidKind[] = ["cube", "pyramid", "prism", "sphere"];

// 每个科目的可视化系统提示（描述可用 kind）
const PROMPTS: Record<string, string> = {
  数学: `判断这道数学题是否适合几何可视化，输出严格 JSON（无 markdown、无多余文字）：
- 立体几何（正方体/长方体→cube，棱锥→pyramid，棱柱→prism，球→sphere）：{"kind":"solid","solid":"cube|pyramid|prism|sphere"}
- 含**可显式画出的一元函数 f(x)**（求导/单调/最值/图像）：{"kind":"function","expr":"只用变量 x 和 + - * / ^ 及 sin cos tan sqrt abs exp log，如 x^3-3*x+1","domain":[下界,上界],"tangentAt":可选切点x}
- 其余一律 {"kind":"none"}。**特别注意：新定义题、抽象集合/映射题（如出现 D(x)、f(x_0+d)、未给出具体解析式的 f）一律 none，不要硬凑函数。**
只输出一个 JSON 对象。`,
  物理: `判断这道物理题是否适合可视化，输出严格 JSON（无 markdown、无多余文字）：
- 受力分析（斜面/物块/连接体）：{"kind":"freebody","object":"box 或 incline","angle":斜面倾角度数(incline时),"forces":[{"label":"重力 G","angleDeg":270,"mag":0.9},{"label":"支持力 N","angleDeg":...},{"label":"摩擦力 f","angleDeg":...}]}
  angleDeg：0=右,90=上,180=左,270=下；mag 相对长度0-1。把题中物体的受力都列出。
- 运动图像（匀变速/振动等，量关于时间t）：{"kind":"motion","quantity":"v 或 x 或 a","expr":"用 t 写,如 2*t 或 5-3*t","domain":[0,时间上界]}
- 其余（纯电路/抽象/无明显图）：{"kind":"none"}
只输出一个 JSON 对象。`,
  化学: `判断这道化学题是否适合可视化，输出严格 JSON（无 markdown、无多余文字）：
- 反应能量图/能垒图（反应进程-能量，含过渡态、中间体、反应热）：{"kind":"energy","points":[{"label":"反应物","energy":0},{"label":"过渡态","energy":120},{"label":"中间体","energy":40},{"label":"产物","energy":-30}]}
  按反应进程顺序列出：反应物→过渡态(能量峰)→中间体(能量谷)→...→产物；energy 为相对能量数值。
- 其余（方程式/计算/工艺流程/无明显图）：{"kind":"none"}
只输出一个 JSON 对象。`,
};

/** 表达式安全校验：编译后只允许 数字/运算符/括号/单变量(x 或 t)/Math.* 函数。
 * 挡掉 D(x)、f(x_0+d)、未定义标识符等会在前端求值时抛错的表达式。 */
function safeExpr(expr: unknown, variable: "x" | "t"): boolean {
  if (typeof expr !== "string" || !expr.trim()) return false;
  const js = expr
    .replace(/\^/g, "**")
    .replace(/\b(sin|cos|tan|asin|acos|atan|sqrt|abs|exp|log|pow|PI|E)\b/g, "M.$1");
  // 允许：数字 . 运算符 括号 逗号 空格 变量 M(占位 Math) 及函数名字母
  if (!new RegExp(`^[-+*/(),.\\s\\d${variable}M.a-z]+$`).test(js)) return false;
  // 去掉变量与 Math 函数后不应残留其它字母（即没有 D、f、未知符号）
  const stripped = js
    .replace(/M\.(sin|cos|tan|asin|acos|atan|sqrt|abs|exp|log|pow|PI|E)/g, "")
    .replace(new RegExp(variable, "g"), "");
  if (/[a-zA-Z]/.test(stripped)) return false;
  try {
    // 求值时把占位 M 还原成 Math
    const f = new Function("M", variable, `return (${js});`) as (m: typeof Math, v: number) => number;
    return Number.isFinite(f(Math, 1)) || Number.isFinite(f(Math, 2)); // 至少一个采样点有限
  } catch {
    return false;
  }
}

function valid(o: any): o is Spec {
  switch (o?.kind) {
    case "solid":
      return SOLIDS.includes(o.solid);
    case "function":
      return safeExpr(o.expr, "x") && Array.isArray(o.domain) && o.domain.length === 2 &&
        o.domain.every((n: any) => typeof n === "number");
    case "motion":
      return safeExpr(o.expr, "t") && Array.isArray(o.domain) && o.domain.length === 2 &&
        o.domain.every((n: any) => typeof n === "number");
    case "freebody":
      return (o.object === "box" || o.object === "incline") && Array.isArray(o.forces) && o.forces.length > 0 &&
        o.forces.every((f: any) => typeof f.label === "string" && typeof f.angleDeg === "number");
    case "energy":
      return Array.isArray(o.points) && o.points.length >= 2 &&
        o.points.every((p: any) => typeof p.label === "string" && typeof p.energy === "number");
    default:
      return false;
  }
}

function textOf(msg: any): string {
  const c = msg?.content;
  if (typeof c === "string") return c;
  if (!Array.isArray(c)) return "";
  return c.filter((x: any) => x.type === "text").map((x: any) => x.text).join("");
}

/** 按科目让 LLM 判断题目能否可视化，返回 Spec 或 null（不可视化/解析失败/科目无可视化） */
export async function genSpec(problemText: string, subject: string, images?: ImageContent[]): Promise<Spec | null> {
  const systemPrompt = PROMPTS[subject];
  if (!systemPrompt) return null;
  const text = problemText || "（题目在图片中）";
  const content = images?.length ? [{ type: "text" as const, text }, ...images] : text;
  const context = { systemPrompt, messages: [{ role: "user" as const, content, timestamp: Date.now() }] };
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
