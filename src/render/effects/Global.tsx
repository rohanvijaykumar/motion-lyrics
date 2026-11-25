/** Full-frame effects: drifting particles, film grain, vignette, subtitle band. */
import React, { useMemo } from "react";
import { Img } from "remotion";
import { between, rng } from "../../core/random";
import type { Style } from "../../schema/style";
import { useRender } from "../context";

export const Particles: React.FC = () => {
  const { t, style, width: W, height: H, scale } = useRender();
  const p = style.effects.particles;
  const dots = useMemo(() => {
    const r = rng("particles");
    return Array.from({ length: p.count }, () => ({
      x: r(),
      y: r(),
      size: between(r, p.size[0], p.size[1]),
      speed: between(r, 0.6, 1.4),
      sway: between(r, 6, 22),
      phase: r() * Math.PI * 2,
      twinkle: between(r, 0.6, 1.6),
    }));
  }, [p.count, p.size]);
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {dots.map((d, i) => {
        const travel = H + 40;
        const y = ((((d.y * travel - t * p.speed * d.speed * scale) % travel) + travel) % travel) - 20;
        const x = d.x * W + Math.sin(t * 0.4 + d.phase) * d.sway * scale;
        const o = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * d.twinkle + d.phase));
        const s = d.size * scale;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x - s / 2,
              top: y - s / 2,
              width: s,
              height: s,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${p.color}, transparent 70%)`,
              opacity: o,
            }}
          />
        );
      })}
    </div>
  );
};

/** A noise tile generated once from a fixed seed, tiled and shifted every frame. */
export const Grain: React.FC = () => {
  const { t, fps, style, width: W, height: H } = useRender();
  const TILE = 256;
  const tile = useMemo(() => {
    if (typeof document === "undefined") return null;
    const c = document.createElement("canvas");
    c.width = TILE;
    c.height = TILE;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    const img = ctx.createImageData(TILE, TILE);
    const r = rng("grain");
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.floor(r() * 255);
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c.toDataURL("image/png");
  }, []);
  if (!tile) return null;
  const frame = Math.round(t * fps);
  const r = rng(`grain-${frame % 24}`);
  const ox = -Math.floor(r() * TILE);
  const oy = -Math.floor(r() * TILE);
  const cols = Math.ceil(W / TILE) + 1;
  const rows = Math.ceil(H / TILE) + 1;
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", mixBlendMode: "overlay", opacity: style.effects.grain.opacity * 2.2, pointerEvents: "none" }}>
      <div style={{ position: "absolute", left: ox, top: oy, width: cols * TILE, height: rows * TILE, display: "flex", flexWrap: "wrap" }}>
        {Array.from({ length: cols * rows }, (_, i) => (
          <Img key={i} src={tile} style={{ width: TILE, height: TILE, display: "block" }} />
        ))}
      </div>
    </div>
  );
};

export const Vignette: React.FC<{ style: Style }> = ({ style }) => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      background: `radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,${style.effects.vignette.strength}) 100%)`,
      pointerEvents: "none",
    }}
  />
);

/** A soft dark band behind subtitles; `visible` is 0..1, `edge` is where the text sits. */
export const Band: React.FC<{ visible: number; edge: "bottom" | "top" }> = ({ visible, edge }) => {
  const { style, height: H } = useRender();
  const s = style.effects.scrim;
  if (visible <= 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        [edge]: 0,
        height: s.height * H,
        background: `linear-gradient(to ${edge === "bottom" ? "top" : "bottom"}, ${s.color}, transparent)`,
        opacity: visible,
        pointerEvents: "none",
      }}
    />
  );
};
