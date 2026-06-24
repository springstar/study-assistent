import { Canvas } from "@react-three/fiber";
import { OrbitControls, Line, Html } from "@react-three/drei";
import { Vector3 } from "three";
import type { Force } from "./spec.ts";

const O = new Vector3(0, 0, 0);
const rad = (deg: number) => (deg * Math.PI) / 180;

// 物体方块轮廓（边长 s，中心在原点）
function boxPts(s: number): [number, number, number][] {
  const h = s / 2;
  return [
    [-h, -h, 0],
    [h, -h, 0],
    [h, h, 0],
    [-h, h, 0],
    [-h, -h, 0],
  ];
}

export function FreeBody({
  object,
  angle = 30,
  forces,
}: {
  object: "box" | "incline";
  angle?: number;
  forces: Force[];
}) {
  return (
    <Canvas orthographic camera={{ position: [0, 0, 10], zoom: 80 }}>
      <color attach="background" args={["#ffffff"]} />

      {/* 斜面：过原点的斜线 + 水平地面，给受力一个情景 */}
      {object === "incline" && (
        <>
          <Line
            points={[
              [-3 * Math.cos(rad(angle)), -3 * Math.sin(rad(angle)), 0],
              [3 * Math.cos(rad(angle)), 3 * Math.sin(rad(angle)), 0],
            ]}
            color="#8a6d3b"
            lineWidth={2}
          />
          <Html position={[2.4 * Math.cos(rad(angle)), 2.4 * Math.sin(rad(angle)) - 0.3, 0]} center>
            <span style={{ color: "#8a6d3b", fontSize: 12 }}>{angle}°</span>
          </Html>
        </>
      )}

      {/* 物体 */}
      <Line points={boxPts(0.8)} color="#333" lineWidth={2} />

      {/* 力矢量 */}
      {forces.map((f, i) => {
        const a = rad(f.angleDeg);
        const dir = new Vector3(Math.cos(a), Math.sin(a), 0).normalize();
        const len = (f.mag ?? 0.8) * 2.4;
        return (
          <group key={i}>
            <arrowHelper args={[dir, O, len, "#c0392b", 0.35, 0.22]} />
            <Html position={[dir.x * (len + 0.4), dir.y * (len + 0.4), 0]} center>
              <span style={{ color: "#c0392b", fontSize: 13, whiteSpace: "nowrap" }}>{f.label}</span>
            </Html>
          </group>
        );
      })}

      <OrbitControls enableRotate={false} enableDamping />
    </Canvas>
  );
}
