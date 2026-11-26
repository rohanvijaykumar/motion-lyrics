/**
 * motion-lyrics command line. Run through npm, e.g.
 *
 *   npm run make -- --video song.mp4 --lyrics lyrics.txt
 *
 * Every command prints what it is doing and stops with a clear message if
 * something is wrong. See docs/cli.md for the full reference.
 */
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { z } from "zod";
import { parseLyrics } from "../src/core/lyrics";
import { ProjectSchema } from "../src/schema/project";
import { SongSchema, type Song } from "../src/schema/song";
import { StyleSchema } from "../src/schema/style";
import { PRESET_NAMES } from "../src/style/presets";
import { resolveStyle } from "../src/style/resolve";
import { extractAudio, ffBinaries } from "./lib/media";
import {
  createProject,
  loadProject,
  resolveDir,
  type Paths,
} from "./lib/project";
import { applyCleanup, cleanupPlan, human } from "./lib/cleanup";
import {
  askChoices,
  houseConfig,
  listPresets,
  type Choices,
} from "./lib/prefs";
import {
  checkFonts,
  formatLabel,
  runQc,
  verifyVideo,
  type Format,
  type QcResult,
} from "./lib/qc";
import { renderStills, renderVideo } from "./lib/render";
import { makeReview } from "./lib/review";
import {
  buildSong,
  lyricsForAligner,
  validateSong,
  type Alignment,
} from "./lib/song";
import {
  CliError,
  PIPELINE,
  PROJECTS,
  ROOT,
  bold,
  cyan,
  dim,
  exists,
  fail,
  green,
  info,
  mtime,
  ok,
  py,
  installUv,
  uvPath,
  readJson,
  red,
  run,
  step,
  warn,
  writeJson,
  yellow,
} from "./lib/util";

// ------------------------------------------------------------------ arguments

type Args = { _: string[]; [k: string]: string | boolean | string[] };

function parseArgs(argv: string[]): Args {
  const a: Args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const s = argv[i];
    if (s.startsWith("--")) {
      const [k, v] = s.slice(2).split("=", 2);
      if (v !== undefined) a[k] = v;
      else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith("--"))
        a[k] = argv[++i];
      else a[k] = true;
    } else a._.push(s);
  }
  return a;
}
const str = (a: Args, k: string) =>
  typeof a[k] === "string" ? (a[k] as string) : undefined;
const num = (a: Args, k: string) => {
  const v = str(a, k);
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) fail(`--${k} must be a number, got "${v}"`);
  return n;
};
const flag = (a: Args, k: string) => a[k] === true || a[k] === "true";

function projectFrom(a: Args): string {
  const name = a._[0];
  if (!name)
    fail(
      "Which project? Give its name (from projects/) or folder path, e.g. npm run render -- my-song",
    );
  return resolveDir(name);
}

// ------------------------------------------------------------------- stages

function sourceMedia(
  p: Paths,
  project: ReturnType<typeof loadProject>["project"],
): string {
  const rel = project.media.audio ?? project.media.video;
  if (!rel) fail("project.json has no media.video or media.audio");
  const file = path.join(p.dir, rel);
  if (!exists(file)) fail(`Media file missing: ${file}`);
  return file;
}

async function stageAudio(p: Paths, src: string, force: boolean) {
  const wav = path.join(p.work, "audio.wav");
  if (!force && mtime(wav) >= mtime(src)) return ok("Audio already extracted");
  await extractAudio(src, wav);
  ok("Extracted audio");
}

function stageLyrics(
  p: Paths,
  tokenize: Record<string, "word" | "char">,
): { parsed: ReturnType<typeof parseLyrics> } {
  const text = fs.readFileSync(p.lyrics, "utf8");
  const parsed = parseLyrics(text, { tokenize });
  for (const w of parsed.warnings) warn(w);
  const sung = parsed.groups.flatMap((g) => g.lines.filter((l) => l.sung));
  if (!sung.length) fail("lyrics.txt has no sung lines.");
  info(
    `${parsed.groups.length} screens, ${sung.length} sung lines, ${sung.reduce((n, l) => n + l.words.length, 0)} words`,
  );
  info(
    `Languages: ${parsed.tracks.map((t) => `${t.lang} (${t.script}${t.role === "companion" ? ", translation" : ""}${t.dir === "rtl" ? ", right-to-left" : ""})`).join(", ")}`,
  );
  writeJson(path.join(p.work, "lyrics.json"), lyricsForAligner(parsed));
  return { parsed };
}

