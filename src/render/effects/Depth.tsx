/**
 * A 3D layer between the picture and the lyrics, drawn with @remotion/three:
 * soft bokeh, stars flying past, snow, falling petals or slow glowing orbs.
 * Every position is computed from the time t and a fixed seed (no useFrame),
 * so each frame renders the same way every time.
 */
import { ThreeCanvas } from "@remotion/three";
import React, { useMemo } from "react";
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  NormalBlending,
  type Texture,
} from "three";
import { between, rng } from "../../core/random";
import type { Style } from "../../schema/style";
import { useRender } from "../context";

type Kind = Style["effects"]["depth"]["type"];

function spriteTexture(kind: Kind): Texture | null {
  if (typeof document === "undefined") return null;
  const S = 128;
  const c = document.createElement("canvas");
  c.width = S;
  c.height = S;
  const g = c.getContext("2d");
  if (!g) return null;
  if (kind === "petals") {
    g.translate(S / 2, S / 2);
    g.rotate(0.6);
    const grad = g.createRadialGradient(0, 0, 2, 0, 0, S * 0.42);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(1, "rgba(255,255,255,0.05)");
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(0, 0, S * 0.42, S * 0.2, 0, 0, Math.PI * 2);
    g.fill();
  } else {
    const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    if (kind === "bokeh") {
      grad.addColorStop(0.72, "rgba(255,255,255,0.55)");
    } else if (kind === "snow") {
      grad.addColorStop(0.35, "rgba(255,255,255,0.6)");
    } else {
      // stars and orbs: a bright core with a soft halo, so they read even when small
      grad.addColorStop(0.18, "rgba(255,255,255,0.95)");
      grad.addColorStop(0.45, "rgba(255,255,255,0.3)");
    }
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);
  }
  const tex = new CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

type P = { x: number; y: number; z: number; s: number; ph: number; c: number };

const wrap = (v: number, lo: number, hi: number) =>
  ((((v - lo) % (hi - lo)) + (hi - lo)) % (hi - lo)) + lo;

function positionAt(kind: Kind, p: P, t: number, speed: number) {
  switch (kind) {
    case "stars": {
      const z = wrap(p.z + t * 2.2 * speed, -14, 3);
      return [p.x * 1.6, p.y * 1.6, z] as const;
    }
    case "snow":
      return [
        p.x + Math.sin(t * 0.6 + p.ph) * 0.25,
        wrap(p.y - t * 0.45 * speed * (0.6 + p.s), -4.5, 4.5),
        p.z,
      ] as const;
    case "petals":
      return [
        wrap(p.x + t * 0.25 * speed + Math.sin(t * 0.8 + p.ph) * 0.4, -7, 7),
        wrap(p.y - t * 0.32 * speed * (0.6 + p.s), -4.5, 4.5),
        p.z,
      ] as const;
    case "orbs":
      return [
        p.x + Math.sin(t * 0.12 * speed + p.ph) * 1.2,
        p.y + Math.cos(t * 0.1 * speed + p.ph * 1.3) * 0.8,
        p.z,
      ] as const;
    default:
      return [
        p.x + Math.sin(t * 0.15 * speed + p.ph) * 0.5,
        p.y + Math.cos(t * 0.12 * speed + p.ph) * 0.35,
        p.z,
      ] as const;
  }
}

const SIZE: Record<string, [number, number]> = {
  bokeh: [0.5, 1.5],
  stars: [0.1, 0.26],
  snow: [0.14, 0.4],
  petals: [0.35, 0.7],
  orbs: [1.4, 2.6],
};

export const DepthLayer: React.FC = () => {
  const { t, style, width: W, height: H } = useRender();
  const d = style.effects.depth;
  const kind = d.type;
  const tex = useMemo(() => spriteTexture(kind), [kind]);
  const count = kind === "orbs" ? Math.max(3, Math.round(d.count / 8)) : d.count;
  const parts = useMemo(() => {
    const r = rng(`depth-${kind}`);
    const [s0, s1] = SIZE[kind] ?? [0.3, 0.6];
    return Array.from({ length: count }, () => ({
      x: between(r, -7, 7),
      y: between(r, -4.2, 4.2),
      z: between(r, -12, 1),
      s: r(),
      ph: r() * Math.PI * 2,
      c: Math.floor(r() * 997),
      size: between(r, s0, s1),
    }));
  }, [kind, count]);
  // Three buckets of sizes, each one <points> draw call.
  const buckets = useMemo(() => {
    const sorted = [...parts].sort((a, b) => a.size - b.size);
    const n = Math.ceil(sorted.length / 3);
    return [0, 1, 2]
      .map((i) => sorted.slice(i * n, (i + 1) * n))
      .filter((b) => b.length);
  }, [parts]);
  const palette = useMemo(
    () => (d.colors.length ? d.colors : ["#ffffff"]).map((c) => new Color(c)),
    [d.colors],
  );
  if (!tex || kind === "none") return null;
  const additive = kind !== "petals" && kind !== "snow";
  return (
    <ThreeCanvas
      width={W}
      height={H}
      camera={{ position: [0, 0, 5], fov: 55 }}
      style={{ position: "absolute", inset: 0 }}
      gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }}
    >
      {buckets.map((b, bi) => {
        const pos = new Float32Array(b.length * 3);
        const col = new Float32Array(b.length * 3);
        b.forEach((p, i) => {
          const [x, y, z] = positionAt(kind, p, t, d.speed);
          pos.set([x, y, z], i * 3);
          const c = palette[p.c % palette.length];
          // Twinkle and fade with depth, baked into the colour (additive blending).
          const tw = 0.65 + 0.35 * Math.sin(t * (0.8 + p.s) + p.ph);
          const near = kind === "stars" ? Math.min(1, (z + 14) / 6) : 1;
          const k = (additive ? tw * near : 1) * (additive ? d.opacity : 1);
          col.set([c.r * k, c.g * k, c.b * k], i * 3);
        });
        const size = b.reduce((s, p) => s + p.size, 0) / b.length;
        return (
          <points key={`${bi}-${Math.round(t * 1000)}`}>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[pos, 3]} />
              <bufferAttribute attach="attributes-color" args={[col, 3]} />
            </bufferGeometry>
            <pointsMaterial
              map={tex}
              size={size}
              sizeAttenuation
              vertexColors
              transparent
              opacity={additive ? 1 : d.opacity}
              depthWrite={false}
              blending={additive ? AdditiveBlending : NormalBlending}
            />
          </points>
        );
      })}
    </ThreeCanvas>
  );
};
