import { createContext, useContext } from "react";
import type { Analysis, Song, Track } from "../schema/song";
import type { Style } from "../schema/style";

export type RenderCtx = {
  /** Current time in seconds from the start of the video. */
  t: number;
  fps: number;
  width: number;
  height: number;
  /** Multiply style pixel sizes by this (sizes are written for a 1080px frame). */
  scale: number;
  style: Style;
  song: Song;
  analysis: Analysis | null;
  tracks: Map<string, Track>;
};

export const Ctx = createContext<RenderCtx | null>(null);

export function useRender(): RenderCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useRender() must be used inside <LyricVideo>");
  return c;
}
