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
}: {
  expr: string;
  domain: [number, number];
  tangentAt?: number;
}) {
  const { curve, tangent } = useMemo(() => {
    const f = compile(expr);
    const [a, b] = domain;
    const N = 240;
    const curve: V3[] = [];
    for (let i = 0; i <= N; i++) {
      const x = a + ((b - a) * i) / N;
      const y = f(x);
      if (Number.isFinite(y)) curve.push([x, y, 0]);
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
    return { curve, tangent };
  }, [expr, domain, tangentAt]);

  const [a, b] = domain;
  const span = b - a;

  return (
    <Canvas orthographic camera={{ position: [0, 0, 10], zoom: 320 / span }}>
      <color attach="background" args={["#fafafa"]} />
      {/* 坐标轴 */}
      <Line points={[[a, 0, 0], [b, 0, 0]]} color="#999" lineWidth={1} />
      <Line points={[[0, -span / 2, 0], [0, span / 2, 0]]} color="#999" lineWidth={1} />
      {/* 函数曲线 */}
      <Line points={curve} color="#2c6fbb" lineWidth={2.5} />
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
