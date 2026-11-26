/**
 * Framing: how the source video sits inside the output frame, for any output
 * size or shape (1080p/4K, 16:9/9:16). Pure functions shared by the renderer
 * (where to draw the video, where faces end up) and the CLI's QC.
 *
 *   cover   fill the frame; crop the sides, following faces (default)
 *   contain show the whole video, with bars
 *   blur    show the whole video over a blurred, enlarged copy of itself
 */

export type FitMode = "cover" | "contain" | "blur";
export type Framing = {
  mode: FitMode;
  srcW: number;
  srcH: number;
  W: number;
  H: number;
};
export type Rect = { x: number; y: number; w: number; h: number };
export type FaceSample = {
  t: number;
  boxes: [number, number, number, number][];
};

/** Output size for a requested size/aspect. "source" keeps what the video has. */
export function outputSize(
  srcW: number,
  srcH: number,
  size: "source" | "1080" | "4k",
  aspect: "source" | "16:9" | "9:16",
): { width: number; height: number } {
  const even = (v: number) => Math.round(v / 2) * 2;
  if (size === "source" && aspect === "source")
    return { width: even(srcW), height: even(srcH) };
  const short =
    size === "4k" ? 2160 : size === "1080" ? 1080 : Math.min(srcW, srcH);
  if (aspect === "16:9")
    return { width: even((short * 16) / 9), height: short };
  if (aspect === "9:16")
    return { width: short, height: even((short * 16) / 9) };
  const r = srcW / srcH;
  return r >= 1
    ? { width: even(short * r), height: short }
    : { width: short, height: even(short / r) };
}

/** Pixel rectangle the video occupies, keeping `focus` (0..1 of the source) in view. */
export function videoRect(f: Framing, focusX = 0.5, focusY = 0.5): Rect {
  const s =
    f.mode === "cover"
      ? Math.max(f.W / f.srcW, f.H / f.srcH)
      : Math.min(f.W / f.srcW, f.H / f.srcH);
  const w = f.srcW * s;
  const h = f.srcH * s;
  if (f.mode !== "cover") return { x: (f.W - w) / 2, y: (f.H - h) / 2, w, h };
  const x = Math.min(0, Math.max(f.W - w, f.W / 2 - focusX * w));
  const y = Math.min(0, Math.max(f.H - h, f.H / 2 - focusY * h));
  return { x, y, w, h };
}

/** Does this framing crop enough of the picture that following faces matters? */
export const cropsHeavily = (f: Framing) =>
  f.mode === "cover" && Math.abs(f.W / f.H - f.srcW / f.srcH) > 0.05;

/**
 * Where to centre the crop over time: the size-weighted centre of the faces,
 * smoothed over about two seconds so the picture glides instead of jittering.
 */
export function focusTrack(
  faces: FaceSample[],
): (t: number) => { x: number; y: number } {
  if (!faces.length) return () => ({ x: 0.5, y: 0.5 });
  const raw = faces.map((s) => {
    let wsum = 0;
    let x = 0;
    let y = 0;
    for (const [bx, by, bw, bh] of s.boxes) {
      const a = bw * bh;
      wsum += a;
      x += (bx + bw / 2) * a;
      y += (by + bh / 2) * a;
    }
    return wsum > 0
      ? { t: s.t, x: x / wsum, y: y / wsum, has: true }
      : { t: s.t, x: 0.5, y: 0.5, has: false };
  });
  const smooth = raw.map((p) => {
    const near = raw.filter((q) => q.has && Math.abs(q.t - p.t) <= 1.0);
    if (!near.length) return { t: p.t, x: 0.5, y: 0.5 };
    return {
      t: p.t,
      x: near.reduce((a, q) => a + q.x, 0) / near.length,
      y: near.reduce((a, q) => a + q.y, 0) / near.length,
    };
  });
  return (t: number) => {
    if (t <= smooth[0].t) return smooth[0];
    const last = smooth[smooth.length - 1];
    if (t >= last.t) return last;
    let i = 0;
    while (i < smooth.length - 2 && smooth[i + 1].t < t) i++;
    const a = smooth[i];
    const b = smooth[i + 1];
    const k = (t - a.t) / Math.max(1e-6, b.t - a.t);
    return { t, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
  };
}

/** A face box from the source frame, as fractions of the output frame. */
export function mapBox(
  f: Framing,
  rect: Rect,
  box: [number, number, number, number],
): [number, number, number, number] {
  const [x, y, w, h] = box;
  return [
    (rect.x + x * rect.w) / f.W,
    (rect.y + y * rect.h) / f.H,
    (w * rect.w) / f.W,
    (h * rect.h) / f.H,
  ];
}

/** All face samples mapped into output coordinates (with the moving crop applied). */
export function facesInOutput(f: Framing, faces: FaceSample[]): FaceSample[] {
  const focus = cropsHeavily(f)
    ? focusTrack(faces)
    : () => ({ x: 0.5, y: 0.5 });
  return faces.map((s) => {
    const c = focus(s.t);
    const r = videoRect(f, c.x, c.y);
    return { t: s.t, boxes: s.boxes.map((b) => mapBox(f, r, b)) };
  });
}
