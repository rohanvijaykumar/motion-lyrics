/** Tiny, frame-exact animation helpers. Everything is a pure function of time. */
import { Easing } from "remotion";

export type EaseFn = (x: number) => number;

export const ease = {
  linear: (x: number) => x,
  out2: Easing.out(Easing.quad),
  out3: Easing.out(Easing.cubic),
  in2: Easing.in(Easing.quad),
  inOut2: Easing.inOut(Easing.quad),
  inOut3: Easing.inOut(Easing.cubic),
  sineInOut: Easing.inOut(Easing.sin),
  sineOut: Easing.out(Easing.sin),
  backOut: (s: number) => Easing.out(Easing.back(s)),
};

export function styleEase(
  name: "out" | "inOut" | "spring" | "linear",
  dir: "in" | "out" = "in",
): EaseFn {
  if (name === "linear") return ease.linear;
  if (name === "spring") return ease.backOut(1.8);
  if (name === "inOut") return ease.inOut2;
  return dir === "in" ? ease.out3 : ease.in2;
}

/** Progress 0..1 of a segment that starts at t0 and lasts dur, eased. */
export function seg(
  t: number,
  t0: number,
  dur: number,
  fn: EaseFn = ease.linear,
): number {
  if (dur <= 0) return t >= t0 ? 1 : 0;
  const x = (t - t0) / dur;
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return fn(x);
}

export const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
