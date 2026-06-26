import { useMemo } from "react";
import type { GPoint, GEdge, GHigh, GFace } from "./spec.ts";

/** 斜二测投影：3D → 2D（试卷风格，竖立棱柱）。
 *  x 轴水平向右，y 轴竖直（棱柱上下方向），z 轴向右上方 30°（深度，不缩短）。
 *  从前左上方看：能看到正面（z 小）+ 顶面（y 大）+ 侧面；后方 z 大的点偏右上。
 *  SVG y 向下故取反 y。被遮挡棱用 hidden 虚线。 */
function project([x, y, z]: [number, number, number]): [number, number] {
  const a = (Math.PI / 180) * 30;
  const px = x + z * Math.cos(a); // z 向右
  const py = -y - z * Math.sin(a); // z 向上（SVG y 向下，取反）
  return [px, py];
}

export function Geometry2D({
  points,
  edges,
  highlights = [],
  faces = [],
}: {
  points: GPoint[];
  edges: GEdge[];
  highlights?: GHigh[];
  faces?: GFace[];
}) {
  const { proj, W, H } = useMemo(() => {
    const proj = new Map<string, [number, number]>();
    points.forEach((p) => proj.set(p.label, project(p.pos)));
    const xs = [...proj.values()].map((p) => p[0]);
    const ys = [...proj.values()].map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const pad = 0.8;
    const span = Math.max(maxX - minX, maxY - minY, 1);
    const scale = 280 / span;
    const W = (maxX - minX + pad * 2) * scale;
    const H = (maxY - minY + pad * 2) * scale;
    const toSvg = ([x, y]: [number, number]): [number, number] => [
      (x - minX + pad) * scale,
      (y - minY + pad) * scale,
    ];
    // 把 proj 转成 SVG 坐标
    const svgProj = new Map<string, [number, number]>();
    points.forEach((p) => svgProj.set(p.label, toSvg(proj.get(p.label)!)));
    return { proj: svgProj, vb: { minX, maxX, minY, maxY, scale, pad }, W, H };
  }, [points]);

  const P = (label: string) => proj.get(label) || [0, 0];

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} style={{ background: "#fff", maxHeight: 380 }}>
      {/* 面：半透明多边形 */}
      {faces.map((f, i) => {
        const pts = f.points.map((l) => P(l)).map((p) => `${p[0]},${p[1]}`).join(" ");
        return <polygon key={`f${i}`} points={pts} fill={f.color || "#4dabf7"} fillOpacity={0.12} stroke="none" />;
      })}
      {/* 棱：实线/虚线 */}
      {edges.map((e, i) => {
        const a = P(e.from), b = P(e.to);
        return (
          <line
            key={`e${i}`}
            x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]}
            stroke={e.hidden ? "#999" : "#1c2433"}
            strokeWidth={e.hidden ? 1 : 1.8}
            strokeDasharray={e.hidden ? "5,4" : undefined}
          />
        );
      })}
      {/* 高亮线段 */}
      {highlights.map((h, i) => {
        const a = P(h.from), b = P(h.to);
        const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 8];
        return (
          <g key={`h${i}`}>
            <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={h.color || "#e63946"} strokeWidth={2.8} />
            {h.label && (
              <text x={mid[0]} y={mid[1]} fontSize={13} fill={h.color || "#e63946"} textAnchor="middle" fontWeight={600}>
                {h.label}
              </text>
            )}
          </g>
        );
      })}
      {/* 顶点 + 标签 */}
      {points.map((p, i) => {
        const [x, y] = P(p.label);
        return (
          <text key={`p${i}`} x={x + 5} y={y - 4} fontSize={14} fill="#1c2433" fontFamily="serif">
            {p.label}
          </text>
        );
      })}
    </svg>
  );
}
