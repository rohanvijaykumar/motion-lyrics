import { Audio, Video } from "@remotion/media";
import React from "react";
import {
  AbsoluteFill,
  CanvasImage,
  Img,
  OffthreadVideo,
  staticFile,
} from "remotion";
import { cropsHeavily, videoRect } from "../core/frame";
import type { Project } from "../schema/project";
import { useRender } from "./context";
import { cameraMove, moveCss } from "./effects/Camera";
import { lookEffects } from "./effects/Look";

/**
 * The picture under the lyrics. Video is placed with the framing rules in
 * core/frame.ts: when the output shape differs from the source (e.g. 9:16 from
 * 16:9 footage) the crop follows the faces; "blur" mode shows the whole video
 * over a soft, enlarged copy instead of cropping.
 *
 * OffthreadVideo extracts the exact frame for every render and still, so QC
 * frames and the final video always show the same picture. When the style has a
 * GPU look (effects.look), the picture goes through <Video> / <CanvasImage>,
 * which accept @remotion/effects chains and are frame-exact as well.
 */
export const Background: React.FC<{ project: Project }> = ({ project }) => {
  const {
    t,
    fps,
    framing,
    focus,
    style,
    scale,
    width: W,
    height: H,
  } = useRender();
  const bg = project.background;
  const media = project.media;
  const separateAudio = !!media.audio;
  const look = style.effects.look;
  const effects =
    look.type === "none" ? null : lookEffects(look, scale, Math.round(t * fps));
  const fill: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "fill",
  };
  const clip = (src: string, muted: boolean) =>
    effects ? (
      <Video
        src={src}
        muted={muted}
        objectFit="fill"
        effects={effects}
        style={{ width: "100%", height: "100%" }}
      />
    ) : (
      <OffthreadVideo src={src} muted={muted} style={fill} />
    );
  let layer: React.ReactNode = null;
  if (bg.type === "video" && media.video) {
    const src = staticFile(media.video);
    const c = cropsHeavily(framing) ? focus(t) : { x: 0.5, y: 0.5 };
    const r = videoRect(framing, c.x, c.y);
    const box = (rect: typeof r): React.CSSProperties => ({
      position: "absolute",
      left: rect.x,
      top: rect.y,
      width: rect.w,
      height: rect.h,
    });
    if (framing.mode === "blur") {
      const cover = videoRect({ ...framing, mode: "cover" });
      layer = (
        <>
          <div
            style={{
              ...box(cover),
              filter: "blur(40px) brightness(0.55)",
              scale: "1.08",
            }}
          >
            <OffthreadVideo src={src} muted style={fill} />
          </div>
          <div style={box(r)}>{clip(src, separateAudio)}</div>
        </>
      );
    } else {
      layer = <div style={box(r)}>{clip(src, separateAudio)}</div>;
    }
  } else if (bg.type === "image" && bg.src) {
    layer = effects ? (
      <CanvasImage
        src={staticFile(bg.src)}
        width={W}
        height={H}
        fit={bg.fit === "contain" ? "contain" : "cover"}
        effects={effects}
      />
    ) : (
      <Img
        src={staticFile(bg.src)}
        style={{
          width: W,
          height: H,
          objectFit: bg.fit === "contain" ? "contain" : "cover",
        }}
      />
    );
  } else if (bg.type === "gradient") {
    const angle = 135 + Math.sin(t * 0.15) * 25;
    layer = (
      <AbsoluteFill
        style={{
          background: `linear-gradient(${angle}deg, ${bg.colors.join(", ")})`,
        }}
      />
    );
  } else {
    layer = <AbsoluteFill style={{ background: bg.color }} />;
  }
  const cam = cameraMove(
    style.effects.camera,
    t,
    media.duration,
    W,
    scale,
  );
  return (
    <AbsoluteFill style={{ background: "#000", overflow: "hidden" }}>
      <AbsoluteFill style={moveCss(cam)}>{layer}</AbsoluteFill>
      {bg.dim > 0 ? (
        <AbsoluteFill style={{ background: `rgba(0,0,0,${bg.dim})` }} />
      ) : null}
      {separateAudio ? <Audio src={staticFile(media.audio!)} /> : null}
    </AbsoluteFill>
  );
};
