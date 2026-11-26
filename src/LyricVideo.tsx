/**
 * The main composition. It reads the project folder (Remotion's public dir):
 *   project.json   settings and style        (edited by people)
 *   song.json      timed lyrics              (generated, editable)
 *   analysis.json  beats, faces, loudness    (generated, optional)
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  AbsoluteFill,
  cancelRender,
  continueRender,
  delayRender,
  getStaticFiles,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  type CalculateMetadataFunction,
} from "remotion";
import { parseFontFile } from "./core/fontfiles";
import { z } from "zod";
import {
  facesInOutput,
  focusTrack,
  outputSize,
  type Framing,
} from "./core/frame";
import { detectScript } from "./core/script";
import { lyricsEndBy } from "./core/timeline";
import { Ctx, type RenderCtx } from "./render/context";
import { Grain, Particles, Vignette } from "./render/effects/Global";
import {
  fontStack,
  loadGoogleFonts,
  loadLocalFonts,
  type FontNeed,
} from "./render/fonts";
import { Background } from "./render/Background";
import { GraphicsLayer, sectionGraphics } from "./render/Graphics";
import { LyricsLayer } from "./render/Lyrics";
import { TimingOverlay } from "./render/TimingOverlay";
import { ProjectSchema, type Project } from "./schema/project";
import {
  AnalysisSchema,
  SongSchema,
  type Analysis,
  type Song,
} from "./schema/song";
import type { Style } from "./schema/style";
import { resolveStyle, textStyleFor } from "./style/resolve";

export const LyricVideoSchema = z.object({
  debug: z.boolean().default(false).describe("Show the timing overlay"),
  size: z
    .enum(["source", "1080", "4k"])
    .default("source")
    .describe("Output resolution (short side 1080 or 2160)"),
  aspect: z
    .enum(["source", "16:9", "9:16"])
    .default("source")
    .describe("Output shape"),
  qcMask: z
    .boolean()
    .default(false)
    .describe(
      "QC only: draw lyrics as flat colours on black so their exact position can be measured",
    ),
});

type InputProps = z.infer<typeof LyricVideoSchema>;
type Loaded = {
  project: Project;
  song: Song;
  analysis: Analysis | null;
  style: Style;
};
type Props = InputProps & { loaded?: Loaded };

async function getJson(
  name: string,
  required: boolean,
  signal?: AbortSignal,
): Promise<unknown | null> {
  const res = await fetch(staticFile(name), { signal });
  if (!res.ok) {
    if (!required) return null;
    throw new Error(
      `Could not load ${name} from the project folder (HTTP ${res.status}). Run "npm run make -- <project>" first, or start Studio with "npm run studio -- <project>".`,
    );
  }
  return res.json();
}

function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown, file: string): T {
  const r = schema.safeParse(data);
  if (!r.success) {
    const issues = r.error.issues
      .slice(0, 12)
      .map((i) => `  ${file} ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(
      `${file} is not valid:\n${issues}\nRun "npm run validate -- <project>" for details.`,
    );
  }
  return r.data;
}

export const calculateLyricMetadata: CalculateMetadataFunction<Props> = async ({
  props,
  abortSignal,
}) => {
  const project = parseOrThrow(
    ProjectSchema,
    await getJson("project.json", true, abortSignal),
    "project.json",
  );
  // Font files dropped into the project's fonts/ folder are picked up automatically.
  const known = new Set(project.localFonts.map((f) => f.src));
  for (const file of getStaticFiles()) {
    if (!file.name.startsWith("fonts/") || known.has(file.name)) continue;
    const parsed = parseFontFile(file.name);
    if (parsed) project.localFonts.push(parsed);
  }
  const song = parseOrThrow(
    SongSchema,
    await getJson("song.json", true, abortSignal),
    "song.json",
  );
  const rawAnalysis = await getJson("analysis.json", false, abortSignal);
  const analysis = rawAnalysis
    ? parseOrThrow(AnalysisSchema, rawAnalysis, "analysis.json")
    : null;
  const style = resolveStyle(project.style as Record<string, unknown>);
  const fps = project.output.fps ?? project.media.fps;
  const duration = project.media.duration;
  const size = props.size ?? "source";
  const aspect = props.aspect ?? "source";
  const { width, height } =
    size === "source" && aspect === "source"
      ? outputSize(
          project.output.width ?? project.media.width,
          project.output.height ?? project.media.height,
          "source",
          "source",
        )
      : outputSize(project.media.width, project.media.height, size, aspect);
  return {
    durationInFrames: Math.max(1, Math.round(duration * fps)),
    fps,
    width,
    height,
    props: { ...props, loaded: { project, song, analysis, style } },
    defaultOutName:
      project.output.file?.replace(/\.mp4$/i, "") ?? "lyric-video",
  };
};

/** Collect every (font, weight, characters) the video needs. */
function fontNeeds(l: Loaded): FontNeed[] {
  const { song, style, project } = l;
  const tracks = new Map(song.tracks.map((t) => [t.id, t]));
  const needs: FontNeed[] = [];
  for (const g of song.groups) {
    for (const line of g.lines) {
      const track = tracks.get(line.track);
      if (!track) continue;
      const ts = textStyleFor(style, track);
      let text = line.words.map((w) => w.text).join(" ");
      if (ts.textTransform === "uppercase") text = text.toUpperCase();
      for (const family of fontStack(style, ts, track.script))
        needs.push({ family, weight: ts.fontWeight, italic: ts.italic, text });
    }
  }
  const extra: string[] = [];
  for (const gr of project.graphics) {
    if (gr.type === "title")
      extra.push(
        gr.title,
        gr.subtitle ?? "",
        (gr.subtitle ?? "").toUpperCase(),
      );
    if (gr.type === "text") extra.push(gr.text);
    if (gr.type === "lowerThird") extra.push(gr.title, gr.subtitle ?? "");
    if (gr.type === "credits") extra.push(...gr.lines);
  }
  if (project.sectionLabels)
    for (const g of song.groups)
      if (g.section) extra.push(g.section.toUpperCase());
  for (const text of extra.filter(Boolean)) {
    const script = detectScript(text);
    for (const family of fontStack(style, style.text.primary, script))
      for (const weight of [500, 600, 700, 800])
        needs.push({
          family,
          weight,
          italic: false,
          text: text + "0123456789",
        });
  }
  return needs;
}

