import { Canvas } from "@react-three/fiber";
import { OrbitControls, Edges, Html } from "@react-three/drei";
import type { SolidKind } from "./spec.ts";

function Geometry({ solid, size }: { solid: SolidKind; size: number }) {
  switch (solid) {
    case "cube":
      return <boxGeometry args={[size, size, size]} />;
    case "sphere":
      return <sphereGeometry args={[size / 2, 48, 32]} />;
    case "pyramid": // 正四棱锥：4 边底的圆锥
      return <coneGeometry args={[size / 2, size, 4]} />;
    case "prism": // 三棱柱：3 边底的圆柱
      return <cylinderGeometry args={[size / 2, size / 2, size, 3]} />;
  }
}

/** 正方体的 8 个顶点标 A..H，帮助空间想象 */
function cubeVertexLabels(size: number) {
  const h = size / 2;
  const pts: [number, number, number][] = [];
  for (const x of [-h, h]) for (const y of [-h, h]) for (const z of [-h, h]) pts.push([x, y, z]);
  const names = ["A", "B", "C", "D", "E", "F", "G", "H"];
  return pts.map((p, i) => (
    <Html key={i} position={[p[0] * 1.12, p[1] * 1.12, p[2] * 1.12]} center>
      <span style={{ color: "#c0392b", fontWeight: 700, fontSize: 14 }}>{names[i]}</span>
    </Html>
  ));
}

export function Solid({ solid, size = 2 }: { solid: SolidKind; size?: number }) {
  return (
    <Canvas camera={{ position: [size * 2, size * 1.6, size * 2], fov: 50 }}>
      <ambientLight intensity={0.7} />
      <directionalLight position={[5, 8, 5]} intensity={1.2} />
      <mesh>
        <Geometry solid={solid} size={size} />
        <meshStandardMaterial color="#4a90d9" transparent opacity={0.55} />
        <Edges color="#1a3a5c" lineWidth={1.5} />
      </mesh>
      {solid === "cube" && cubeVertexLabels(size)}
      <axesHelper args={[size * 1.6]} />
      <OrbitControls enableDamping />
    </Canvas>
  );
}
