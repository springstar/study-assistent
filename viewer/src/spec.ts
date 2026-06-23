// 几何可视化的 spec —— 由题型驱动（立体几何 / 函数图）。
// 未来可由 Tutor 输出此 JSON，前端渲染。
export type SolidKind = "cube" | "pyramid" | "prism" | "sphere";

export type Spec =
  | { kind: "solid"; solid: SolidKind; size?: number; label?: string }
  | {
      kind: "function";
      expr: string; // 关于 x 的表达式，如 "x^3 - 3*x + 1"
      domain: [number, number];
      tangentAt?: number; // 在此 x 处画切线
      label?: string;
    };
