/**
 * One screen of lyrics (stack, alternate, kinetic and pop layouts).
 * Handles placement, the backing scrim, line focus, beat pulse and the exit.
 */
import React from "react";
import type { Page } from "../core/timeline";
import type { Line } from "../schema/song";
import { textStyleFor } from "../style/resolve";
import { ease, lerp, seg, styleEase } from "./anim";
import { useRender } from "./context";
import { fontStack } from "./fonts";
import type { Position } from "./layout";
import { marginYFor, measureLine } from "./layout";
import { maskCss } from "../core/qc";
import { LineView } from "./Line";

type Props = { page: Page; position: Position; rowOffsetPx: number };

/** How strongly a line is "the one being sung" (0..1), with gentle ramps. */
function focus(
  line: Line,
  page: Page,
  t: number,
): { up: number; down: number; isFirst: boolean } {
  const sung = page.lines.filter((l) => l.sung);
  const anchor = line.sung
    ? line
    : (sung.find((l) => l.id === line.pairOf) ?? line);
  const idx = sung.indexOf(anchor);
  const ls = anchor.words[0]?.start ?? anchor.start;
  const le = anchor.words[anchor.words.length - 1]?.end ?? anchor.end;
  const next = sung[idx + 1];
  const up =
    idx <= 0 ? 1 : seg(t, Math.max(page.enterStart, ls - 0.28), 0.3, ease.out2);
  const down = next
    ? seg(
        t,
        Math.max(le, (next.words[0]?.start ?? next.start) - 0.3),
        0.35,
        ease.inOut2,
      )
    : 0;
  return { up, down, isFirst: idx <= 0 };
}

