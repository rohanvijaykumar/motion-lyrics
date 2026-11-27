import React from "react";
import { Composition } from "remotion";
import {
  calculateLyricMetadata,
  LyricVideo,
  LyricVideoSchema,
} from "./LyricVideo";

/**
 * One composition renders any project: the CLI points Remotion's public
 * directory at the project folder, and calculateMetadata reads its files.
 * Width, height, fps and duration below are placeholders replaced from project.json.
 */
export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="LyricVideo"
      component={LyricVideo}
      schema={LyricVideoSchema}
      calculateMetadata={calculateLyricMetadata}
      durationInFrames={300}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{
        debug: false,
        size: "source",
        aspect: "source",
        preset: "",
        qcMask: false,
      }}
    />
  );
};
