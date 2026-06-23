import { useEffect, useState } from "react";
import { Viz } from "./Viz.tsx";
import type { Spec } from "./spec.ts";
import "./App.css";

const PRESETS: { name: string; spec: Spec }[] = [
  { name: "正方体 ABCD-EFGH（立体几何）", spec: { kind: "solid", solid: "cube", size: 2 } },
  { name: "正四棱锥（立体几何）", spec: { kind: "solid", solid: "pyramid", size: 2.4 } },
  { name: "三棱柱（立体几何）", spec: { kind: "solid", solid: "prism", size: 2.4 } },
  { name: "球（立体几何）", spec: { kind: "solid", solid: "sphere", size: 2.4 } },
  {
    name: "f(x)=x³-3x+1，x=1 处切线（导数）",
    spec: { kind: "function", expr: "x^3 - 3*x + 1", domain: [-3, 3], tangentAt: 1 },
  },
  {
    name: "f(x)=sin(x)（函数图）",
    spec: { kind: "function", expr: "sin(x)", domain: [-6.5, 6.5], tangentAt: 0 },
  },
  {
    name: "斜面受力分析（物理）",
    spec: {
      kind: "freebody",
      object: "incline",
      angle: 30,
      forces: [
        { label: "重力 G", angleDeg: 270, mag: 1 },
        { label: "支持力 N", angleDeg: 120, mag: 0.85 },
        { label: "摩擦力 f", angleDeg: 30, mag: 0.6 },
      ],
    },
  },
  {
    name: "匀加速 v-t 图（物理）",
    spec: { kind: "motion", quantity: "v", expr: "2 + 3*t", domain: [0, 5] },
  },
];

function isSpec(o: unknown): o is Spec {
  const k = (o as Spec)?.kind;
  return k === "solid" || k === "function" || k === "freebody" || k === "motion";
}

export default function App() {
  const [i, setI] = useState(0);
  const [current, setCurrent] = useState<Spec | null>(null);

  // 轮询 Tutor 写的 spec.json，对话出新几何/函数题时自动跟随
  useEffect(() => {
    let last = "";
    const poll = async () => {
      try {
        const r = await fetch("/spec.json", { cache: "no-store" });
        if (!r.ok) return;
        const s = await r.json();
        if (!isSpec(s)) return;
        const j = JSON.stringify(s);
        if (j !== last) {
          last = j;
          setCurrent(s);
          setI(0); // 新题目自动切到"当前题目"
        }
      } catch {
        // spec.json 不存在/网络抖动，忽略
      }
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, []);

  const list = current ? [{ name: "📍 当前题目（来自 Tutor）", spec: current }, ...PRESETS] : PRESETS;
  const spec = list[i].spec;

  return (
    <div className="layout">
      <aside className="panel">
        <h1>几何可视化</h1>
        <p className="hint">立体几何：拖动旋转。函数图：滚轮缩放、拖动平移。</p>
        <label>
          选择题目：
          <select value={i} onChange={(e) => setI(Number(e.target.value))}>
            {list.map((p, idx) => (
              <option key={idx} value={idx}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <pre className="spec">{JSON.stringify(spec, null, 2)}</pre>
      </aside>
      <main className="stage">
        <Viz key={JSON.stringify(spec)} spec={spec} />
      </main>
    </div>
  );
}
