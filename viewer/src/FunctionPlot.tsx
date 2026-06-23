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
  const { curve, tangent, box } = useMemo(() => {
    const f = compile(expr);
    const [a, b] = domain;
    const N = 240;
    const curve: V3[] = [];
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i <= N; i++) {
      const x = a + ((b - a) * i) / N;
      const y = f(x);
      if (Number.isFinite(y)) {
        curve.push([x, y, 0]);
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    let tangent: V3[] | null = null;
    if (tangentAt !== undefined) {
      const h = 1e-4;
      const m = (f(tangentAt + h) - f(tangentAt - h)) / (2 * h);
      const y0 = f(tangentAt);
      tangent = [
        [a, y0 + m * (a - tangentAt), 0],
        [b, y0 + m * (b - tangentAt), 0],
      ];
    }
    // 取景范围：把坐标原点(0,0)纳入，便于显示坐标轴
    if (!Number.isFinite(minY)) {
      minY = 0;
      maxY = 1;
    }
    const box = { minX: Math.min(a, 0), maxX: Math.max(b, 0), minY: Math.min(minY, 0), maxY: Math.max(maxY, 0) };
    return { curve, tangent, box };
  }, [expr, domain, tangentAt]);

  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  const spanX = box.maxX - box.minX || 1;
  const spanY = box.maxY - box.minY || 1;
  // 自动缩放以铺满画布（留 15% 边距）；画布按典型舞台尺寸估算
  const zoom = 0.85 * Math.min(640 / spanX, 660 / spanY);

  return (
    <Canvas orthographic camera={{ position: [cx, cy, 10], zoom }}>
      <color attach="background" args={["#fafafa"]} />
      {/* 坐标轴 */}
      <Line points={[[box.minX, 0, 0], [box.maxX, 0, 0]]} color="#999" lineWidth={1} />
      <Line points={[[0, box.minY, 0], [0, box.maxY, 0]]} color="#999" lineWidth={1} />
      {/* 函数曲线 */}
      <Line points={curve} color={color} lineWidth={2.5} />
      {/* 轴标签 */}
      {xLabel && (
        <Html position={[box.maxX, 0, 0]} center>
          <span style={{ color: "#666", fontSize: 12 }}>{xLabel}</span>
        </Html>
      )}
      {yLabel && (
        <Html position={[0, box.maxY, 0]} center>
          <span style={{ color: "#666", fontSize: 12 }}>{yLabel}</span>
        </Html>
      )}
      {/* 切线 */}
      {tangent && <Line points={tangent} color="#c0392b" lineWidth={1.5} dashed dashSize={0.15} gapSize={0.1} />}
      {tangentAt !== undefined && (
        <Html position={[tangentAt, 0, 0]} center>
          <span style={{ color: "#c0392b", fontSize: 12, whiteSpace: "nowrap" }}>x={tangentAt}</span>
        </Html>
      )}
      <OrbitControls enableRotate={false} enableDamping />
    </Canvas>
  );
}