function stageBuild(
  p: Paths,
  parsed: ReturnType<typeof parseLyrics>,
  duration: number,
): Song {
  const alignment = readJson<Alignment>(path.join(p.work, "alignment.json"));
  const previous = exists(p.song)
    ? SongSchema.safeParse(readJson(p.song))
    : null;
  const { song, kept, notes } = buildSong(
    parsed,
    alignment,
    duration,
    previous?.success ? previous.data : null,
  );
  for (const n of notes) warn(n);
  if (kept.length)
    ok(`Kept ${kept.length} hand-corrected line(s): ${kept.join(", ")}`);
  const issues = validateSong(song, duration);
  for (const i of issues)
    (i.level === "error" ? warn : info)(`${i.level}: ${i.where}: ${i.message}`);
  if (issues.some((i) => i.level === "error"))
    fail("song.json has errors (listed above).");
  writeJson(p.song, song);
  ok(`Wrote ${p.song}`);
  return song;
}

async function alignAll(
  p: Paths,
  project: ReturnType<typeof loadProject>["project"],
  a: Args,
) {
  const force = flag(a, "force");
  const fast = flag(a, "fast");
  step("Extract the song's audio");
  await stageAudio(p, sourceMedia(p, project), force);

  step("Isolate the vocal");
  await py(
    [
      "separate",
      "--project",
      p.dir,
      ...(force ? ["--force"] : []),
      ...(project.pipeline.separate ? [] : ["--off"]),
    ],
    "Vocal separation",
  );

  let transcribed = false;
  if (!exists(p.lyrics)) {
    step("No lyrics.txt: writing a draft with speech recognition");
    warn(
      "Speech recognition makes mistakes on songs. Check lyrics.txt afterwards and run make again.",
    );
    await py(
      [
        "transcribe",
        "--project",
        p.dir,
        "--model",
        project.pipeline.whisperModel,
        ...(str(a, "lang")
          ? ["--language", str(a, "lang")!.split(",")[0]]
          : []),
      ],
      "Transcription",
    );
    transcribed = true;
  }

  step("Read the lyrics");
  const { parsed } = stageLyrics(p, project.tokenize);

  step("Analyse beats, loudness and faces");
  const video = project.media.video
    ? path.join(p.dir, project.media.video)
    : null;
  if (
    force ||
    mtime(p.analysis) <
      Math.max(mtime(path.join(p.work, "vocals.wav")), video ? mtime(video) : 0)
  ) {
    await py(
      [
        "analyze",
        "--project",
        p.dir,
        "--duration",
        String(project.media.duration),
        ...(video ? ["--video", video] : []),
        ...(project.pipeline.faces ? [] : ["--no-faces"]),
      ],
      "Analysis",
    );
  } else ok("Analysis is up to date");

  if (project.pipeline.verify && !fast) {
    step("Listen with Whisper (anchors and a second opinion)");
    await py(
      ["listen", "--project", p.dir, "--model", project.pipeline.whisperModel],
      "Whisper",
    );
  } else {
    step("Skipping Whisper (fast mode): timing will not be cross-checked");
  }

  step("Align every word");
  await py(
    [
      "align",
      "--project",
      p.dir,
      ...(project.pipeline.verify && !fast ? [] : ["--no-anchors"]),
    ],
    "Alignment",
  );

  step("Build song.json");
  const song = stageBuild(p, parsed, project.media.duration);
  return { song, transcribed };
}

// ------------------------------------------------------------------ commands

/** Style, position and face avoidance: asked before a new video starts (or taken from flags). */
async function gatherChoices(a: Args): Promise<Choices> {
  const house = houseConfig();
  const afRaw = a["avoid-faces"];
  const afGiven = afRaw !== undefined;
  const afFlag =
    afRaw === true ||
    ["on", "true", "yes", "1"].includes(String(afRaw).toLowerCase());
  const pos = str(a, "position") ?? house.position ?? "bottom";
  if (!["bottom", "center", "top"].includes(pos))
    fail(`--position must be bottom, center or top (got "${pos}")`);
  const defaults: Choices = {
    preset: str(a, "preset") ?? house.preset ?? "golden-sparkle",
    position: pos as Choices["position"],
    avoidFaces: afGiven ? afFlag : (house.avoidFaces ?? false),
    font: str(a, "font") ?? house.font,
    color: str(a, "color") ?? house.color,
  };
  const allGiven = !!str(a, "preset") && !!str(a, "position") && afGiven;
  if (
    !allGiven &&
    process.stdin.isTTY &&
    !flag(a, "yes") &&
    house.ask !== false
  )
    return askChoices(defaults);
  if (!allGiven) {
    warn(
      `Using style "${defaults.preset}", lyrics at the ${defaults.position}, face avoidance ${defaults.avoidFaces ? "on" : "off"}.` +
        " Choose with --preset, --position and --avoid-faces on|off (AI agents: ask the person first).",
    );
  }
  return defaults;
}