const FontGate: React.FC<{ loaded: Loaded; children: React.ReactNode }> = ({
  loaded,
  children,
}) => {
  const [ready, setReady] = useState(false);
  const [handle] = useState(() =>
    delayRender("Loading fonts for every script in the lyrics", {
      timeoutInMilliseconds: 120000,
    }),
  );
  useEffect(() => {
    Promise.all([
      loadGoogleFonts(fontNeeds(loaded)),
      loadLocalFonts(loaded.project.localFonts),
    ])
      .then(() => {
        setReady(true);
        continueRender(handle);
      })
      .catch((e) =>
        cancelRender(
          new Error(
            `Font loading failed (check your internet connection): ${e}`,
          ),
        ),
      );
  }, [loaded, handle]);
  return ready ? <>{children}</> : null;
};

export const LyricVideo: React.FC<Props> = ({ debug, qcMask, loaded }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const tracks = useMemo(
    () => new Map((loaded?.song.tracks ?? []).map((t) => [t.id, t])),
    [loaded],
  );
  const framing: Framing = useMemo(
    () => ({
      mode: loaded?.project.background.fit ?? "cover",
      srcW: loaded?.project.media.width ?? width,
      srcH: loaded?.project.media.height ?? height,
      W: width,
      H: height,
    }),
    [loaded, width, height],
  );
  const rawFaces = loaded?.analysis?.faces;
  const focus = useMemo(() => focusTrack(rawFaces ?? []), [rawFaces]);
  const faces = useMemo(
    () => facesInOutput(framing, rawFaces ?? []),
    [framing, rawFaces],
  );
  const sections = useMemo(() => {
    if (!loaded?.project.sectionLabels) return [];
    return sectionGraphics(
      loaded.song.groups
        .filter((g) => g.section)
        .map((g) => ({
          name: g.section!,
          start: Math.min(
            ...g.lines.flatMap((l) => l.words.map((w) => w.start)),
          ),
        })),
    );
  }, [loaded]);
  if (!loaded) return <AbsoluteFill style={{ background: "#000" }} />;
  const { project, song, analysis, style } = loaded;
  const ctx: RenderCtx = {
    t: frame / fps,
    fps,
    width,
    height,
    scale: Math.min(width, height) / 1080,
    style,
    song,
    analysis,
    tracks,
    framing,
    focus,
    faces,
    qcMask: !!qcMask,
    lyricsEndBy: lyricsEndBy(song.duration, project.graphics),
    adjust:
      project.adjust[
        width > height ? "landscape" : height > width ? "portrait" : "square"
      ] ?? {},
  };
  const fx = style.effects;
  if (qcMask) {
    // QC measurement frame: lyrics only, flat colours, nothing else.
    return (
      <Ctx.Provider value={ctx}>
        <AbsoluteFill style={{ background: "#000", overflow: "hidden" }}>
          <FontGate loaded={loaded}>
            <AbsoluteFill>
              <LyricsLayer />
            </AbsoluteFill>
          </FontGate>
        </AbsoluteFill>
      </Ctx.Provider>
    );
  }
  return (
    <Ctx.Provider value={ctx}>
      <AbsoluteFill style={{ background: "#000", overflow: "hidden" }}>
        <Background project={project} />
        <FontGate loaded={loaded}>
          {fx.vignette.enabled ? <Vignette style={style} /> : null}
          {fx.particles.enabled ? <Particles /> : null}
          <AbsoluteFill>
            <LyricsLayer />
          </AbsoluteFill>
          <GraphicsLayer graphics={[...sections, ...project.graphics]} />
          {fx.grain.enabled ? <Grain /> : null}
          {debug ? <TimingOverlay /> : null}
        </FontGate>
      </AbsoluteFill>
    </Ctx.Provider>
  );
};
