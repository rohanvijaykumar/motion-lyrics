/**
 * Slow camera moves on the background picture and handheld wobble for the
 * lyric layer. Pure functions of time; the wobble uses @remotion/noise so it is
 * smooth, organic and identical on every render.
 */
import { noise2D } from "@remotion/noise";
import type React from "react";
import type { Style } from "../../schema/style";

export type Move = { scale: number; x: number; y: number; rotate: number };
export const STILL: Move = { scale: 1, x: 0, y: 0, rotate: 0 };

/** Background camera at time t of a video that lasts `duration` seconds. */
export function cameraMove(
  cam: Style["effects"]["camera"],
  t: number,
  duration: number,
  W: number,
  scale: number,
): Move {
  const k = Math.max(0, cam.amount);
  const p = duration > 0 ? Math.min(1, Math.max(0, t / duration)) : 0;
  const smooth = p * p * (3 - 2 * p);
  switch (cam.type) {
    case "push-in":
      return { ...STILL, scale: 1 + 0.07 * k * smooth };
    case "pull-out":
      return { ...STILL, scale: 1 + 0.07 * k * (1 - smooth) };
    case "pan": {
      const s = 1 + 0.06 * k;
      const room = ((s - 1) * W) / 2;
      return { ...STILL, scale: s, x: room * (1 - 2 * smooth) * 0.9 };
    }
    case "breathe":
      return {
        ...STILL,
        scale: 1.03 * k + (1 - k) + 0.015 * k * Math.sin(t * 0.5),
      };
    case "handheld":
      return {
        scale: 1 + 0.03 * k,
        x: noise2D("cam-x", t * 0.35, 0) * 9 * k * scale,
        y: noise2D("cam-y", 0, t * 0.35) * 7 * k * scale,
        rotate: noise2D("cam-r", t * 0.25, t * 0.1) * 0.35 * k,
      };
    default:
      return STILL;
  }
}

/** Wobble of the lyric layer, optionally only in a short burst after each beat. */
export function shakeMove(
  shake: Style["effects"]["shake"],
  t: number,
  beats: number[] | undefined,
  scale: number,
): Move {
  if (!shake.enabled) return STILL;
  let env = 1;
  if (shake.onBeat) {
    env = 0;
    if (beats?.length) {
      let last = -1;
      for (const b of beats) {
        if (b > t) break;
        last = b;
      }
      if (last >= 0) env = Math.exp(-(t - last) / 0.09);
    }
  }
  if (env < 0.001) return STILL;
  const a = shake.amount * scale * env;
  const f = shake.speed * (shake.onBeat ? 6 : 1);
  return {
    scale: 1,
    x: noise2D("shake-x", t * f, 0) * a,
    y: noise2D("shake-y", 0, t * f) * a,
    rotate: noise2D("shake-r", t * f * 0.7, 3) * 0.4 * env,
  };
}

export function moveCss(m: Move): React.CSSProperties {
  return {
    scale: m.scale !== 1 ? String(m.scale) : undefined,
    translate: m.x || m.y ? `${m.x}px ${m.y}px` : undefined,
    rotate: m.rotate ? `${m.rotate}deg` : undefined,
  };
}