/** Export formats from --size / --aspect / --all, else house defaults, else the source format. */
function formatsFrom(a: Args, project?: { output?: unknown }): Format[] {
  const house = houseConfig().export ?? {};
  void project;
  const mk = (size: Format["size"], aspect: Format["aspect"]): Format => ({
    size,
    aspect,
    label: formatLabel(size, aspect),
  });
  if (flag(a, "all") || (!str(a, "size") && !str(a, "aspect") && house.all)) {
    return [
      mk("1080", "16:9"),
      mk("1080", "9:16"),
      mk("4k", "16:9"),
      mk("4k", "9:16"),
    ];
  }
  const sizeRaw = (str(a, "size") ?? house.size ?? "source")
    .toLowerCase()
    .replace(/p$/, "");
  const aspectRaw = str(a, "aspect") ?? house.aspect ?? "source";
  const size = (sizeRaw === "2160" ? "4k" : sizeRaw) as Format["size"];
  if (!["source", "1080", "4k"].includes(size))
    fail(`--size must be 1080 or 4k (got "${sizeRaw}")`);
  if (!["source", "16:9", "9:16"].includes(aspectRaw))
    fail(`--aspect must be 16:9 or 9:16 (got "${aspectRaw}")`);
  return [mk(size, aspectRaw as Format["aspect"])];
}

const outFile = (p: Paths, base: string, fmt: Format) =>
  path.join(
    p.out,
    fmt.label === "source" ? `${base}.mp4` : `${base}-${fmt.label}.mp4`,
  );

/** QC (with fixes), render, then confirm the video matches what QC checked. For each format. */
async function renderFormats(
  p: Paths,
  formats: Format[],
  a: Args,
): Promise<{ file: string; fmt: Format; qc: QcResult | null }[]> {
  const project = loadProject(p.dir).project;
  const song = SongSchema.parse(readJson(p.song));
  const base = (project.output.file ?? `${path.basename(p.dir)}.mp4`).replace(
    /\.mp4$/i,
    "",
  );
  const results: { file: string; fmt: Format; qc: QcResult | null }[] = [];
  const skipQc = flag(a, "no-qc");
  if (!skipQc) {
    step("QC: fonts");
    const fontProblems = await checkFonts(p, project, song);
    writeJson(path.join(p.review, "qc", "fonts.json"), fontProblems);
    if (fontProblems.length) {
      for (const f of fontProblems)
        warn(
          `${f.kind}: ${f.line !== "-" ? `line ${f.line}: ` : ""}${f.detail}`,
        );
      if (fontProblems.some((f) => f.kind === "font-not-found")) {
        fail(
          "Fix the font name (or add the font file to the project's fonts/ folder), then run the command again.",
        );
      }
    } else ok("Every character is covered by the intended fonts");
  }
  for (const fmt of formats) {
    let qc: QcResult | null = null;
    if (!skipQc) {
      step(`QC: every lyric line (${fmt.label})`);
      qc = await runQc(p, fmt);
    }
    step(`Render ${fmt.label === "source" ? "the video" : fmt.label}`);
    const out = outFile(p, base, fmt);
    fs.mkdirSync(p.out, { recursive: true });
    const from = num(a, "from");
    const to = num(a, "to");
    const fps = project.output.fps ?? project.media.fps;
    await renderVideo(p.dir, {
      out,
      size: fmt.size,
      aspect: fmt.aspect,
      debug: flag(a, "debug"),
      crf: num(a, "crf") ?? 17,
      concurrency: num(a, "concurrency") ?? null,
      frameRange:
        from !== undefined || to !== undefined
          ? [
              Math.round((from ?? 0) * fps),
              Math.round((to ?? project.media.duration) * fps) - 1,
            ]
          : undefined,
    });
    ok(`Saved ${out}`);
    if (qc && from === undefined && to === undefined) {
      const b = ffBinaries();
      const v = await verifyVideo(p, fmt, out, b.ffmpeg, b.env, fps);
      if (v.ok) ok(`The rendered video matches the checked frames`);
      else
        warn(
          `The rendered video differs from the QC frames (difference ${v.worst}); re-run npm run render -- ${path.basename(p.dir)}`,
        );
    }
    results.push({ file: out, fmt, qc });
  }
  return results;
}

