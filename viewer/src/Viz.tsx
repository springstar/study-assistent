import { Solid } from "./Solid.tsx";
import { FunctionPlot } from "./FunctionPlot.tsx";
import { FreeBody } from "./FreeBody.tsx";
import type { Spec } from "./spec.ts";

const QTY_LABEL: Record<string, string> = { v: "v", x: "x", a: "a" };

/** 按 spec.kind 分派渲染 */
export function Viz({ spec }: { spec: Spec }) {
  switch (spec.kind) {
    case "solid":
      return <Solid solid={spec.solid} size={spec.size} />;
    case "function":
      return <FunctionPlot expr={spec.expr} domain={spec.domain} tangentAt={spec.tangentAt} />;
    case "freebody":
      return <FreeBody object={spec.object} angle={spec.angle} forces={spec.forces} />;
    case "motion":
      // 运动图像 = 量关于时间 t 的函数图；expr 里的 t 映射到绘图变量 x
      return (
        <FunctionPlot
          expr={spec.expr.replace(/\bt\b/g, "x")}
          domain={spec.domain}
          xLabel="t"
          yLabel={QTY_LABEL[spec.quantity] ?? spec.quantity}
          color="#2c9b6f"
        />
      );
  }
}
