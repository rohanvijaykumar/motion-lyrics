/** The lyrics layer: schedules pages, places them and renders the active ones. */
import React, { useMemo } from "react";
import { CameraMotionBlur, Trail } from "@remotion/motion-blur";
import { AbsoluteFill, Sequence, useCurrentFrame } from "remotion";
import { pageEnd, paginate, schedule } from "../core/timeline";
import { seg } from "./anim";
import { Ctx, useRender } from "./context";
import { moveCss, shakeMove } from "./effects/Camera";
import { Band } from "./effects/Global";
import {
  choosePosition,
  measureLine,
  pageHeight,
  type Position,
} from "./layout";
import { PageView } from "./Page";
import { ScrollView } from "./Scroll";

/**
 * Motion blur (@remotion/motion-blur) re-renders the layer at earlier frames.
 * The lyric components read time from context, so this bridge refreshes it
 * from the (frozen) frame each copy is drawn at.
 */
const TimeBridge: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const ctx = useRender();
  const frame = useCurrentFrame();
  return <Ctx.Provider value={{ ...ctx, t: frame / ctx.fps }}>{children}</Ctx.Provider>;
};

/** Handheld wobble of the whole lyric layer (also in QC masks, so measured positions match). */
const Shake: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t, style, analysis, scale } = useRender();
  if (!style.effects.shake.enabled) return <>{children}</>;
  const m = shakeMove(style.effects.shake, t, analysis?.beats, scale);
  return <AbsoluteFill style={moveCss(m)}>{children}</AbsoluteFill>;
};

export const LyricsLayer: React.FC = () => {
  const { style, qcMask } = useRender();
  const mb = style.effects.motionBlur;
  const inner = (
    <Shake>
      <LyricsPages />
    </Shake>
  );
  if (mb.type === "none" || qcMask) return inner;
  const samples = Math.max(2, Math.min(16, Math.round(mb.samples)));
  return mb.type === "trail" ? (
    <Trail layers={samples} lagInFrames={Math.max(0.1, mb.lag)} trailOpacity={0.5}>
      <TimeBridge>{inner}</TimeBridge>
    </Trail>
  ) : (
    <CameraMotionBlur samples={samples} shutterAngle={Math.max(0, Math.min(360, mb.shutter))}>
      <TimeBridge>{inner}</TimeBridge>
    </CameraMotionBlur>
  );
};

const LyricsPages: React.FC = () => {
  const ctx = useRender();
  const {
    style,
    song,
    faces,
    fps,
    width: W,
    height: H,
    scale,
    tracks,
    t,
  } = ctx;
  const maxWidthPx =
    W * Math.min(style.layout.maxWidth, 1 - 2 * style.layout.marginX);

  const plan = useMemo(() => {
    if (style.layout.type === "scroll") return null;
    const pages = schedule(
      paginate(song, style),
      style,
      song.duration,
      ctx.lyricsEndBy,
    );
    const heights = pages.map((p) =>
      pageHeight(p, style, tracks, scale, maxWidthPx),
    );
    const widths = pages.map((p) =>
      Math.min(
        maxWidthPx,
        Math.max(
          ...p.lines.map((l) =>
            measureLine(
              l,
              tracks.get(l.track)!,
              style,
              style.text.primary.fontSize * scale,
            ),
          ),
        ),
      ),
    );
    const rowH =
      Math.max(0, ...heights) +
      style.layout.lineGap * style.text.primary.fontSize * scale * 3;
    const positions: Position[] = pages.map((p, i) => {
      const h = style.layout.type === "alternate" ? rowH * 2 : heights[i];
      return choosePosition(p, style, faces, W, H, widths[i], h);
    });
    return { pages, positions, rowH };
  }, [style, song, faces, tracks, scale, maxWidthPx, W, H]);

  if (!plan) return <ScrollView />;
  const { pages, positions, rowH } = plan;

  // Subtitle band (linear scrim): visible while any page is up, bridging short gaps.
  let band = 0;
  let bandEdge: "bottom" | "top" = "bottom";
  if (style.effects.scrim.type === "linear") {
    pages.forEach((p, i) => {
      const end = pageEnd(p);
      const v = seg(t, p.enterStart - 0.1, 0.3) * (1 - seg(t, end + 0.25, 0.3));
      if (v > band) {
        band = v;
        bandEdge = positions[i] === "top" ? "top" : "bottom";
      }
    });
  }

  return (
    <>
      {band > 0 && !ctx.qcMask ? <Band visible={band} edge={bandEdge} /> : null}
      {pages.map((p, i) => {
        const from = Math.max(0, Math.floor(p.enterStart * fps));
        const to = Math.min(
          Math.ceil(song.duration * fps) + 1,
          Math.ceil(pageEnd(p) * fps) + 1,
        );
        if (to <= from) return null;
        const pos = positions[i];
        // alternate layout: slot 0 sits one row further from the edge than slot 1.
        const offset =
          style.layout.type === "alternate" && p.slot === 0
            ? pos === "top"
              ? 0
              : rowH
            : style.layout.type === "alternate" && pos === "top"
              ? rowH
              : 0;
        return (
          <Sequence
            key={p.id}
            from={from}
            durationInFrames={to - from}
            layout="none"
            name={`Lyrics ${p.id}`}
          >
            <PageView page={p} position={pos} rowOffsetPx={offset} />
          </Sequence>
        );
      })}
    </>
  );
};