async function cmdMake(a: Args) {
  let dir: string;
  if (str(a, "video") || str(a, "audio")) {
    const name = a._[0] ?? str(a, "name");
    const existing = name ? resolveDir(name) : null;
    if (existing && exists(path.join(existing, "project.json"))) {
      dir = existing;
      info(`Using existing project ${dir}`);
    } else {
      const choices = await gatherChoices(a);
      step("Create the project");
      dir = await createProject({
        name,
        video: str(a, "video"),
        audio: str(a, "audio"),
        lyrics: str(a, "lyrics"),
        langs: str(a, "lang")?.split(","),
        title: str(a, "title"),
        artist: str(a, "artist"),
        choices,
      });
    }
  } else dir = projectFrom(a);
  const { p, project } = loadProject(dir);
  const { song, transcribed } = await alignAll(p, project, a);

  step("Make the review pack");
  const { check, glance } = await makeReview(p, song, {
    stills: !flag(a, "no-stills"),
    transcribedLyrics: transcribed,
  });

  if (flag(a, "no-render")) {
    summary(p, check.length, glance.length, []);
    return;
  }
  if (flag(a, "draft")) {
    step("Render a draft (half size, timing overlay)");
    const out = path.join(p.out, "draft.mp4");
    fs.mkdirSync(p.out, { recursive: true });
    await renderVideo(p.dir, { out, scale: 0.5, crf: 28, debug: true });
    ok(`Saved ${out}`);
    summary(p, check.length, glance.length, [{ file: out, qc: null }]);
    return;
  }
  const done = await renderFormats(p, formatsFrom(a), a);
  summary(p, check.length, glance.length, done);
}

function summary(
  p: Paths,
  check: number,
  glance: number,
  done: { file: string; qc: QcResult | null }[],
) {
  const name = path.relative(PROJECTS, p.dir).startsWith("..")
    ? p.dir
    : path.basename(p.dir);
  console.log(`\n${bold(green("Done."))}`);
  for (const d of done) {
    const q = d.qc
      ? d.qc.pass
        ? green(" QC pass")
        : yellow(` QC: ${d.qc.problems.length} problem(s), see ${d.qc.report}`)
      : "";
    console.log(`  Video:   ${d.file}${q}`);
  }
  console.log(`  Timing review: ${path.join(p.review, "report.md")}`);
  if (check)
    console.log(
      yellow(
        `  ${check} line(s) to CHECK (timing likely off) and ${glance} to glance at - see the timing review.`,
      ),
    );
  else if (glance)
    console.log(`  No lines need a timing check; ${glance} to glance at.`);
  else console.log(green("  No timing issues flagged."));
  console.log(
    `  Watch it once with sound. Happy with it? ${cyan(`npm run approve -- ${name}`)} keeps the video and cleans up.`,
  );
  console.log(dim(`  Preview & tweak: npm run studio -- ${name}`));
}

async function cmdNew(a: Args) {
  const choices = await gatherChoices(a);
  await createProject({
    name: a._[0] ?? str(a, "name"),
    video: str(a, "video"),
    audio: str(a, "audio"),
    lyrics: str(a, "lyrics"),
    langs: str(a, "lang")?.split(","),
    title: str(a, "title"),
    artist: str(a, "artist"),
    choices,
  });
}

async function cmdAlign(a: Args) {
  const { p, project } = loadProject(projectFrom(a));
  const { song, transcribed } = await alignAll(p, project, a);
  step("Make the review pack");
  const { check, glance } = await makeReview(p, song, {
    stills: !flag(a, "no-stills"),
    transcribedLyrics: transcribed,
  });
  summary(p, check.length, glance.length, []);
}

async function cmdReview(a: Args) {
  const { p } = loadProject(projectFrom(a));
  const song = SongSchema.parse(readJson(p.song));
  await makeReview(p, song, {
    stills: !flag(a, "no-stills"),
    transcribedLyrics: false,
  });
}

