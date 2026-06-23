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
];

function isSpec(o: unknown): o is Spec {
  const s = o as Spec;
  return s?.kind === "solid" || s?.kind === "function";
}

export default function App() {
  const [i, setI] = useState(0);
  const [current, setCurrent] = useState<Spec | null>(null);

  // Tutor 生成的当前题目 spec（CLI 写到 viewer/public/spec.json）
  useEffect(() => {
    fetch("/spec.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (isSpec(s)) setCurrent(s);
      })
      .catch(() => {});
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
        <Viz key={`${i}-${current ? "c" : "n"}`} spec={spec} />
      </main>
    </div>
  );
}
