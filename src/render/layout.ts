/**
 * Placement: how big a page of lyrics will be, and where it can sit without
 * covering a face.
 */
import { measureText } from "@remotion/layout-utils";
import { NO_SPACE_SCRIPTS } from "../core/script";
import type { Page } from "../core/timeline";
import type { Analysis, Line, Track } from "../schema/song";
import type { Style, TextStyle } from "../schema/style";
import { textStyleFor } from "../style/resolve";
import { cssFamily, fontStack } from "./fonts";

export type Position = "bottom" | "center" | "top";

export function lineText(line: Line, ts: TextStyle): string {
  const s = line.words.map((w) => w.text + (w.ws ? " " : "")).join("");
  return ts.textTransform === "uppercase" ? s.toUpperCase() : ts.textTransform === "lowercase" ? s.toLowerCase() : s;
}

/** Width in px of a line at a font size, measured with the real fonts. */
export function measureLine(line: Line, track: Track, style: Style, fontSize: number): number {
  const ts = textStyleFor(style, track);
  const text = lineText(line, ts);
  const spacing = NO_SPACE_SCRIPTS.has(track.script) ? 0 : line.words.length * 2 * style.layout.wordSpacing * fontSize;
  try {
    const m = measureText({
      text,
      fontFamily: cssFamily(fontStack(style, ts, track.script)),
      fontSize,
      fontWeight: String(ts.fontWeight),
      letterSpacing: `${ts.letterSpacing}em`,
      validateFontIsLoaded: false,
    });
    return m.width + spacing;
  } catch {
    const wide = /[\u3000-\u9fff\uac00-\ud7af]/.test(text) ? 1 : 0.56;
    return [...text].length * fontSize * wide + spacing;
  }
}

/** Estimated height in px of a page's block of lines. */
export function pageHeight(page: Page, style: Style, tracks: Map<string, Track>, scale: number, maxWidthPx: number): number {
  let h = 0;
  page.lines.forEach((line, i) => {
    const track = tracks.get(line.track)!;
    const ts = textStyleFor(style, track);
    const fs = ts.fontSize * scale;
    const rows = Math.max(1, Math.ceil(measureLine(line, track, style, fs) / maxWidthPx));
    h += rows * fs * ts.lineHeight + (i > 0 ? style.layout.lineGap * style.text.primary.fontSize * scale : 0);
  });
  return h;
}

type Rect = { x: number; y: number; w: number; h: number }; // fractions of the frame

function overlap(a: Rect, b: Rect): number {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return x * y;
}

/** Text box (as frame fractions) for a page block of size (wPx, hPx) at a position. */
export function blockRect(pos: Position, style: Style, W: number, H: number, wPx: number, hPx: number): Rect {
  const w = Math.min(wPx / W, 1 - 2 * style.layout.marginX);
  const h = hPx / H;
  const x = style.layout.align === "center" ? 0.5 - w / 2 : style.layout.align === "start" ? style.layout.marginX : 1 - style.layout.marginX - w;
  const y = pos === "bottom" ? 1 - style.layout.marginY - h : pos === "top" ? style.layout.marginY : 0.5 - h / 2;
  return { x, y, w, h };
}

/**
 * Pick where a page goes. Keeps the style's position unless a face would be
 * covered at any sampled moment while the page is on screen; then tries the
 * other positions and takes the one that covers the least face area.
 */
export function choosePosition(
  page: Page,
  style: Style,
  analysis: Analysis | null,
  W: number,
  H: number,
  wPx: number,
  hPx: number,
): Position {
  const preferred = style.layout.position;
  if (!style.layout.avoidFaces || !analysis?.faces.length) return preferred;
  const from = page.enterStart;
  const to = page.exitStart + page.exitDur;
  const samples = analysis.faces.filter((f) => f.t >= from - 0.25 && f.t <= to + 0.25);
  if (!samples.length) return preferred;
  const order: Position[] =
    preferred === "bottom" ? ["bottom", "top", "center"] : preferred === "top" ? ["top", "bottom", "center"] : ["center", "bottom", "top"];
  const pad = 0.015;
  const cost = (pos: Position) => {
    const r = blockRect(pos, style, W, H, wPx, hPx);
    const box = { x: r.x - pad, y: r.y - pad, w: r.w + 2 * pad, h: r.h + 2 * pad };
    let total = 0;
    for (const s of samples) for (const [x, y, w, h] of s.boxes) total += overlap(box, { x, y, w, h });
    return total;
  };
  let best = order[0];
  let bestCost = cost(best);
  if (bestCost === 0) return best;
  for (const pos of order.slice(1)) {
    const c = cost(pos);
    if (c < bestCost * 0.5) {
      best = pos;
      bestCost = c;
      if (c === 0) break;
    }
  }
  return best;
}
