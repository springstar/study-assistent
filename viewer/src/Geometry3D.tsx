import { Canvas } from "@react-three/fiber";
import { OrbitControls, Line, Html } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import type { GPoint, GEdge, GHigh, GFace } from "./spec.ts";

const POS = (pts: GPoint[], label: string): [number, number, number] => {
  const p = pts.find((x) => x.label === label);
  return p ? (p.pos as [number, number, number]) : [0, 0, 0];
};

/** 把多边形面拆成三角形顶点数组（扇形三角化，够用） */
function triFace(pts: [number, number, number][]): number[] {
  const out: number[] = [];
  for (let i = 1; i < pts.length - 1; i++) {
    out.push(...pts[0], ...pts[i], ...pts[i + 1]);
  }
  return out;
}

export function Geometry3D({
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
  // 自动取景：算包围盒中心 + 大小
  const { center, size } = useMemo(() => {
    const xs = points.map((p) => p.pos[0]);
    const ys = points.map((p) => p.pos[1]);
    const zs = points.map((p) => p.pos[2]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    const span = Math.max(
      Math.max(...xs) - Math.min(...xs),
      Math.max(...ys) - Math.min(...ys),
      Math.max(...zs) - Math.min(...zs),
    );
    return { center: [cx, cy, cz] as [number, number, number], size: Math.max(span, 2) };
  }, [points]);

  const camDist = size * 2.4;

  return (
    <Canvas camera={{ position: [center[0] + camDist, center[1] + camDist * 0.7, center[2] + camDist], fov: 45 }}>
      <ambientLight intensity={0.8} />
      <directionalLight position={[5, 8, 5]} intensity={0.8} />

      {/* 面：半透明三角覆盖 */}
      {faces.map((f, i) => {
        const pts = f.points.map((l) => POS(points, l));
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(triFace(pts), 3));
        geo.computeVertexNormals();
        return (
          <mesh key={`f${i}`} geometry={geo}>
            <meshStandardMaterial
              color={f.color || "#4dabf7"}
              transparent
              opacity={0.18}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        );
      })}

      {/* 棱：实线/虚线 */}
      {edges.map((e, i) => (
        <Line
          key={`e${i}`}
          points={[POS(points, e.from), POS(points, e.to)]}
          color={e.hidden ? "#aab" : "#333"}
          lineWidth={e.hidden ? 1 : 1.8}
          dashed={!!e.hidden}
          dashSize={0.12}
          gapSize={0.08}
        />
      ))}

      {/* 高亮线段 */}
      {highlights.map((h, i) => (
        <group key={`h${i}`}>
          <Line points={[POS(points, h.from), POS(points, h.to)]} color={h.color || "#e63946"} lineWidth={3} />
          {h.label && (
            <Html
              position={midpoint(POS(points, h.from), POS(points, h.to))}
              center
            >
              <span style={{ color: h.color || "#e63946", fontSize: 13, fontWeight: 600 }}>{h.label}</span>
            </Html>
          )}
        </group>
      ))}

      {/* 顶点：只标标签，不加球不加粗 */}
      {points.map((p, i) => (
        <Html key={`p${i}`} position={p.pos} center>
          <span style={{ color: "#1c2433", fontSize: 14 }}>{p.label}</span>
        </Html>
      ))}

      <OrbitControls enableDamping target={center} />
    </Canvas>
  );
}

function midpoint(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
}
