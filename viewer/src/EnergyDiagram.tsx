import { Canvas } from "@react-three/fiber";
import { OrbitControls, Line, Html } from "@react-three/drei";
import { CatmullRomCurve3, Vector3 } from "three";
import { useMemo } from "react";
import type { EnergyPoint } from "./spec.ts";

type V3 = [number, number, number];

export function EnergyDiagram({ points }: { points: EnergyPoint[] }) {
  const { curve, nodes, box } = useMemo(() => {
    // x 按反应进程均匀铺开，y = 相对能量（缩放到合适视觉范围）
    const xs = points.map((_, i) => (i / Math.max(1, points.length - 1)) * 10);
    const energies = points.map((p) => p.energy);
    const eMin = Math.min(...energies);
    const eMax = Math.max(...energies);
    const eSpan = eMax - eMin || 1;
    const scaleY = (e: number) => ((e - eMin) / eSpan) * 6; // 映射到 0..6
    const nodes: { pos: V3; label: string }[] = points.map((p, i) => ({
      pos: [xs[i], scaleY(p.energy), 0],
      label: p.label,
    }));
    const vecs = nodes.map((n) => new Vector3(n.pos[0], n.pos[1], 0));
    const smooth = new CatmullRomCurve3(vecs).getPoints(120).map((v) => [v.x, v.y, 0] as V3);
    const box = { minX: 0, maxX: 10, minY: 0, maxY: 6 };
    return { curve: smooth, nodes, box };
  }, [points]);

  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  const zoom = 0.8 * Math.min(640 / (box.maxX - box.minX), 520 / (box.maxY - box.minY));

  return (
    <Canvas orthographic camera={{ position: [cx, cy, 10], zoom }}>
      <color attach="background" args={["#fafafa"]} />
      {/* 坐标轴 */}
      <Line points={[[0, -0.5, 0], [10.3, -0.5, 0]]} color="#999" lineWidth={1} />
      <Line points={[[0, -0.5, 0], [0, 6.6, 0]]} color="#999" lineWidth={1} />
      <Html position={[10.3, -0.5, 0]} center>
        <span style={{ color: "#666", fontSize: 12, whiteSpace: "nowrap" }}>反应进程</span>
      </Html>
      <Html position={[0, 6.8, 0]} center>
        <span style={{ color: "#666", fontSize: 12 }}>能量</span>
      </Html>
      {/* 能量曲线 */}
      <Line points={curve} color="#8e44ad" lineWidth={2.5} />
      {/* 能级标注 */}
      {nodes.map((n, i) => (
        <Html key={i} position={[n.pos[0], n.pos[1] + 0.5, 0]} center>
          <span style={{ color: "#8e44ad", fontSize: 12, whiteSpace: "nowrap" }}>{n.label}</span>
        </Html>
      ))}
      <OrbitControls enableRotate={false} enableDamping />
    </Canvas>
  );
}
