import { createContext, useContext } from "react";
import type { FaceSample, Framing } from "../core/frame";
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
  /** How the source video sits in this output frame. */
  framing: Framing;
  /** Where the crop is centred over time (source fractions). */
  focus: (t: number) => { x: number; y: number };
  /** Face boxes in output-frame fractions, after any crop. */
  faces: FaceSample[];
  /** QC mask mode: draw each line in its own flat colour, no effects. */
  qcMask: boolean;
  /** Lyrics are off screen by this time (video end, or when end credits start). */
  lyricsEndBy: number;
  /** Per-screen fixes from project.json "adjust". */
  adjust: Record<string, { scale: number; backing: number; outline: boolean }>;
};

export const Ctx = createContext<RenderCtx | null>(null);

export function useRender(): RenderCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useRender() must be used inside <LyricVideo>");
  return c;
}
