import { Solid } from "./Solid.tsx";
import { FunctionPlot } from "./FunctionPlot.tsx";
import { FreeBody } from "./FreeBody.tsx";
import { EnergyDiagram } from "./EnergyDiagram.tsx";
import { Geometry3D } from "./Geometry3D.tsx";
import { Geometry2D } from "./Geometry2D.tsx";
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
    case "energy":
      return <EnergyDiagram points={spec.points} />;
    case "geometry":
      // 立体几何：同时显示 2D 透视图（试卷风格）+ 3D 可旋转图
      return (
        <div className="geo-dual">
          <div className="geo-pane">
            <div className="geo-label">2D（试卷风格）</div>
            <Geometry2D points={spec.points} edges={spec.edges} highlights={spec.highlights} faces={spec.faces} />
          </div>
          <div className="geo-pane">
            <div className="geo-label">3D（可旋转）</div>
            <Geometry3D points={spec.points} edges={spec.edges} highlights={spec.highlights} faces={spec.faces} />
          </div>
        </div>
      );
    case "motion":
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
