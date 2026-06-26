import type { ImageContent } from "@earendil-works/pi-ai";
import { TUTOR_MODEL, model } from "./config.ts";
import { completeWithRetry } from "./llm.ts";

// 与 viewer/src/spec.ts 保持一致（两个包，无共享构建，故镜像一份）
export type SolidKind = "cube" | "pyramid" | "prism" | "sphere";
export type Force = { label: string; angleDeg: number; mag?: number };
export type EnergyPoint = { label: string; energy: number };
export type GPoint = { label: string; pos: [number, number, number] };
export type GEdge = { from: string; to: string; hidden?: boolean };
export type GHigh = { from: string; to: string; label?: string; color?: string };
export type GFace = { points: string[]; label?: string; color?: string };
export type GMidpoint = { label: string; of: [string, string] };
export type Spec =
  | { kind: "solid"; solid: SolidKind; size?: number; label?: string }
  | { kind: "function"; expr: string; domain: [number, number]; tangentAt?: number; label?: string }
  | { kind: "freebody"; object: "box" | "incline"; angle?: number; forces: Force[]; label?: string }
  | { kind: "motion"; quantity: "v" | "x" | "a"; expr: string; domain: [number, number]; label?: string }
  | { kind: "energy"; points: EnergyPoint[]; label?: string }
  | { kind: "geometry"; points: GPoint[]; edges: GEdge[]; highlights?: GHigh[]; faces?: GFace[]; midpoints?: GMidpoint[]; label?: string };

const SOLIDS: SolidKind[] = ["cube", "pyramid", "prism", "sphere"];

