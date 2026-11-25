import { Audio, Video } from "@remotion/media";
import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import type { Project } from "../schema/project";
import { useRender } from "./context";

export const Background: React.FC<{ project: Project }> = ({ project }) => {
  const { t } = useRender();
  const bg = project.background;
  const media = project.media;
  const separateAudio = !!media.audio;
  let layer: React.ReactNode = null;
  if (bg.type === "video" && media.video) {
    layer = (
      <Video
        src={staticFile(media.video)}
        muted={separateAudio}
        objectFit={bg.fit}
        style={{ width: "100%", height: "100%" }}
      />
    );
  } else if (bg.type === "image" && bg.src) {
    layer = <Img src={staticFile(bg.src)} style={{ width: "100%", height: "100%", objectFit: bg.fit }} />;
  } else if (bg.type === "gradient") {
    const angle = 135 + Math.sin(t * 0.15) * 25;
    layer = <AbsoluteFill style={{ background: `linear-gradient(${angle}deg, ${bg.colors.join(", ")})` }} />;
  } else {
    layer = <AbsoluteFill style={{ background: bg.color }} />;
  }
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {layer}
      {bg.dim > 0 ? <AbsoluteFill style={{ background: `rgba(0,0,0,${bg.dim})` }} /> : null}
      {separateAudio ? <Audio src={staticFile(media.audio!)} /> : null}
    </AbsoluteFill>
  );
};
