/**
 * Effects that ride on a single word while it is sung:
 *   Glint    - a spinning star flare that travels with the karaoke wipe head
 *   Sparkles - little stars and dust shed from the word as the wipe passes
 * Both are seeded from the word id, so they are identical in every render.
 */
import React from "react";
import { between, rng } from "../../core/random";
import type { Style } from "../../schema/style";
import { ease, lerp, seg } from "../anim";

const STAR_PATH = "M10 0C10.9 6.6 13.4 9.1 20 10C13.4 10.9 10.9 13.4 10 20C9.1 13.4 6.6 10.9 0 10C6.6 9.1 9.1 6.6 10 0Z";

const Star: React.FC<{ fill: string }> = ({ fill }) => (
  <svg viewBox="0 0 20 20" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}>
    <path d={STAR_PATH} fill={fill} />
  </svg>
);

export type WipeTiming = { hs: number; d: number; dir: "ltr" | "rtl"; head: number };

/** Where the wipe is and how long it lasts, shared by the fill and its effects. */
export function wipeTiming(start: number, end: number, style: Style, t: number, dir: "ltr" | "rtl"): WipeTiming {
  const h = style.highlight;
  const hs = start - h.wipeLead;
  const d = Math.max(h.minWordDuration, end - start);
  const fn = h.wipeEase === "sine" ? ease.sineInOut : ease.linear;
  return { hs, d, dir, head: seg(t, hs, d, fn) };
}

export const Glint: React.FC<{ w: WipeTiming; t: number; style: Style; scale: number; notBefore: number }> = ({
  w,
  t,
  style,
  scale,
  notBefore,
}) => {
  const g = style.effects.glint;
  const hs = Math.max(notBefore, w.hs);
  const he = Math.max(hs + 0.102, w.hs + w.d - 0.06);
  if (t < hs || t > he + 0.24) return null;
  const pop = seg(t, hs, 0.1, ease.backOut(2));
  const mid = he - hs > 0.16 ? seg(t, hs + 0.103, he - hs - 0.11) : 0;
  const out = seg(t, he, 0.24, ease.out2);
  let s = lerp(0.3, 1, pop);
  let rot = lerp(0, 45, pop);
  if (mid > 0) {
    s = lerp(1, 0.85, mid);
    rot = lerp(45, 45 + g.spin * w.d, mid);
  }
  if (out > 0) {
    const s0 = he - hs > 0.16 ? 0.85 : 1;
    const r0 = he - hs > 0.16 ? 45 + g.spin * w.d : 45;
    s = lerp(s0, 1.6, out);
    rot = lerp(r0, 90 + g.spin * w.d, out);
  }
  const opacity = Math.min(seg(t, hs, 0.1), 1) * (1 - out);
  const size = g.size * scale;
  const x = w.dir === "rtl" ? 100 - w.head * 100 : w.head * 100;
  return (
    <span style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <span
        style={{
          position: "absolute",
          left: `${x}%`,
          top: "50%",
          width: size,
          height: size,
          marginLeft: -size / 2,
          marginTop: -size / 2,
          opacity,
          scale: String(s),
          rotate: `${rot}deg`,
        }}
      >
        <i
          style={{
            position: "absolute",
            inset: "30%",
            borderRadius: "50%",
            background: g.core,
            boxShadow: `0 0 ${12 * scale}px ${6 * scale}px ${g.halo}, 0 0 ${36 * scale}px ${18 * scale}px ${g.haloOuter}`,
          }}
        />
        <Star fill={g.color} />
      </span>
    </span>
  );
};

type Spark = { p: number; dot: boolean; sz: number; top: number; dx: number; dy: number; rot: number; life: number; color: string };

export function makeSparks(seed: string, chars: number, style: Style): Spark[] {
  const sp = style.effects.sparkles;
  const r = rng(seed);
  const n = Math.max(sp.perWord[0], Math.min(sp.perWord[1], Math.round(chars * sp.perChar)));
  const [s0, s1] = sp.size;
  const starSizes = [s0, lerp(s0, s1, 0.2), lerp(s0, s1, 0.4), lerp(s0, s1, 0.6), s1].map(Math.round);
  const dotSizes = [7, 8, 10];
  const out: Spark[] = [];
  for (let k = 0; k < n; k++) {
    const p = (k + between(r, 0.15, 0.85)) / n;
    const dot = r() < sp.dustRatio;
    const sz = dot ? dotSizes[Math.floor(r() * dotSizes.length)] : starSizes[Math.floor(r() * starSizes.length)];
    out.push({
      p,
      dot,
      sz,
      top: between(r, -8, 96),
      dx: between(r, -26, 26),
      dy: -between(r, sp.rise[0], sp.rise[1]),
      rot: (r() < 0.5 ? -1 : 1) * between(r, 70, 200),
      life: between(r, sp.life[0], sp.life[1]),
      color: sp.colors[Math.floor(r() * sp.colors.length)] ?? "#ffffff",
    });
  }
  return out;
}

export const Sparkles: React.FC<{
  sparks: Spark[];
  w: WipeTiming;
  t: number;
  style: Style;
  scale: number;
  notBefore: number;
}> = ({ sparks, w, t, style, scale, notBefore }) => {
  const sp = style.effects.sparkles;
  return (
    <span style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {sparks.map((q, k) => {
        const t0 = Math.max(notBefore + 0.01, w.hs + q.p * w.d - 0.02);
        if (t < t0 || t > t0 + 0.142 + q.life) return null;
        const pop = seg(t, t0, 0.14, ease.backOut(3));
        const drift = seg(t, t0 + 0.142, q.life, ease.sineOut);
        const peak = q.dot ? 1.2 : 1;
        const s = drift > 0 ? lerp(peak, 0.15, drift) : lerp(0, peak, pop);
        const rot = drift > 0 ? lerp(q.rot * 0.35, q.rot, drift) : lerp(0, q.rot * 0.35, pop);
        const opacity = drift > 0 ? 1 - drift : Math.min(1, seg(t, t0, 0.14) * 1.4);
        const sz = q.sz * scale;
        const left = w.dir === "rtl" ? 100 - q.p * 100 : q.p * 100;
        return (
          <span
            key={k}
            style={{
              position: "absolute",
              left: `${left}%`,
              top: `${q.top}%`,
              width: sz,
              height: sz,
              marginLeft: -sz / 2,
              marginTop: -sz / 2,
              opacity,
              translate: `${q.dx * drift * scale}px ${q.dy * drift * scale}px`,
              scale: String(s),
              rotate: `${rot}deg`,
            }}
          >
            <i
              style={{
                position: "absolute",
                inset: "30%",
                borderRadius: "50%",
                background: sp.core,
                boxShadow: `0 0 ${10 * scale}px ${5 * scale}px ${sp.glow}, 0 0 ${22 * scale}px ${8 * scale}px ${sp.glowOuter}`,
              }}
            />
            {q.dot ? null : <Star fill={q.color} />}
          </span>
        );
      })}
    </span>
  );
};