export const PageView: React.FC<Props> = ({ page, position, rowOffsetPx }) => {
  const {
    t,
    style,
    tracks,
    scale,
    width: W,
    height: H,
    analysis,
    qcMask,
    adjust,
  } = useRender();
  const fix = adjust[page.groupId] ?? { scale: 1, backing: 0, outline: false };
  const L = style.layout;
  const h = style.highlight;
  const maxWidthPx = W * Math.min(L.maxWidth, 1 - 2 * L.marginX);

  // ---- entrance & exit -------------------------------------------------------
  const ent = page.enterDur;
  const wordStagger =
    ent > 0.5 ? style.enter.wordStagger : style.enter.wordStagger * 0.55;
  const lineStagger = Math.min(style.enter.stagger, ent / 5);
  const ex = seg(
    t,
    page.exitStart,
    page.exitDur,
    styleEase(style.exit.ease, "out"),
  );
  let exOpacity = 1 - ex;
  let exX = 0;
  let exY = 0;
  let exScale = 1;
  let exBlur = 0;
  const xd = style.exit.distance * scale;
  switch (style.exit.type) {
    case "drift-up":
      exY = -xd * ex;
      exBlur = style.exit.blur * scale * ex;
      break;
    case "blur-rise":
      exY = -xd * ex;
      exBlur = style.exit.blur * scale * ex;
      break;
    case "sink":
      exY = xd * ex;
      break;
    case "scale":
      exScale = lerp(1, 0.9, ex);
      break;
    case "slide":
      exX = -xd * 2 * ex;
      break;
    case "mask":
      break;
    case "none":
      exOpacity = t >= page.exitStart ? 0 : 1;
      break;
    default:
      break;
  }
  const exClip =
    style.exit.type === "mask"
      ? `inset(-40% -10% ${ex * 140 - 40}% -10%)`
      : undefined;

  // ---- beat pulse ----------------------------------------------------------------
  let pulse = 1;
  if (style.effects.beatPulse.enabled && analysis?.beats.length) {
    let last = -1;
    for (const b of analysis.beats) {
      if (b > t) break;
      last = b;
    }
    if (last >= 0 && t - last < 0.5)
      pulse = 1 + style.effects.beatPulse.amount * Math.exp(-(t - last) / 0.12);
  }

  // ---- scrim ---------------------------------------------------------------------
  const scrim = style.effects.scrim;
  const scrimIn = seg(t, page.enterStart, 0.7, ease.out2);
  const fitRow = L.type === "alternate" || L.type === "pop";

  const my = marginYFor(style, W, H);
  const anchorStyle: React.CSSProperties =
    position === "bottom"
      ? { bottom: H * my + rowOffsetPx }
      : position === "top"
        ? { top: H * my + rowOffsetPx }
        : { top: "50%", translate: `0 calc(-50% + ${rowOffsetPx}px)` };

  return (
    <div
      style={{
        position: "absolute",
        left: W * L.marginX,
        right: W * L.marginX,
        display: "flex",
        justifyContent:
          L.align === "center"
            ? "center"
            : L.align === "start"
              ? "flex-start"
              : "flex-end",
        ...anchorStyle,
      }}
    >
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems:
            L.align === "center"
              ? "center"
              : L.align === "start"
                ? "flex-start"
                : "flex-end",
          gap: L.lineGap * style.text.primary.fontSize * scale,
          maxWidth: maxWidthPx,
          opacity: exOpacity,
          translate: exX || exY ? `${exX}px ${exY}px` : undefined,
          scale:
            exScale * pulse * fix.scale !== 1
              ? String(exScale * pulse * fix.scale)
              : undefined,
          transformOrigin:
            position === "bottom"
              ? "50% 100%"
              : position === "top"
                ? "50% 0%"
                : "50% 50%",
          filter: exBlur > 0.05 ? `blur(${exBlur}px)` : undefined,
          clipPath: exClip,
        }}
      >
        {!qcMask && fix.backing > 0 ? (
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: scrim.width * W,
              height: scrim.height * H,
              translate: "-50% -50%",
              background: `radial-gradient(closest-side, rgba(0,0,0,${0.75 * fix.backing}), rgba(0,0,0,${0.45 * fix.backing}) 55%, transparent)`,
              opacity: scrimIn,
              zIndex: 0,
              pointerEvents: "none",
            }}
          />
        ) : null}
        {qcMask ? null : scrim.type === "radial" ? (
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: scrim.width * W,
              height: scrim.height * H,
              translate: "-50% -50%",
              background: `radial-gradient(closest-side, ${scrim.color}, color-mix(in srgb, ${scrim.color} 58%, transparent) 52%, transparent)`,
              opacity: scrimIn,
              scale: `${lerp(0.82, 1, scrimIn)} 1`,
              zIndex: 0,
              pointerEvents: "none",
            }}
          />
        ) : scrim.type === "box" ? (
          <div
            style={{
              position: "absolute",
              inset: `-${0.35 * style.text.primary.fontSize * scale}px -${0.6 * style.text.primary.fontSize * scale}px`,
              borderRadius: 0.3 * style.text.primary.fontSize * scale,
              background: scrim.color,
              opacity: scrimIn,
              zIndex: 0,
            }}
          />
        ) : null}
        {page.lines.map((line, li) => {
          const track = tracks.get(line.track)!;
          const base = textStyleFor(style, track);
          const OUTLINE =
            "0 0 3px #000, 0 0 3px #000, 0 2px 8px rgba(0,0,0,.9)";
          const ts = fix.outline
            ? {
                ...base,
                shadow:
                  base.shadow === "none"
                    ? OUTLINE
                    : `${OUTLINE}, ${base.shadow}`,
                sungShadow:
                  base.sungShadow === "none"
                    ? OUTLINE
                    : `${OUTLINE}, ${base.sungShadow}`,
              }
            : base;
          const f = focus(line, page, t);
          let o = f.isFirst ? 1 : lerp(h.dimUpcoming, 1, f.up);
          o = lerp(o, h.dimFinished, f.down);
          let fontSize: number | undefined;
          if (fitRow) {
            const w = measureLine(line, track, style, ts.fontSize * scale);
            if (w > maxWidthPx) fontSize = (ts.fontSize * maxWidthPx) / w;
          }
          return (
            <LineView
              key={line.id}
              line={line}
              track={track}
              ts={ts}
              fontStack={fontStack(style, ts, track.script)}
              style={style}
              t={t}
              scale={scale}
              enterStart={page.enterStart + li * lineStagger}
              enterDur={ent}
              wordStagger={wordStagger}
              kinetic={L.type === "kinetic" && line.sung}
              pageStart={page.enterStart}
              opacity={o}
              fontSizeOverride={fontSize}
              nowrap={fitRow}
              mask={qcMask ? maskCss(li) : undefined}
            />
          );
        })}
      </div>
    </div>
  );
};
