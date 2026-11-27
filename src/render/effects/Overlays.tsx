/**
 * Full-frame layers between the picture and the lyrics: film light leaks and
 * comic-book rays (@remotion/effects, WebGL), and an audio visualizer drawn
 * from the song itself (@remotion/media-utils).
 */
import { lightLeak } from "@remotion/effects/light-leak";
import { starburst } from "@remotion/effects/starburst";
import {
  createSmoothSvgPath,
  useWindowedAudioData,
  visualizeAudio,
  visualizeAudioWaveform,
} from "@remotion/media-utils";
import React, { useMemo } from "react";
import { AbsoluteFill, getStaticFiles, Solid, staticFile } from "remotion";
import type { Project } from "../../schema/project";
import { seg } from "../anim";
import { useRender } from "../context";

/** Moments a light leak washes over the frame, in seconds. */
export function lightLeakTimes(
  on: "start" | "sections" | "screens",
  groups: { section?: string; start: number }[],
): number[] {
  if (on === "start" || !groups.length) return [0];
  if (on === "screens") return groups.map((g) => g.start);
  const sections = groups.filter((g) => g.section).map((g) => g.start);
  return sections.length ? sections : [groups[0].start];
}

export const LightLeaks: React.FC = () => {
  const { t, style, song, width: W, height: H } = useRender();
  const ll = style.effects.lightLeaks;
  const times = useMemo(
    () =>
      lightLeakTimes(
        ll.on,
        song.groups.map((g) => ({
          section: g.section,
          start: Math.min(
            ...g.lines.flatMap((l) => l.words.map((w) => w.start)),
            g.lines[0]?.start ?? 0,
          ),
        })),
      ),
    [ll.on, song],
  );
  const active = times
    .map((at, i) => {
      const from = Math.max(0, at - ll.duration * 0.4);
      return { i, p: seg(t, from, ll.duration) };
    })
    .filter((x) => x.p > 0 && x.p < 1);
  if (!active.length) return null;
  return (
    <>
      {active.map(({ i, p }) => (
        <AbsoluteFill
          key={i}
          style={{ opacity: ll.opacity, mixBlendMode: "screen" }}
        >
          <Solid
            width={W}
            height={H}
            effects={[
              lightLeak({ seed: i * 3 + 1, hueShift: ll.hueShift, progress: p }),
            ]}
          />
        </AbsoluteFill>
      ))}
    </>
  );
};

export const StarburstLayer: React.FC<{
  rays: number;
  colors: string[];
  spin: number;
  opacity: number;
}> = ({ rays, colors, spin, opacity }) => {
  const { t, width: W, height: H } = useRender();
  return (
    <AbsoluteFill style={{ opacity, mixBlendMode: "overlay" }}>
      <Solid
        width={W}
        height={H}
        effects={[
          starburst({
            rays: Math.max(2, Math.round(rays)),
            colors: colors.length ? colors : ["rgba(255,255,255,0.2)"],
            rotation: (t * spin) % 360,
          }),
        ]}
      />
    </AbsoluteFill>
  );
};

/** The WAV the visualizer listens to: the project's own audio, or the pipeline's copy. */
export function visualizerSource(project: Project): string {
  const a = project.media.audio;
  return a && /\.wav$/i.test(a) ? a : "work/audio.wav";
}

/** The visualizer draws nothing (instead of failing) when the WAV is not in the project. */
export const Visualizer: React.FC<{ project: Project }> = ({ project }) => {
  const src = visualizerSource(project);
  const present = getStaticFiles().some((f) => f.name === src);
  return present ? <VisualizerBars src={src} /> : null;
};

const VisualizerBars: React.FC<{ src: string }> = ({ src }) => {
  const { t, fps, style, width: W, height: H, scale } = useRender();
  const v = style.effects.visualizer;
  const frame = Math.round(t * fps);
  const { audioData, dataOffsetInSeconds } = useWindowedAudioData({
    src: staticFile(src),
    frame,
    fps,
    windowInSeconds: 10,
  });
  if (!audioData) return null;
  const lyricsAt = style.layout.position;
  const pos =
    v.position !== "auto"
      ? v.position
      : lyricsAt === "bottom"
        ? "top"
        : "bottom";
  const h = v.height * H;
  const top = pos === "top" ? H * 0.04 : pos === "center" ? (H - h) / 2 : H - h - H * 0.04;
  const n = Math.max(8, Math.min(256, Math.round(v.bars)));
  let body: React.ReactNode;
  if (v.type === "wave") {
    const wave = visualizeAudioWaveform({
      audioData,
      frame,
      fps,
      windowInSeconds: 0.5,
      numberOfSamples: 128,
      dataOffsetInSeconds,
    });
    const points = wave.map((y, i) => ({
      x: (i / (wave.length - 1)) * W,
      y: h / 2 + y * h * 0.45,
    }));
    body = (
      <path
        d={createSmoothSvgPath({ points })}
        fill="none"
        stroke={v.color}
        strokeWidth={4 * scale}
        strokeLinecap="round"
      />
    );
  } else {
    let samples = 32;
    while (samples < n * 2) samples *= 2;
    const freqs = visualizeAudio({
      audioData,
      frame,
      fps,
      numberOfSamples: samples,
      optimizeFor: "speed",
      dataOffsetInSeconds,
    }).slice(0, n);
    const gap = 0.35;
    const bw = W / n;
    body = freqs.map((f, i) => {
      const mag = Math.min(1, Math.sqrt(f) * 1.6);
      const bh = Math.max(2 * scale, mag * h * (v.type === "mirror" ? 0.5 : 1));
      const y =
        v.type === "mirror" ? h / 2 - bh : pos === "top" ? 0 : h - bh;
      return (
        <rect
          key={i}
          x={i * bw + (bw * gap) / 2}
          y={y}
          width={bw * (1 - gap)}
          height={v.type === "mirror" ? bh * 2 : bh}
          rx={(bw * (1 - gap)) / 2}
          fill={v.color}
        />
      );
    });
  }
  return (
    <svg
      width={W}
      height={h}
      style={{ position: "absolute", left: 0, top, overflow: "visible" }}
    >
      {body}
    </svg>
  );
};