function checkSong(
  p: Paths,
  project: ReturnType<typeof loadProject>["project"],
) {
  const song = SongSchema.parse(readJson(p.song));
  const issues = validateSong(song, project.media.duration).filter(
    (i) => i.level === "error",
  );
  if (issues.length)
    fail(
      `song.json has errors:\n${issues.map((i) => `  ${i.where}: ${i.message}`).join("\n")}`,
    );
  resolveStyle(project.style as Record<string, unknown>);
}

async function cmdRender(a: Args) {
  const { p, project } = loadProject(projectFrom(a));
  checkSong(p, project);
  if (flag(a, "draft")) {
    step("Render a draft (half size, timing overlay)");
    const out = str(a, "out")
      ? path.resolve(str(a, "out")!)
      : path.join(p.out, "draft.mp4");
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const [fmt] = formatsFrom(a);
    await renderVideo(p.dir, {
      out,
      size: fmt.size,
      aspect: fmt.aspect,
      scale: 0.5,
      crf: 28,
      debug: true,
    });
    ok(`Saved ${out}`);
    return;
  }
  const done = await renderFormats(p, formatsFrom(a), a);
  const song = SongSchema.parse(readJson(p.song));
  const flaggedCount = song.groups
    .flatMap((g) => g.lines)
    .filter((l) => l.review === "check" && !l.locked).length;
  summary(p, flaggedCount, 0, done);
}

async function cmdQc(a: Args) {
  const { p, project } = loadProject(projectFrom(a));
  checkSong(p, project);
  const song = SongSchema.parse(readJson(p.song));
  step("QC: fonts");
  const fontProblems = await checkFonts(p, project, song);
  for (const f of fontProblems) warn(`${f.kind}: ${f.detail}`);
  if (!fontProblems.length)
    ok("Every character is covered by the intended fonts");
  let pass = !fontProblems.length;
  for (const fmt of formatsFrom(a)) {
    step(`QC: every lyric line (${fmt.label})`);
    const r = await runQc(p, fmt, { maxRounds: flag(a, "no-fix") ? 1 : 3 });
    pass = pass && r.pass;
  }
  if (!pass) process.exitCode = 1;
}

