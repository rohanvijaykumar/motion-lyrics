/**
 * One word on screen: its entrance, its highlight while sung, and its effects.
 * The highlight is a second copy of the word stacked exactly on top of the
 * first and revealed with a mask, so it works for every script and direction.
 */
import React, { useMemo } from "react";
import { interpolateColors } from "remotion";
import { LETTER_SAFE_SCRIPTS, NO_SPACE_SCRIPTS } from "../core/script";
import { graphemes } from "../core/segment";
import type { Word } from "../schema/song";
import type { Style, TextStyle } from "../schema/style";
import { ease, lerp, seg } from "./anim";
import { Glint, makeSparks, Sparkles, wipeTiming } from "./effects/WordFx";

export type Entrance = { start: number; dur: number };

type Props = {
  word: Word;
  t: number;
  style: Style;
  ts: TextStyle;
  scale: number;
  dir: "ltr" | "rtl";
  script: string;
  lang: string;
  sung: boolean;
  entrance: Entrance;
  /** Effects never start before the page is on screen. */
  pageStart: number;
};

const PAD = 0.45; // em of room around the fill so glows are not cut off

export const WordView: React.FC<Props> = ({ word, t, style, ts, scale, dir, script, lang, sung, entrance, pageStart }) => {
  const h = style.highlight;
  const fx = style.effects;
  const wipe = wipeTiming(word.start, word.end, style, t, dir);
  const sparks = useMemo(
    () => (sung && fx.sparkles.enabled && h.type === "wipe" ? makeSparks(word.id, [...word.text].length, style) : []),
    [word.id, word.text, sung, fx.sparkles.enabled, h.type, style],
  );

  // ---- entrance ------------------------------------------------------------
  const enterType = style.enter.type;
  const letterMode = (enterType === "typewriter" || enterType === "letters") && LETTER_SAFE_SCRIPTS.has(script);
  const effType = (enterType === "typewriter" || enterType === "letters") && !letterMode ? "rise" : enterType;
  const ep = seg(t, entrance.start, entrance.dur, effType === "pop" ? ease.backOut(2.2) : ease.out3);
  const epLin = seg(t, entrance.start, entrance.dur);
  let opacity = 1;
  let tx = 0;
  let ty = 0;
  let sc = 1;
  let blur = 0;
  let clip: string | undefined;
  const dist = style.enter.distance * scale;
  switch (effType) {
    case "fade":
      opacity = epLin;
      break;
    case "blur-rise":
      opacity = ep;
      ty = (1 - ep) * dist;
      blur = (1 - ep) * style.enter.blur * scale;
      break;
    case "rise":
      opacity = ep;
      ty = (1 - ep) * dist;
      break;
    case "slide":
      opacity = ep;
      tx = (1 - ep) * dist * (dir === "rtl" ? -1 : 1) * 2;
      break;
    case "scale":
      opacity = ep;
      sc = lerp(0.85, 1, ep);
      break;
    case "pop":
      opacity = Math.min(1, epLin * 2.5);
      sc = lerp(0.5, 1, ep);
      break;
    case "mask":
      clip = `inset(${(1 - ep) * 100}% -40% -40% -40%)`;
      ty = (1 - ep) * 0.35 * ts.fontSize * scale;
      break;
    default:
      break;
  }

  // ---- lift on the sung word -------------------------------------------------
  if (sung && (h.liftY !== 0 || h.liftScale !== 1)) {
    const s0 = word.start - 0.05;
    const up = seg(t, s0, h.liftIn, ease.out2);
    const down = seg(t, s0 + Math.max(0.18, wipe.d), h.liftOut, ease.inOut2);
    const a = up * (1 - down);
    ty += h.liftY * scale * a;
    sc *= lerp(1, h.liftScale, a);
  }

  // ---- highlight amount ------------------------------------------------------
  let fill = 0; // how much of the sung copy shows (0..1)
  let fillOpacity = 1;
  const doneFade = h.persist ? 0 : seg(t, word.end + 0.15, 0.3);
  if (h.type === "wipe") fill = wipe.head;
  if (h.type === "color") {
    fill = 1;
    fillOpacity = seg(t, word.start - h.wipeLead, h.colorTransition);
  }
  fillOpacity *= 1 - doneFade;

  const boxOn = h.box.enabled && sung;
  const boxA = boxOn ? seg(t, word.start - 0.04, 0.09, ease.out2) * (1 - seg(t, word.end, 0.1)) : 0;

  // ---- text --------------------------------------------------------------------
  const strokeCss: React.CSSProperties =
    ts.strokeWidth > 0
      ? { WebkitTextStroke: `${ts.strokeWidth * 2 * scale}px ${ts.strokeColor}`, paintOrder: "stroke fill" }
      : {};
  const glyphs = letterMode ? graphemes(word.text, lang) : null;
  const renderText = () => {
    if (!glyphs) return word.text;
    const per = entrance.dur / Math.max(1, glyphs.length);
    return glyphs.map((g, i) => {
      const gp =
        enterType === "typewriter"
          ? t >= entrance.start + i * per
            ? 1
            : 0
          : seg(t, entrance.start + i * per * 0.6, Math.max(0.12, entrance.dur * 0.5), ease.out3);
      return (
        <span
          key={i}
          style={{
            opacity: gp,
            display: "inline-block",
            translate: enterType === "letters" ? `0 ${(1 - gp) * dist * 0.6}px` : undefined,
            whiteSpace: "pre",
          }}
        >
          {g}
        </span>
      );
    });
  };

  const maskPos = `calc(${PAD}em * ${1 - fill} + 100% * ${fill})`;
  const edge = `calc((100% - ${2 * PAD}em) * ${h.softEdge})`;
  const towards = dir === "rtl" ? "to left" : "to right";
  const mask =
    h.type === "wipe" && fill < 1
      ? `linear-gradient(${towards}, #000 calc(${maskPos} - ${edge}), transparent ${maskPos})`
      : undefined;

  const showFill = h.type !== "none" && fill > 0 && fillOpacity > 0;
  const fillColor = boxOn && boxA > 0.01 ? interpolateColors(boxA, [0, 1], [ts.sungColor, h.box.textColor]) : ts.sungColor;

  return (
    <span
      style={{
        position: "relative",
        display: "inline-block",
        // Scripts written without spaces keep their words touching.
        margin: NO_SPACE_SCRIPTS.has(script) ? 0 : `0 ${style.layout.wordSpacing}em`,
        transformOrigin: "50% 70%",
        opacity,
        translate: tx || ty ? `${tx}px ${ty}px` : undefined,
        scale: sc !== 1 ? String(sc) : undefined,
        filter: blur > 0.05 ? `blur(${blur}px)` : undefined,
        clipPath: clip,
        whiteSpace: "nowrap",
      }}
    >
      {boxOn && boxA > 0 ? (
        <span
          style={{
            position: "absolute",
            inset: `-${h.box.padY}em -${h.box.padX}em`,
            borderRadius: h.box.radius * scale,
            background: h.box.color,
            opacity: boxA,
            scale: String(lerp(0.82, 1, boxA)),
            zIndex: 0,
          }}
        />
      ) : null}
      <span
        style={{
          position: "relative",
          zIndex: 1,
          color: ts.color,
          textShadow: ts.shadow === "none" ? undefined : ts.shadow,
          ...strokeCss,
        }}
      >
        {renderText()}
      </span>
      {showFill ? (
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: `-${PAD}em`,
            top: `-${PAD}em`,
            padding: `${PAD}em`,
            zIndex: 2,
            color: fillColor,
            textShadow: ts.sungShadow === "none" ? undefined : ts.sungShadow,
            opacity: fillOpacity,
            maskImage: mask,
            WebkitMaskImage: mask,
            whiteSpace: "nowrap",
            ...strokeCss,
          }}
        >
          {renderText()}
        </span>
      ) : null}
      {h.underline.enabled && sung ? (
        <span
          style={{
            position: "absolute",
            [dir === "rtl" ? "right" : "left"]: 0,
            bottom: -h.underline.offset * scale,
            height: h.underline.thickness * scale,
            width: `${(h.type === "wipe" ? fill : seg(t, word.start, Math.max(0.1, word.end - word.start))) * 100}%`,
            background: h.underline.color,
            borderRadius: h.underline.thickness * scale,
            opacity: 1 - doneFade,
            zIndex: 2,
          }}
        />
      ) : null}
      {sung && h.type === "wipe" && fx.glint.enabled ? (
        <span style={{ position: "absolute", inset: 0, zIndex: 3 }}>
          <Glint w={wipe} t={t} style={style} scale={scale} notBefore={pageStart} />
        </span>
      ) : null}
      {sparks.length ? (
        <span style={{ position: "absolute", inset: 0, zIndex: 3 }}>
          <Sparkles sparks={sparks} w={wipe} t={t} style={style} scale={scale} notBefore={pageStart} />
        </span>
      ) : null}
    </span>
  );
};
