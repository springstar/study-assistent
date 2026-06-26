// 几何/物理可视化的 spec —— 由题型驱动。未来可由 Tutor 输出此 JSON，前端渲染。
export type SolidKind = "cube" | "pyramid" | "prism" | "sphere";

// 力矢量：label 标注，angleDeg 方向（0=+x 右，90=+y 上，270=向下），mag 相对长度 0-1
export type Force = { label: string; angleDeg: number; mag?: number };

// 反应能量图的能级点：按反应进程顺序，energy 为相对能量
export type EnergyPoint = { label: string; energy: number };

// 立体几何：任意几何体的顶点+棱+高亮线段+平面
export type GPoint = { label: string; pos: [number, number, number] };
export type GEdge = { from: string; to: string; hidden?: boolean }; // hidden=虚线（被遮挡）
export type GHigh = { from: string; to: string; label?: string; color?: string };
export type GFace = { points: string[]; label?: string; color?: string };

// 中点关系：D 是 from[0] 和 from[1] 的中点（坐标由代码精确算，不靠 LLM 估）
export type GMidpoint = { label: string; of: [string, string] };

export type Spec =
  | { kind: "solid"; solid: SolidKind; size?: number; label?: string }
  | { kind: "function"; expr: string; domain: [number, number]; tangentAt?: number; label?: string }
  // 物理：受力分析图
  | { kind: "freebody"; object: "box" | "incline"; angle?: number; forces: Force[]; label?: string }
  // 物理：运动图像 v/x/a 关于时间 t（expr 用 t 作自变量，写成 x 也可）
  | { kind: "motion"; quantity: "v" | "x" | "a"; expr: string; domain: [number, number]; label?: string }
  // 化学：反应能量图（反应进程-能量，过渡态=峰、中间体=谷）
  | { kind: "energy"; points: EnergyPoint[]; label?: string }
  // 数学：任意立体几何图（真3D，顶点+棱+高亮+平面）
  | {
      kind: "geometry";
      points: GPoint[];
      edges: GEdge[];
      highlights?: GHigh[];
      faces?: GFace[];
      midpoints?: GMidpoint[];
      label?: string;
    };
