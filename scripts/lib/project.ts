/** Project folders: create, locate and load. */
import fs from "node:fs";
import path from "node:path";
import {
  ProjectSchema,
  type Project,
  type ProjectInput,
} from "../../src/schema/project";
import { deepMerge } from "../../src/core/merge";
import { PRESET_NAMES } from "../../src/style/presets";
import { needsTranscode, probe, transcode } from "./media";
import {
  applyChoices,
  customPresets,
  houseConfig,
  installFont,
  styleForPreset,
  type Choices,
} from "./prefs";
import {
  PROJECTS,
  ROOT,
  exists,
  fail,
  info,
  ok,
  readJson,
  slug,
  warn,
  writeJson,
} from "./util";

export type Paths = {
  dir: string;
  project: string;
  lyrics: string;
  song: string;
  analysis: string;
  work: string;
  review: string;
  out: string;
  media: string;
};

export function paths(dir: string): Paths {
  return {
    dir,
    project: path.join(dir, "project.json"),
    lyrics: path.join(dir, "lyrics.txt"),
    song: path.join(dir, "song.json"),
    analysis: path.join(dir, "analysis.json"),
    work: path.join(dir, "work"),
    review: path.join(dir, "review"),
    out: path.join(dir, "out"),
    media: path.join(dir, "media"),
  };
}

/** A project name ("my-song") lives in projects/; a path ("D:/videos/x") is used as given. */
export function resolveDir(nameOrPath: string): string {
  if (
    path.isAbsolute(nameOrPath) ||
    nameOrPath.includes("/") ||
    nameOrPath.includes("\\")
  )
    return path.resolve(nameOrPath);
  return path.join(PROJECTS, nameOrPath);
}

export function loadProject(dir: string): { p: Paths; project: Project } {
  const p = paths(dir);
  if (!exists(p.project))
    fail(
      `No project at ${dir}. Create one with: npm run make -- --video <file> --lyrics <file>`,
    );
  const parsed = ProjectSchema.safeParse(readJson(p.project));
  if (!parsed.success) {
    fail(
      `project.json is not valid:\n${parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n")}`,
    );
  }
  const preset =
    (parsed.data.style as { preset?: string }).preset ?? "golden-sparkle";
  if (!PRESET_NAMES.includes(preset)) {
    // A custom preset named by hand: expand it into the project so every tool (and Studio) can read it.
    if (!customPresets().some((c) => c.name === preset)) {
      fail(
        `Unknown style preset "${preset}". Built-in: ${PRESET_NAMES.join(", ")}${
          customPresets().length
            ? `; yours: ${customPresets()
                .map((c) => c.name)
                .join(", ")}`
            : ""
        }`,
      );
    }
    const overrides: Record<string, unknown> = {
      ...(parsed.data.style as Record<string, unknown>),
    };
    delete overrides.preset;
    const raw = readJson<Record<string, unknown>>(p.project);
    raw.style = deepMerge(styleForPreset(preset), overrides);
    writeJson(p.project, raw);
    info(`Expanded your preset "${preset}" into project.json`);
    return loadProject(dir);
  }
  return { p, project: parsed.data };
}

function linkOrCopy(src: string, dst: string) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  if (fs.existsSync(dst)) fs.rmSync(dst);
  try {
    fs.linkSync(src, dst);
  } catch {
    fs.copyFileSync(src, dst);
  }
}

export type NewOptions = {
  name?: string;
  video?: string;
  audio?: string;
  lyrics?: string;
  langs?: string[];
  title?: string;
  artist?: string;
  choices: Choices;
};