async function cmdStill(a: Args) {
  const { p } = loadProject(projectFrom(a));
  const t = num(a, "time") ?? fail("Give a time in seconds: --time 12.5");
  const out = str(a, "out")
    ? path.resolve(str(a, "out")!)
    : path.join(p.review, `still-${t.toFixed(2)}s.jpg`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const [fmt] = formatsFrom(a);
  await renderStills(p.dir, [{ time: t, out }], num(a, "scale") ?? 1, {
    size: fmt.size,
    aspect: fmt.aspect,
    debug: flag(a, "debug"),
  });
  ok(`Saved ${out}`);
}

async function cmdApprove(a: Args) {
  const { p } = loadProject(projectFrom(a));
  const files = str(a, "file")
    ? [path.resolve(str(a, "file")!)]
    : exists(p.out)
      ? fs
          .readdirSync(p.out)
          .filter((f) => f.endsWith(".mp4") && !f.startsWith("draft"))
          .map((f) => path.join(p.out, f))
      : [];
  if (!files.length)
    fail(
      `No finished video in ${p.out}. Render one first: npm run render -- ${path.basename(p.dir)}`,
    );
  for (const f of files) if (!exists(f)) fail(`File not found: ${f}`);
  // Only approve videos whose QC passed (unless forced).
  for (const f of files) {
    const label =
      path
        .basename(f, ".mp4")
        .match(/-((?:1080p|4k|src)-(?:16x9|9x16|src))$/)?.[1] ?? "source";
    const rep = path.join(p.review, "qc", label, "report.json");
    const pass = exists(rep) && readJson<{ pass: boolean }>(rep).pass;
    if (!pass && !flag(a, "force")) {
      fail(
        `${path.basename(f)} has not passed QC (${exists(rep) ? "problems remain" : "no QC report"}). Fix and re-render, or pass --force to approve anyway.`,
      );
    }
  }
  step("Approve");
  const raw = readJson<Record<string, unknown>>(p.project);
  const approved = (
    (raw.approved as { file: string; sha256: string; at: string }[]) ?? []
  ).filter((x) => !files.some((f) => path.resolve(p.dir, x.file) === f));
  for (const f of files) {
    const sha256 = crypto
      .createHash("sha256")
      .update(fs.readFileSync(f))
      .digest("hex");
    approved.push({
      file: path.relative(p.dir, f).split(path.sep).join("/"),
      sha256,
      at: new Date().toISOString(),
    });
    ok(`Approved ${path.basename(f)}`);
  }
  raw.approved = approved;
  writeJson(p.project, raw);

  step("Clean up");
  const fresh = loadProject(p.dir).project;
  const items = cleanupPlan(p, fresh, { media: flag(a, "media") });
  if (!items.length) return ok("Nothing to clean up");
  const total = items.reduce((n, i) => n + i.bytes, 0);
  for (const it of items)
    info(
      `${human(it.bytes).padStart(9)}  ${path.relative(p.dir, it.path) || it.path}  ${dim(it.why)}`,
    );
  info(bold(`Total ${human(total)}`));
  info(
    dim(
      "Kept: project.json, lyrics.txt, song.json, analysis.json, fonts/, review and QC reports, contact sheet, approved videos" +
        (flag(a, "media") ? "" : ", source media"),
    ),
  );
  let go = flag(a, "yes");
  if (!go) {
    if (!process.stdin.isTTY)
      fail("Run again with --yes to delete these files (nothing was deleted).");
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    go = (await rl.question("    Delete these files? y/N: "))
      .trim()
      .toLowerCase()
      .startsWith("y");
    rl.close();
  }
  if (!go) return info("Nothing deleted.");
  applyCleanup(items);
  ok(`Freed ${human(total)}`);
}

function cmdShift(a: Args) {
  const { p, project } = loadProject(projectFrom(a));
  const song = SongSchema.parse(readJson(p.song));
  const by = num(a, "by");
  const lineId = str(a, "line");
  const wordId = str(a, "word");
  const from = num(a, "from");
  const to = num(a, "to");
  const touched = new Set<string>();
  for (const g of song.groups)
    for (const l of g.lines) {
      for (const w of l.words) {
        if (wordId && w.id === wordId) {
          const s = num(a, "start");
          const e = num(a, "end");
          if (s === undefined && e === undefined && by === undefined)
            fail("For --word give --start, --end and/or --by");
          if (by !== undefined) {
            w.start += by;
            w.end += by;
          }
          if (s !== undefined) w.start = s;
          if (e !== undefined) w.end = e;
          touched.add(l.id);
        } else if (lineId && l.id === lineId && by !== undefined) {
          w.start += by;
          w.end += by;
          touched.add(l.id);
        } else if (
          from !== undefined &&
          to !== undefined &&
          by !== undefined &&
          w.start >= from &&
          w.start < to
        ) {
          w.start += by;
          w.end += by;
          touched.add(l.id);
        }
      }
    }
  if (!touched.size)
    fail(
      "Nothing matched. Use --line <id> --by <s>, --word <id> --start <s> [--end <s>], or --from <s> --to <s> --by <s>. Line ids are in song.json and the review report.",
    );
  for (const g of song.groups) {
    for (const l of g.lines) {
      if (touched.has(l.id)) {
        for (const w of l.words) {
          w.start = Math.round(w.start * 1000) / 1000;
          w.end = Math.round(w.end * 1000) / 1000;
          w.flags = undefined;
          w.conf = 1;
        }
        l.start = l.words[0].start;
        l.end = l.words[l.words.length - 1].end;
        l.locked = true;
        l.flags = undefined;
        l.review = undefined;
        l.conf = 1;
      }
    }
    // Translations follow their sung line.
    for (const l of g.lines) {
      if (!l.sung && l.pairOf && touched.has(l.pairOf)) {
        const pair = g.lines.find((x) => x.id === l.pairOf)!;
        const d0 = pair.start - l.start;
        const scale =
          (pair.end - pair.start) / Math.max(0.001, l.end - l.start);
        const base = l.start;
        for (const w of l.words) {
          w.start =
            Math.round((pair.start + (w.start - base) * scale) * 1000) / 1000;
          w.end =
            Math.round((pair.start + (w.end - base) * scale) * 1000) / 1000;
        }
        l.start = pair.start;
        l.end = pair.end;
        void d0;
      }
    }
  }
  const issues = validateSong(song, project.media.duration);
  for (const i of issues)
    (i.level === "error" ? warn : info)(`${i.level}: ${i.where}: ${i.message}`);
  if (issues.some((i) => i.level === "error"))
    fail("That change would make the timing invalid; nothing was saved.");
  writeJson(p.song, song);
  ok(`Updated and locked: ${[...touched].join(", ")}`);
}

function cmdValidate(a: Args) {
  const { p, project } = loadProject(projectFrom(a));
  ok("project.json is valid");
  resolveStyle(project.style as Record<string, unknown>);
  ok(`Style "${(project.style as { preset: string }).preset}" is valid`);
  if (!exists(p.song))
    return warn("No song.json yet. Run: npm run make -- <project>");
  const r = SongSchema.safeParse(readJson(p.song));
  if (!r.success)
    fail(
      `song.json is not valid:\n${r.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n")}`,
    );
  const issues = validateSong(r.data, project.media.duration);
  for (const i of issues)
    (i.level === "error" ? warn : info)(`${i.level}: ${i.where}: ${i.message}`);
  if (issues.some((i) => i.level === "error"))
    fail("song.json has errors (listed above).");
  ok(`song.json is valid (${issues.length} warning(s))`);
}

function cmdStudio(a: Args) {
  const dir = a._[0] ? projectFrom(a) : path.join(ROOT, "examples", "demo");
  loadProject(dir);
  const cli = path.join(
    ROOT,
    "node_modules",
    "@remotion",
    "cli",
    "remotion-cli.js",
  );
  const port = str(a, "port");
  console.log(
    `Opening Remotion Studio for ${dir}\n${dim("Edit project.json or song.json and refresh the browser to see changes. Ctrl+C to stop.")}`,
  );
  const child = spawn(
    process.execPath,
    [
      cli,
      "studio",
      path.join(ROOT, "src", "index.ts"),
      "--public-dir",
      dir,
      ...(port ? ["--port", port] : []),
      ...(flag(a, "no-open") ? ["--no-open"] : []),
    ],
    { stdio: "inherit", cwd: ROOT },
  );
  child.on("close", (code) => process.exit(code ?? 0));
}

function cmdPresets() {
  listPresets();
}

async function cmdDoctor() {
  let bad = 0;
  const check = (good: boolean, label: string, help?: string) => {
    if (good) ok(label);
    else {
      bad++;
      console.log(`    ${red("✗")} ${label}${help ? `\n      ${help}` : ""}`);
    }
  };
  const [major] = process.versions.node.split(".").map(Number);
  check(
    major >= 20,
    `Node.js ${process.versions.node}`,
    "Install Node.js 20 or newer from https://nodejs.org",
  );
  check(
    exists(path.join(ROOT, "node_modules", "remotion")),
    "npm packages installed",
    "Run: npm install",
  );
  try {
    const b = ffBinaries();
    check(true, `ffmpeg (${b.source})`);
  } catch (e) {
    check(false, "ffmpeg", (e as Error).message);
  }
  const uv = uvPath();
  check(
    !!uv,
    "uv (runs the audio pipeline)",
    "Run: npm run setup (it installs uv for you)",
  );
  if (uv) {
    try {
      const out = await py(["doctor"], "Python check", true);
      const j = JSON.parse(out.trim().split(/\r?\n/).pop()!);
      check(
        true,
        `Python ${j.python}, PyTorch ${j.torch}${j.cuda ? " (GPU)" : " (CPU)"}`,
      );
    } catch (e) {
      check(
        false,
        "Python environment",
        `Run: npm run setup\n      ${(e as Error).message.split("\n")[0]}`,
      );
    }
  }
  console.log(
    bad ? red(`\n${bad} problem(s) found.`) : green("\nEverything is ready."),
  );
  if (bad) process.exitCode = 1;
}

async function cmdSetup(a: Args) {
  step("Check uv (it installs Python for the audio tools)");
  let uv = uvPath();
  if (!uv) {
    info("uv is not installed; installing it now with its official installer");
    uv = await installUv();
  }
  ok(`uv ready (${uv})`);
  step("Install the Python audio pipeline (first time: a few minutes)");
  await run(uv, ["sync", "--project", PIPELINE, "--frozen"], {
    cwd: PIPELINE,
    label: "uv sync",
  });
  ok("Python pipeline installed");
  if (!flag(a, "skip-models")) {
    step("Download models (about 3 GB, once)");
    await py(
      ["prefetch", "--whisper", str(a, "whisper") ?? "medium"],
      "Model download",
    );
  }
  step("Download the headless browser Remotion renders with");
  const { ensureBrowser } = await import("@remotion/renderer");
  await ensureBrowser();
  ok("Browser ready");
  step("Generate the JSON schemas for editor autocomplete");
  writeSchemas();
  console.log(
    `\n${bold(green("Setup complete."))} Try the demo: ${cyan("npm run studio")}  or make a video: ${cyan("npm run make -- --video song.mp4 --lyrics lyrics.txt")}`,
  );
}

function writeSchemas() {
  const dir = path.join(ROOT, "schema");
  fs.mkdirSync(dir, { recursive: true });
  const project = z.toJSONSchema(ProjectSchema, {
    io: "input",
    unrepresentable: "any",
  }) as Record<string, unknown>;
  const style = z.toJSONSchema(StyleSchema, {
    io: "input",
    unrepresentable: "any",
  }) as Record<string, unknown>;
  // project.style accepts any style field next to "preset".
  const props = (project.properties ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  if (props.style) {
    props.style = {
      description:
        "A preset name plus any style fields to override (see docs/styles.md)",
      allOf: [{ $ref: "style.schema.json" }],
      properties: {
        preset: {
          type: "string",
          enum: PRESET_NAMES,
          default: "golden-sparkle",
        },
      },
    };
  }
  writeJson(path.join(dir, "project.schema.json"), project);
  writeJson(path.join(dir, "style.schema.json"), style);
  writeJson(
    path.join(dir, "song.schema.json"),
    z.toJSONSchema(SongSchema, { io: "input", unrepresentable: "any" }),
  );
  ok(`Wrote ${dir}`);
}

async function cmdBench(a: Args) {
  await py(
    [
      "bench",
      "--songs",
      str(a, "songs") ?? "3",
      "--variants",
      str(a, "variants") ?? "anchored",
      "--whisper",
      str(a, "whisper") ?? "medium",
    ],
    "Benchmark",
  );
}

const HELP = `
${bold("motion-lyrics")} - lyric videos from a video and its lyrics, in any language.

${bold("Make a video (does everything):")}
  npm run make -- --video song.mp4 --lyrics lyrics.txt [--preset golden-sparkle] [--name my-song]
  npm run make -- my-song                 re-run an existing project (skips finished steps)

${bold("Options for make")}
  --preset <name>     look of the video (npm run presets lists them)
  --lang hi,en        languages in the lyrics, if lyrics.txt has no @lang line
  --draft             render a quick half-size draft with the timing overlay
  --no-render         stop after the review pack
  --fast              skip the Whisper cross-check (faster, less safe)
  --force             redo every step

${bold("Step by step")}
  npm run new -- <name> --video <file> --lyrics <file>   create a project only
  npm run align -- <project>       separate, listen, align, build song.json, review pack
  npm run review -- <project>      rebuild the review pack
  npm run studio -- <project>      live preview in the browser (no project = the demo)
  npm run render -- <project> [--draft] [--debug] [--from 10 --to 20] [--out file.mp4]
  npm run still -- <project> --time 12.5 [--debug]
  npm run shift -- <project> --line g3l1 --by 0.15
  npm run validate -- <project>
  npm run presets | doctor | setup | bench
`;

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const a = parseArgs(rest);
  const commands: Record<string, (a: Args) => unknown> = {
    make: cmdMake,
    new: cmdNew,
    align: cmdAlign,
    review: cmdReview,
    render: cmdRender,
    still: cmdStill,
    qc: cmdQc,
    approve: cmdApprove,
    shift: cmdShift,
    validate: cmdValidate,
    studio: cmdStudio,
    presets: cmdPresets,
    doctor: cmdDoctor,
    setup: cmdSetup,
    schema: () => writeSchemas(),
    bench: cmdBench,
  };
  if (!cmd || cmd === "help" || cmd === "--help" || !commands[cmd]) {
    console.log(HELP);
    if (cmd && !commands[cmd] && cmd !== "help" && cmd !== "--help")
      process.exitCode = 1;
    return;
  }
  await commands[cmd](a);
}

main().catch((e) => {
  if (e instanceof CliError)
    console.error(`\n${red(bold("Error:"))} ${e.message}`);
  else console.error(`\n${red(bold("Unexpected error:"))}`, e);
  process.exit(1);
});
