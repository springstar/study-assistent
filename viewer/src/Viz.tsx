import { Solid } from "./Solid.tsx";
import { FunctionPlot } from "./FunctionPlot.tsx";
import type { Spec } from "./spec.ts";

/** 按 spec.kind 分派到立体几何或函数图 */
export function Viz({ spec }: { spec: Spec }) {
  if (spec.kind === "solid") return <Solid solid={spec.solid} size={spec.size} />;
  return <FunctionPlot expr={spec.expr} domain={spec.domain} tangentAt={spec.tangentAt} />;
}
