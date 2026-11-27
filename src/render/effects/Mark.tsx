/**
 * Marks drawn on the word being sung. Hand-drawn ones (marker, underline,
 * circle, box, strike, crossed, bracket) come from @remotion/rough-notation and
 * are seeded per word so every render draws the same strokes. The smooth
 * ink-underline and wave-underline are SVG paths drawn on with @remotion/paths.
 */
import { measureText } from "@remotion/layout-utils";
import { evolvePath } from "@remotion/paths";
import {
  Box,
  Bracket,
  Circle,
  CrossedOff,
  Highlight,
  StrikeThrough,
  Underline,
} from "@remotion/rough-notation";
import React from "react";
import type { Style } from "../../schema/style";

type MarkStyle = Style["highlight"]["mark"];

/** Seed from a word id, so marks are hand-drawn but identical on every frame. */
function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) % 100000;
}

/** Whether a mark sits behind the text (marker) or on top of it. */
export const markBehind = (m: MarkStyle) => m.type === "marker";

export const WordMark: React.FC<{
  mark: MarkStyle;
  wordId: string;
  text: string;
  progress: number;
  opacity: number;
  scale: number;
  rtl: boolean;
  font: { family: string; px: number; weight: number; letterSpacing: number };
}> = ({ mark, wordId, text, progress, opacity, scale, rtl, font }) => {
  if (mark.type === "none" || progress <= 0 || opacity <= 0) return null;
  const sw = mark.strokeWidth * scale;
  const pad = mark.padding * scale;
  const wrap: React.CSSProperties = {
    position: "absolute",
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    opacity,
    pointerEvents: "none",
    zIndex: markBehind(mark) ? 0 : 3,
  };
  if (mark.type === "ink-underline" || mark.type === "wave-underline") {
    let w = 0;
    try {
      w = measureText({
        text,
        fontFamily: font.family,
        fontSize: font.px,
        fontWeight: String(font.weight),
        letterSpacing: `${font.letterSpacing}em`,
        validateFontIsLoaded: false,
      }).width;
    } catch {
      w = text.length * font.px * 0.55;
    }
    w = Math.max(w, font.px * 0.6);
    const h = font.px * 0.32;
    const x0 = -pad * 0.5;
    const x1 = w + pad * 0.5;
    let d: string;
    if (mark.type === "wave-underline") {
      const waves = Math.max(2, Math.round(w / (font.px * 0.45)));
      const step = (x1 - x0) / waves;
      const amp = h * 0.32;
      d = `M ${x0} ${h / 2}`;
      for (let i = 0; i < waves; i++) {
        const a = x0 + i * step;
        d += ` Q ${a + step / 4} ${h / 2 - amp} ${a + step / 2} ${h / 2} T ${a + step} ${h / 2}`;
      }
    } else {
      // A brush stroke that dips a little in the middle and lifts at the end.
      d = `M ${x0} ${h * 0.55} C ${x0 + (x1 - x0) * 0.3} ${h * 0.75}, ${x0 + (x1 - x0) * 0.7} ${h * 0.7}, ${x1} ${h * 0.35}`;
    }
    const evolved = evolvePath(Math.min(1, progress), d);
    return (
      <span style={wrap}>
        <svg
          width={w + pad * 2}
          height={h}
          viewBox={`${-pad} 0 ${w + pad * 2} ${h}`}
          style={{
            position: "absolute",
            left: -pad,
            bottom: -h * 0.55,
            overflow: "visible",
            scale: rtl ? "-1 1" : undefined,
          }}
        >
          <path
            d={d}
            fill="none"
            stroke={mark.color}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeDasharray={evolved.strokeDasharray}
            strokeDashoffset={evolved.strokeDashoffset}
          />
        </svg>
      </span>
    );
  }
  const shared = {
    progress: Math.min(1, progress),
    seed: seedOf(wordId),
    color: mark.color,
  };
  const ghost = (
    <span style={{ visibility: "hidden", whiteSpace: "pre" }}>{text}</span>
  );
  const padding = { left: pad, right: pad, top: pad * 0.6, bottom: pad * 0.6 };
  const iterations = Math.max(1, Math.round(mark.iterations));
  let el: React.ReactNode;
  switch (mark.type) {
    case "marker":
      el = (
        <Highlight {...shared} padding={padding} iterations={iterations} rtl={rtl}>
          {ghost}
        </Highlight>
      );
      break;
    case "underline":
      el = (
        <Underline
          {...shared}
          strokeWidth={sw}
          iterations={iterations}
          rtl={rtl}
          padding={{ top: pad * 0.4 }}
        >
          {ghost}
        </Underline>
      );
      break;
    case "circle":
      el = (
        <Circle {...shared} strokeWidth={sw} iterations={iterations} padding={padding}>
          {ghost}
        </Circle>
      );
      break;
    case "box":
      el = (
        <Box {...shared} strokeWidth={sw} iterations={iterations} padding={padding}>
          {ghost}
        </Box>
      );
      break;
    case "strike":
      el = (
        <StrikeThrough {...shared} strokeWidth={sw} iterations={iterations} rtl={rtl}>
          {ghost}
        </StrikeThrough>
      );
      break;
    case "crossed":
      el = (
        <CrossedOff {...shared} strokeWidth={sw} iterations={iterations} rtl={rtl}>
          {ghost}
        </CrossedOff>
      );
      break;
    case "bracket":
      el = (
        <Bracket
          {...shared}
          strokeWidth={sw}
          padding={padding}
          bracketLeft
          bracketRight
        >
          {ghost}
        </Bracket>
      );
      break;
    default:
      return null;
  }
  return <span style={wrap}>{el}</span>;
};
