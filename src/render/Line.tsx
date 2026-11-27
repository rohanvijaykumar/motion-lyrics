import React from "react";
import type { Line, Track } from "../schema/song";
import type { Style, TextStyle } from "../schema/style";
import { cssFamily } from "./fonts";
import { WordView } from "./Word";

type Props = {
  line: Line;
  track: Track;
  ts: TextStyle;
  fontStack: string[];
  style: Style;
  t: number;
  scale: number;
  /** When this line's words begin entering, and how long each takes. */
  enterStart: number;
  enterDur: number;
  wordStagger: number;
  /** Kinetic layout: each word enters at the moment it is sung. */
  kinetic: boolean;
  pageStart: number;
  opacity: number;
  fontSizeOverride?: number;
  nowrap?: boolean;
  mask?: string;
};

export const LineView: React.FC<Props> = ({
  line,
  track,
  ts,
  fontStack,
  style,
  t,
  scale,
  enterStart,
  enterDur,
  wordStagger,
  kinetic,
  pageStart,
  opacity,
  fontSizeOverride,
  nowrap,
  mask,
}) => {
  const fontSize = (fontSizeOverride ?? ts.fontSize) * scale;
  const align =
    style.layout.align === "center"
      ? "center"
      : style.layout.align === "start"
        ? "start"
        : "end";
  return (
    <div
      dir={track.dir}
      lang={track.lang}
      style={{
        fontFamily: cssFamily(fontStack),
        fontSize,
        fontWeight: ts.fontWeight,
        fontStyle: ts.italic ? "italic" : "normal",
        lineHeight: ts.lineHeight,
        letterSpacing: `${ts.letterSpacing}em`,
        textTransform: ts.textTransform,
        textAlign: align,
        opacity: mask ? 1 : opacity,
        whiteSpace: nowrap ? "nowrap" : "normal",
        // Even line lengths when a line wraps (no single word left on its own line).
        textWrap: "balance",
        overflowWrap: "normal",
        position: "relative",
        zIndex: 1,
      }}
    >
      {line.words.map((w, i) => {
        const start = kinetic
          ? Math.max(pageStart, w.start - 0.1)
          : enterStart + i * wordStagger;
        const dur = kinetic ? Math.min(enterDur, 0.35) : enterDur;
        return (
          <React.Fragment key={w.id}>
            <WordView
              word={w}
              t={t}
              style={style}
              ts={ts}
              scale={scale}
              dir={track.dir}
              script={track.script}
              lang={track.lang}
              sung={line.sung}
              entrance={{ start, dur }}
              pageStart={pageStart}
              mask={mask}
              font={{
                family: cssFamily(fontStack),
                px: fontSize,
                weight: ts.fontWeight,
                letterSpacing: ts.letterSpacing,
              }}
            />
            {w.ws ? " " : null}
          </React.Fragment>
        );
      })}
    </div>
  );
};
