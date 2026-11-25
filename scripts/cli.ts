/**
 * motion-lyrics command line. Run through npm, e.g.
 *
 *   npm run make -- --video song.mp4 --lyrics lyrics.txt
 *
 * Every command prints what it is doing and stops with a clear message if
 * something is wrong. See docs/cli.md for the full reference.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { parseLyrics } from "../src/core/lyrics";
import { ProjectSchema } from "../src/schema/project";
import { SongSchema, type Song } from "../src/schema/song";
import { StyleSchema } from "../src/schema/style";
import { PRESETS, PRESET_NAMES } from "../src/style/presets";
import { resolveStyle } from "../src/style/resolve";
import { extractAudio, ffBinaries } from "./lib/media";
import { createProject, loadProject, resolveDir, type Paths } from "./lib/project";
import { renderVideo } from "./lib/render";
import { makeReview } from "./lib/review";
import { buildSong, lyricsForAligner, validateSong, type Alignment } from "./lib/song";
import { CliError, PIPELINE, PROJECTS, ROOT, bold, cyan, dim, exists, fail, green, info, mtime, ok, py, readJson, red, run, step, warn, which, writeJson, yellow } from "./lib/util";

// ------------------------------------------------------------------ arguments

type Args = { _: string[]; [k: string]: string | boolean | string[] };

function parseArgs(argv: string[]): Args {
  const a: Args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const s = argv[i];
    if (s.startsWith("--")) {
      const [k, v] = s.slice(2).split("=", 2);
      if (v !== undefined) a[k] = v;
      else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith("--")) a[k] = argv[++i];
      else a[k] = true;
    } else a._.push(s);
  }
  return a;
}
const str = (a: Args, k: string) => (typeof a[k] === "string" ? (a[k] as string) : undefined);
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
  if (!name) fail("Which project? Give its name (from projects/) or folder path, e.g. npm run render -- my-song");
  return resolveDir(name);
}

// ------------------------------------------------------------------- stages

function sourceMedia(p: Paths, project: ReturnType<typeof loadProject>["project"]): string {
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

function stageLyrics(p: Paths, tokenize: Record<string, "word" | "char">): { parsed: ReturnType<typeof parseLyrics> } {
  const text = fs.readFileSync(p.lyrics, "utf8");
  const parsed = parseLyrics(text, { tokenize });
  for (const w of parsed.warnings) warn(w);
  const sung = parsed.groups.flatMap((g) => g.lines.filter((l) => l.sung));
  if (!sung.length) fail("lyrics.txt has no sung lines.");
  info(`${parsed.groups.length} screens, ${sung.length} sung lines, ${sung.reduce((n, l) => n + l.words.length, 0)} words`);
  info(`Languages: ${parsed.tracks.map((t) => `${t.lang} (${t.script}${t.role === "companion" ? ", translation" : ""}${t.dir === "rtl" ? ", right-to-left" : ""})`).join(", ")}`);
  writeJson(path.join(p.work, "lyrics.json"), lyricsForAligner(parsed));
  return { parsed };
}

function stageBuild(p: Paths, parsed: ReturnType<typeof parseLyrics>, duration: number): Song {
  const alignment = readJson<Alignment>(path.join(p.work, "alignment.json"));
  const previous = exists(p.song) ? SongSchema.safeParse(readJson(p.song)) : null;
  const { song, kept, notes } = buildSong(parsed, alignment, duration, previous?.success ? previous.data : null);
  for (const n of notes) warn(n);
  if (kept.length) ok(`Kept ${kept.length} hand-corrected line(s): ${kept.join(", ")}`);
  const issues = validateSong(song, duration);
  for (const i of issues) (i.level === "error" ? warn : info)(`${i.level}: ${i.where}: ${i.message}`);
  if (issues.some((i) => i.level === "error")) fail("song.json has errors (listed above).");
  writeJson(p.song, song);
  ok(`Wrote ${p.song}`);
  return song;
}

async function alignAll(p: Paths, project: ReturnType<typeof loadProject>["project"], a: Args) {
  const force = flag(a, "force");
  const fast = flag(a, "fast");
  step("Extract the song's audio");
  await stageAudio(p, sourceMedia(p, project), force);

  step("Isolate the vocal");
  await py(["separate", "--project", p.dir, ...(force ? ["--force"] : []), ...(project.pipeline.separate ? [] : ["--off"])], "Vocal separation");

  let transcribed = false;
  if (!exists(p.lyrics)) {
    step("No lyrics.txt: writing a draft with speech recognition");
    warn("Speech recognition makes mistakes on songs. Check lyrics.txt afterwards and run make again.");
    await py(["transcribe", "--project", p.dir, "--model", project.pipeline.whisperModel, ...(str(a, "lang") ? ["--language", str(a, "lang")!.split(",")[0]] : [])], "Transcription");
    transcribed = true;
  }

  step("Read the lyrics");
  const { parsed } = stageLyrics(p, project.tokenize);

  step("Analyse beats, loudness and faces");
  const video = project.media.video ? path.join(p.dir, project.media.video) : null;
  if (force || mtime(p.analysis) < Math.max(mtime(path.join(p.work, "vocals.wav")), video ? mtime(video) : 0)) {
    await py(
      ["analyze", "--project", p.dir, "--duration", String(project.media.duration), ...(video ? ["--video", video] : []), ...(project.pipeline.faces ? [] : ["--no-faces"])],
      "Analysis",
    );
  } else ok("Analysis is up to date");

  if (project.pipeline.verify && !fast) {
    step("Listen with Whisper (anchors and a second opinion)");
    await py(["listen", "--project", p.dir, "--model", project.pipeline.whisperModel], "Whisper");
  } else {
    step("Skipping Whisper (fast mode): timing will not be cross-checked");
  }

  step("Align every word");
  await py(["align", "--project", p.dir, ...(project.pipeline.verify && !fast ? [] : ["--no-anchors"])], "Alignment");

  step("Build song.json");
  const song = stageBuild(p, parsed, project.media.duration);
  return { song, transcribed };
}

// ------------------------------------------------------------------ commands

async function cmdMake(a: Args) {
  let dir: string;
  if (str(a, "video") || str(a, "audio")) {
    const name = a._[0] ?? str(a, "name");
    const existing = name ? resolveDir(name) : null;
    if (existing && exists(path.join(existing, "project.json"))) {
      dir = existing;
      info(`Using existing project ${dir}`);
    } else {
      step("Create the project");
      dir = await createProject({
        name,
        video: str(a, "video"),
        audio: str(a, "audio"),
        lyrics: str(a, "lyrics"),
        preset: str(a, "preset"),
        langs: str(a, "lang")?.split(","),
        title: str(a, "title"),
        artist: str(a, "artist"),
      });
    }
  } else dir = projectFrom(a);
  const { p, project } = loadProject(dir);
  const { song, transcribed } = await alignAll(p, project, a);

  step("Make the review pack");
  const { check, glance } = await makeReview(p, song, { stills: !flag(a, "no-stills"), transcribedLyrics: transcribed });

  const outName = project.output.file ?? `${path.basename(dir)}.mp4`;
  if (flag(a, "no-render")) {
    summary(p, check.length, glance.length, null);
    return;
  }
  const draft = flag(a, "draft");
  step(draft ? "Render a draft (half size, timing overlay)" : "Render the video");
  const out = path.join(p.out, draft ? "draft.mp4" : outName);
  fs.mkdirSync(p.out, { recursive: true });
  await renderVideo(p.dir, draft ? { out, scale: 0.5, crf: 28, debug: true } : { out });
  ok(`Saved ${out}`);
  summary(p, check.length, glance.length, out);
}

function summary(p: Paths, check: number, glance: number, out: string | null) {
  console.log(`\n${bold(green("Done."))}`);
  if (out) console.log(`  Video:   ${out}`);
  console.log(`  Review:  ${path.join(p.review, "report.md")}`);
  if (check) console.log(yellow(`  ${check} line(s) to CHECK (timing likely off) and ${glance} to glance at - see the review report.`));
  else if (glance) console.log(`  No lines need checking; ${glance} to glance at in the draft (see the review report).`);
  else console.log(green("  No lines flagged. Watch it once with sound before publishing."));
  console.log(dim(`  Preview & tweak: npm run studio -- ${path.relative(PROJECTS, p.dir).startsWith("..") ? p.dir : path.basename(p.dir)}`));
}

async function cmdNew(a: Args) {
  await createProject({ name: a._[0] ?? str(a, "name"), video: str(a, "video"), audio: str(a, "audio"), lyrics: str(a, "lyrics"), preset: str(a, "preset"), langs: str(a, "lang")?.split(","), title: str(a, "title"), artist: str(a, "artist") });
}

async function cmdAlign(a: Args) {
  const { p, project } = loadProject(projectFrom(a));
  const { song, transcribed } = await alignAll(p, project, a);
  step("Make the review pack");
  const { check, glance } = await makeReview(p, song, { stills: !flag(a, "no-stills"), transcribedLyrics: transcribed });
  summary(p, check.length, glance.length, null);
}

async function cmdReview(a: Args) {
  const { p } = loadProject(projectFrom(a));
  const song = SongSchema.parse(readJson(p.song));
  await makeReview(p, song, { stills: !flag(a, "no-stills"), transcribedLyrics: false });
}

async function cmdRender(a: Args) {
  const { p, project } = loadProject(projectFrom(a));
  const song = SongSchema.parse(readJson(p.song));
  const issues = validateSong(song, project.media.duration).filter((i) => i.level === "error");
  if (issues.length) fail(`song.json has errors:\n${issues.map((i) => `  ${i.where}: ${i.message}`).join("\n")}`);
  resolveStyle(project.style as Record<string, unknown>);
  const draft = flag(a, "draft");
  fs.mkdirSync(p.out, { recursive: true });
  const out = str(a, "out") ? path.resolve(str(a, "out")!) : path.join(p.out, draft ? "draft.mp4" : project.output.file ?? `${path.basename(p.dir)}.mp4`);
  const from = num(a, "from");
  const to = num(a, "to");
  const fps = project.output.fps ?? project.media.fps;
  step(draft ? "Render a draft (half size, timing overlay)" : "Render the video");
  await renderVideo(p.dir, {
    out,
    debug: draft || flag(a, "debug"),
    scale: draft ? 0.5 : num(a, "scale") ?? 1,
    crf: draft ? 28 : num(a, "crf") ?? 17,
    concurrency: num(a, "concurrency") ?? null,
    frameRange: from !== undefined || to !== undefined ? [Math.round((from ?? 0) * fps), Math.round((to ?? project.media.duration) * fps) - 1] : undefined,
  });
  ok(`Saved ${out}`);
}

async function cmdStill(a: Args) {
  const { p } = loadProject(projectFrom(a));
  const t = num(a, "time") ?? fail("Give a time in seconds: --time 12.5");
  const out = str(a, "out") ? path.resolve(str(a, "out")!) : path.join(p.review, `still-${t.toFixed(2)}s.jpg`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const { renderStills } = await import("./lib/render");
  await renderStills(p.dir, [{ time: t, out }], num(a, "scale") ?? 1, flag(a, "debug"));
  ok(`Saved ${out}`);
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
          if (s === undefined && e === undefined && by === undefined) fail("For --word give --start, --end and/or --by");
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
        } else if (from !== undefined && to !== undefined && by !== undefined && w.start >= from && w.start < to) {
          w.start += by;
          w.end += by;
          touched.add(l.id);
        }
      }
    }
  if (!touched.size) fail("Nothing matched. Use --line <id> --by <s>, --word <id> --start <s> [--end <s>], or --from <s> --to <s> --by <s>. Line ids are in song.json and the review report.");
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
        const scale = (pair.end - pair.start) / Math.max(0.001, l.end - l.start);
        const base = l.start;
        for (const w of l.words) {
          w.start = Math.round((pair.start + (w.start - base) * scale) * 1000) / 1000;
          w.end = Math.round((pair.start + (w.end - base) * scale) * 1000) / 1000;
        }
        l.start = pair.start;
        l.end = pair.end;
        void d0;
      }
    }
  }
  const issues = validateSong(song, project.media.duration);
  for (const i of issues) (i.level === "error" ? warn : info)(`${i.level}: ${i.where}: ${i.message}`);
  if (issues.some((i) => i.level === "error")) fail("That change would make the timing invalid; nothing was saved.");
  writeJson(p.song, song);
  ok(`Updated and locked: ${[...touched].join(", ")}`);
}

function cmdValidate(a: Args) {
  const { p, project } = loadProject(projectFrom(a));
  ok("project.json is valid");
  resolveStyle(project.style as Record<string, unknown>);
  ok(`Style "${(project.style as { preset: string }).preset}" is valid`);
  if (!exists(p.song)) return warn("No song.json yet. Run: npm run make -- <project>");
  const r = SongSchema.safeParse(readJson(p.song));
  if (!r.success) fail(`song.json is not valid:\n${r.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n")}`);
  const issues = validateSong(r.data, project.media.duration);
  for (const i of issues) (i.level === "error" ? warn : info)(`${i.level}: ${i.where}: ${i.message}`);
  if (issues.some((i) => i.level === "error")) fail("song.json has errors (listed above).");
  ok(`song.json is valid (${issues.length} warning(s))`);
}

function cmdStudio(a: Args) {
  const dir = a._[0] ? projectFrom(a) : path.join(ROOT, "examples", "demo");
  loadProject(dir);
  const cli = path.join(ROOT, "node_modules", "@remotion", "cli", "remotion-cli.js");
  const port = str(a, "port");
  console.log(`Opening Remotion Studio for ${dir}\n${dim("Edit project.json or song.json and refresh the browser to see changes. Ctrl+C to stop.")}`);
  const child = spawn(process.execPath, [cli, "studio", path.join(ROOT, "src", "index.ts"), "--public-dir", dir, ...(port ? ["--port", port] : []), ...(flag(a, "no-open") ? ["--no-open"] : [])], { stdio: "inherit", cwd: ROOT });
  child.on("close", (code) => process.exit(code ?? 0));
}

function cmdPresets() {
  console.log(bold("Style presets") + dim("  (set in project.json: \"style\": { \"preset\": \"<name>\" })\n"));
  for (const name of PRESET_NAMES) {
    console.log(`  ${cyan(bold(name))}\n    ${PRESETS[name].description}\n`);
  }
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
  check(major >= 20, `Node.js ${process.versions.node}`, "Install Node.js 20 or newer from https://nodejs.org");
  check(exists(path.join(ROOT, "node_modules", "remotion")), "npm packages installed", "Run: npm install");
  try {
    const b = ffBinaries();
    check(true, `ffmpeg (${b.source})`);
  } catch (e) {
    check(false, "ffmpeg", (e as Error).message);
  }
  const uv = which("uv");
  check(!!uv, "uv (runs the audio pipeline)", "Install: https://docs.astral.sh/uv/getting-started/installation/ then run npm run setup");
  if (uv) {
    try {
      const out = await py(["doctor"], "Python check", true);
      const j = JSON.parse(out.trim().split(/\r?\n/).pop()!);
      check(true, `Python ${j.python}, PyTorch ${j.torch}${j.cuda ? " (GPU)" : " (CPU)"}`);
    } catch (e) {
      check(false, "Python environment", `Run: npm run setup\n      ${(e as Error).message.split("\n")[0]}`);
    }
  }
  console.log(bad ? red(`\n${bad} problem(s) found.`) : green("\nEverything is ready."));
  if (bad) process.exitCode = 1;
}

async function cmdSetup(a: Args) {
  step("Check uv");
  if (!which("uv")) fail("uv is required. Install it from https://docs.astral.sh/uv/getting-started/installation/ and open a new terminal.");
  ok("uv found");
  step("Install the Python audio pipeline (first time: a few minutes)");
  await run("uv", ["sync", "--project", PIPELINE, "--frozen"], { cwd: PIPELINE, label: "uv sync" });
  ok("Python pipeline installed");
  if (!flag(a, "skip-models")) {
    step("Download models (about 3 GB, once)");
    await py(["prefetch", "--whisper", str(a, "whisper") ?? "medium"], "Model download");
  }
  step("Download the headless browser Remotion renders with");
  const { ensureBrowser } = await import("@remotion/renderer");
  await ensureBrowser();
  ok("Browser ready");
  step("Generate the JSON schemas for editor autocomplete");
  writeSchemas();
  console.log(`\n${bold(green("Setup complete."))} Try the demo: ${cyan("npm run studio")}  or make a video: ${cyan("npm run make -- --video song.mp4 --lyrics lyrics.txt")}`);
}

function writeSchemas() {
  const dir = path.join(ROOT, "schema");
  fs.mkdirSync(dir, { recursive: true });
  const project = z.toJSONSchema(ProjectSchema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
  const style = z.toJSONSchema(StyleSchema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
  // project.style accepts any style field next to "preset".
  const props = (project.properties ?? {}) as Record<string, Record<string, unknown>>;
  if (props.style) {
    props.style = {
      description: "A preset name plus any style fields to override (see docs/styles.md)",
      allOf: [{ $ref: "style.schema.json" }],
      properties: { preset: { type: "string", enum: PRESET_NAMES, default: "golden-sparkle" } },
    };
  }
  writeJson(path.join(dir, "project.schema.json"), project);
  writeJson(path.join(dir, "style.schema.json"), style);
  writeJson(path.join(dir, "song.schema.json"), z.toJSONSchema(SongSchema, { io: "input", unrepresentable: "any" }));
  ok(`Wrote ${dir}`);
}

async function cmdBench(a: Args) {
  await py(["bench", "--songs", str(a, "songs") ?? "3", "--variants", str(a, "variants") ?? "anchored", "--whisper", str(a, "whisper") ?? "medium"], "Benchmark");
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
    if (cmd && !commands[cmd] && cmd !== "help" && cmd !== "--help") process.exitCode = 1;
    return;
  }
  await commands[cmd](a);
}

main().catch((e) => {
  if (e instanceof CliError) console.error(`\n${red(bold("Error:"))} ${e.message}`);
  else console.error(`\n${red(bold("Unexpected error:"))}`, e);
  process.exit(1);
});