// 每个科目的可视化系统提示（描述可用 kind）
const PROMPTS: Record<string, string> = {
  数学: `判断这道数学题是否适合几何可视化，输出严格 JSON（无 markdown、无多余文字）：
- 立体几何题（棱柱/棱锥/任意几何体，含顶点关系如中点/交点）：输出 geometry，含你自己推断的示意坐标。
  坐标约定（重要）：y 轴向上（棱柱竖直：底面在下 y 小，上底面在上 y 大）。底面 ABC 是水平面（A/B/C 的 y 相同），在 x、z 两个方向展开成三角形（不能共线！z 必须有变化）。
  侧棱竖直：A 与 A1 的 x、z 相同，仅 y 不同。坐标范围约 ±2。
  例：底面 ABC 等腰直角（C 是直角）→ A[1,-1,-1]、B[1,-1,1]、C[-1,-1,0]（C 在左，AB 在右，z 展开）；上底面 A1[1,1,-1]、B1[1,1,1]、C1[-1,1,0]。
  {"kind":"geometry","points":[{"label":"A","pos":[1,-1,-1]},{"label":"B","pos":[1,-1,1]},{"label":"C","pos":[-1,-1,0]},{"label":"A1","pos":[1,1,-1]},{"label":"B1","pos":[1,1,1]},{"label":"C1","pos":[-1,1,0]}],
   "edges":[{"from":"A","to":"B"},{"from":"A","to":"C","hidden":true},{"from":"B","to":"C"},{"from":"A","to":"A1"},{"from":"B","to":"B1"},{"from":"C","to":"C1"},{"from":"A1","to":"B1"},{"from":"A1","to":"C1","hidden":true},{"from":"B1","to":"C1"}],
   "highlights":[],
   "faces":[],
   "midpoints":[{"label":"D","of":["A","B"]},{"label":"E","of":["A","C1"]}]}
  midpoints 声明中点关系（label 是中点名，of 是两端点 label）；坐标由系统精确计算，points 里该点的 pos 可填占位。
  规则：① 只画**题干给定的条件**——题干提到的点（如中点 D、E）在 points 里标出位置即可；题干给定的特殊线/面才放 highlights/faces。
  ② **不要画问题/要证的内容**——如"证明 DE∥平面 BCC1B1"里的 DE 和平面 BCC1B1 不画（那是答题者要画的），保持图形整洁。
  ③ 被遮挡（后方/内部）的棱 hidden:true（虚线）。顶点 label 用题中字母（C1 写成 C1）。
  ④ **中点/分点坐标必须精确计算**：如 D 是 AB 中点，则 D 的 pos = ((Ax+Bx)/2, (Ay+By)/2, (Az+Bz)/2)，逐坐标平均，不要估。
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
    case "geometry": {
      if (!Array.isArray(o.points) || o.points.length < 3) return false;
      if (!Array.isArray(o.edges) || o.edges.length < 3) return false;
      const labels = new Set(o.points.map((p: any) => p.label));
      if (!o.points.every((p: any) => typeof p.label === "string" && Array.isArray(p.pos) && p.pos.length === 3)) return false;
      const okRef = (r: any) => typeof r === "string" && labels.has(r);
      if (!o.edges.every((e: any) => okRef(e.from) && okRef(e.to))) return false;
      if (o.highlights && !o.highlights.every((h: any) => okRef(h.from) && okRef(h.to))) return false;
      if (o.faces && !o.faces.every((f: any) => { const p = f.points || f.vertices; return Array.isArray(p) && p.every(okRef); })) return false;
      return true;
    }
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

/** 规范化棱柱坐标，保证投影后底面不共线、棱柱竖立：
 *  1) 若棱柱沿 z 躺着（顶面与底面 y 相同、z 不同），交换 y/z 让其竖直（侧棱沿 y）
 *  2) 同名顶点 A/A1 的 x、z 相同（仅 y 不同），侧棱竖直，底面/顶面形状一致 */
function normalizeGeometry(o: any): any {
  if (o.kind !== "geometry") return o;
  // 兼容 LLM 用 vertices 代替 points（faces）
  if (Array.isArray(o.faces)) {
    o.faces = o.faces.map((f: any) => ({ ...f, points: f.points || f.vertices }));
  }
  let pts: any[] = o.points;
  const base = pts.find((p) => /^[A-Z]$/.test(p.label));
  const top = base && pts.find((p) => p.label === base.label + "1");
  if (!base || !top) return o;
  // 1) 竖立：若 z 方向差大于 y，交换 y/z（侧棱改沿 y）
  const dy = Math.abs(top.pos[1] - base.pos[1]);
  const dz = Math.abs(top.pos[2] - base.pos[2]);
  if (dz > dy * 1.5) {
    pts = pts.map((p) => ({ ...p, pos: [p.pos[0], p.pos[2], p.pos[1]] }));
  }
  // 2) 顶面同名点 x/z 与底面一致（侧棱竖直）
  const basePts = new Map(pts.filter((p) => /^[A-Z]$/.test(p.label)).map((p) => [p.label, p]));
  const height = (pts.find((p) => p.label === base.label + "1")?.pos[1] ?? base.pos[1] + 1) - base.pos[1];
  pts = pts.map((p) => {
    const m = /^([A-Z])1$/.exec(p.label);
    if (m) {
      const b = basePts.get(m[1]);
      if (b) return { ...p, pos: [b.pos[0], b.pos[1] + height, b.pos[2]] };
    }
    return p;
  });
  // 按中点关系强制重算坐标（根治 LLM 把中点标错端点的问题）
  if (Array.isArray(o.midpoints)) {
    const pm = new Map(pts.map((p) => [p.label, p.pos]));
    for (const mp of o.midpoints) {
      const a = pm.get(mp.of[0]);
      const b = pm.get(mp.of[1]);
      const di = pts.findIndex((p) => p.label === mp.label);
      if (a && b && di >= 0) {
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
        pts[di] = { ...pts[di], pos: mid };
        pm.set(mp.label, mid);
      }
    }
  }
  o.points = pts;
  return o;
}

/** 按科目让 LLM 判断题目能否可视化，返回 Spec 或 null（不可视化/解析失败/科目无可视化） */
export async function genSpec(problemText: string, subject: string, images?: ImageContent[]): Promise<Spec | null> {
  const systemPrompt = PROMPTS[subject];
  if (!systemPrompt) return null;
  const text = problemText || "（题目在图片中）";
  const content = images?.length ? [{ type: "text" as const, text }, ...images] : text;
  const context = { systemPrompt, messages: [{ role: "user" as const, content, timestamp: Date.now() }] };
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await completeWithRetry(model(TUTOR_MODEL), context, { maxTokens: 2048 });
      const m = textOf(res).match(/\{[\s\S]*\}/);
      if (!m) continue;
      try {
        const o = JSON.parse(m[0]);
        if (valid(o)) return normalizeGeometry(o);
      } catch {
        // JSON 解析失败，重试
      }
    }
    return null;
  } catch {
    return null;
  }
}