export async function createProject(o: NewOptions): Promise<string> {
  const source = o.video ?? o.audio;
  if (!source)
    fail(
      "Give a video with --video <file> (or an audio file with --audio <file>).",
    );
  const src = path.resolve(source);
  if (!exists(src)) fail(`File not found: ${src}`);
  if (o.lyrics && !exists(path.resolve(o.lyrics)))
    fail(`Lyrics file not found: ${path.resolve(o.lyrics)}`);
  const baseStyle = styleForPreset(o.choices.preset); // validates the name early
  const name = o.name ?? slug(path.basename(src, path.extname(src)));
  const dir = resolveDir(name);
  const p = paths(dir);
  if (exists(p.project))
    fail(
      `Project "${name}" already exists at ${dir}. Run: npm run make -- ${name}`,
    );
  fs.mkdirSync(p.media, { recursive: true });

  const meta = await probe(src);
  info(
    `Source: ${meta.hasVideo ? `${meta.width}x${meta.height} ${meta.videoCodec} @ ${meta.fps} fps, ` : "audio only, "}${meta.duration.toFixed(2)}s`,
  );
  if (!meta.hasAudio)
    fail(`${src} has no audio track. Lyric alignment needs the song's audio.`);
  const project: ProjectInput = {
    $schema: path
      .relative(dir, path.join(ROOT, "schema", "project.schema.json"))
      .split(path.sep)
      .join("/"),
    title: o.title,
    artist: o.artist,
    media: {
      duration: meta.duration,
      width: meta.width,
      height: meta.height,
      fps: meta.fps,
    },
  };
  const house = houseConfig();
  const family = o.choices.font ? installFont(dir, o.choices.font) : undefined;
  project.style = applyChoices(
    deepMerge(baseStyle, house.style ?? {}),
    o.choices,
    family,
  ) as ProjectInput["style"];
  if (house.graphics) {
    // Logos and Lottie files from the house config are copied into the project.
    project.graphics = (house.graphics as Record<string, unknown>[])
      .map((g) => {
        if (
          (g.type === "image" || g.type === "lottie") &&
          typeof g.src === "string"
        ) {
          const from = path.isAbsolute(g.src) ? g.src : path.join(ROOT, g.src);
          if (!exists(from)) {
            warn(`House config graphic not found, skipped: ${g.src}`);
            return null;
          }
          const dst = path.join(p.media, path.basename(from));
          fs.copyFileSync(from, dst);
          return { ...g, src: `media/${path.basename(from)}` };
        }
        return g;
      })
      .filter(Boolean) as ProjectInput["graphics"];
  }
  if (house.pipeline)
    project.pipeline = house.pipeline as ProjectInput["pipeline"];
  if (meta.hasVideo && o.video) {
    const dst = path.join(p.media, "video.mp4");
    if (needsTranscode(meta, src)) {
      info(
        "Converting the video to H.264 so every renderer can read it (one time)",
      );
      await transcode(src, dst);
    } else {
      linkOrCopy(src, dst);
    }
    project.media.video = "media/video.mp4";
    project.background = deepMerge(
      { type: "video" },
      house.background ?? {},
    ) as ProjectInput["background"];
  } else {
    const ext = path.extname(src).toLowerCase() || ".mp3";
    linkOrCopy(src, path.join(p.media, `audio${ext}`));
    project.media.audio = `media/audio${ext}`;
    project.media.width = 1920;
    project.media.height = 1080;
    project.media.fps = 30;
    project.background = deepMerge(
      { type: "gradient" },
      house.background ?? {},
    ) as ProjectInput["background"];
    warn(
      "No video given: using an animated gradient background. Set background in project.json to change it.",
    );
  }
  if (o.lyrics) {
    let text = fs
      .readFileSync(path.resolve(o.lyrics), "utf8")
      .replace(/^\uFEFF/, "");
    if (o.langs?.length && !/^@lang/m.test(text))
      text = `@lang: ${o.langs.join(", ")}\n${text}`;
    fs.writeFileSync(p.lyrics, text, "utf8");
  }
  writeJson(p.project, ProjectSchema.parse(project));
  ok(`Created project ${name} at ${dir}`);
  return dir;
}
