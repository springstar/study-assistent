import { Canvas } from "@react-three/fiber";
import { OrbitControls, Line, Html } from "@react-three/drei";
import { useMemo } from "react";

type V3 = [number, number, number];

/** 把 x 表达式编译成函数。ponytail: Function eval，上限＝只接受受信任的演示/Tutor 表达式；
 * 字符白名单挡掉明显注入，真要开放用户输入再换正经数学解析器（mathjs）。 */
function compile(expr: string): (x: number) => number {
  const js = expr
    .replace(/\^/g, "**")
    .replace(/\b(sin|cos|tan|asin|acos|atan|sqrt|abs|exp|log|pow|PI|E)\b/g, "Math.$1");
  if (!/^[-+*/(),.\s\dxa-zA-Z_]+$/.test(js)) throw new Error(`非法表达式: ${expr}`);
  return new Function("x", `return (${js});`) as (x: number) => number;
}

export function FunctionPlot({
  expr,
  domain,
  tangentAt,
  xLabel,
  yLabel,
  color = "#2c6fbb",
}: {
  expr: string;
  domain: [number, number];
  tangentAt?: number;
  xLabel?: string;
  yLabel?: string;
  color?: string;
}) {
  const { curve, tangent, axes, labels } = useMemo(() => {
    const f = compile(expr);
    const [a, b] = domain;
    const N = 240;
    const raw: [number, number][] = [];
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i <= N; i++) {
      const x = a + ((b - a) * i) / N;
      const y = f(x);
      if (Number.isFinite(y)) {
        raw.push([x, y]);
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (!Number.isFinite(minY)) {
      minY = 0;
      maxY = 1;
    }
    // x/y 各自独立映射到 [-V,V]，解决 x³ 等 y 量级远大于 x 时被压成竖线的问题
    const V = 5;
    const x0 = Math.min(a, 0), x1 = Math.max(b, 0);
    const y0 = Math.min(minY, 0), y1 = Math.max(maxY, 0);
    const mapX = (x: number) => ((x - x0) / (x1 - x0 || 1)) * 2 * V - V;
    const mapY = (y: number) => ((y - y0) / (y1 - y0 || 1)) * 2 * V - V;
    const curve: V3[] = raw.map(([x, y]) => [mapX(x), mapY(y), 0]);

    let tangent: V3[] | null = null;
    if (tangentAt !== undefined) {
      const h = 1e-4;
      const m = (f(tangentAt + h) - f(tangentAt - h)) / (2 * h);
      const yt = f(tangentAt);
      tangent = [
        [mapX(a), mapY(yt + m * (a - tangentAt)), 0],
        [mapX(b), mapY(yt + m * (b - tangentAt)), 0],
      ];
    }
    const axes = { x0: mapX(x0), x1: mapX(x1), y0: mapY(y0), y1: mapY(y1), zX: mapX(0), zY: mapY(0) };
    const labels = { xEnd: mapX(x1), yEnd: mapY(y1), tx: tangentAt !== undefined ? mapX(tangentAt) : 0 };
    return { curve, tangent, axes, labels };
  }, [expr, domain, tangentAt]);

  return (
    <Canvas orthographic camera={{ position: [0, 0, 10], zoom: 56 }}>
      <color attach="background" args={["#fafafa"]} />
      {/* 坐标轴 */}
      <Line points={[[axes.x0, axes.zY, 0], [axes.x1, axes.zY, 0]]} color="#999" lineWidth={1} />
      <Line points={[[axes.zX, axes.y0, 0], [axes.zX, axes.y1, 0]]} color="#999" lineWidth={1} />
      {/* 函数曲线 */}
      <Line points={curve} color={color} lineWidth={2.5} />
      {/* 轴标签 */}
      {xLabel && (
        <Html position={[labels.xEnd, axes.zY, 0]} center>
          <span style={{ color: "#666", fontSize: 12 }}>{xLabel}</span>
        </Html>
      )}
      {yLabel && (
        <Html position={[axes.zX, labels.yEnd, 0]} center>
          <span style={{ color: "#666", fontSize: 12 }}>{yLabel}</span>
        </Html>
      )}
      {/* 切线 */}
      {tangent && <Line points={tangent} color="#c0392b" lineWidth={1.5} dashed dashSize={0.15} gapSize={0.1} />}
      {tangentAt !== undefined && (
        <Html position={[labels.tx, axes.zY, 0]} center>
          <span style={{ color: "#c0392b", fontSize: 12, whiteSpace: "nowrap" }}>x={tangentAt}</span>
        </Html>
      )}
      <OrbitControls enableRotate={false} enableDamping />
    </Canvas>
  );
}
