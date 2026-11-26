/**
 * QC: look at a settled frame of EVERY lyric line, in every export format,
 * before the video is rendered - and fix what fails.
 *
 * For each line we render the real frame and a "mask" frame (each line in a
 * flat colour on black, effects off). The pipeline measures from the pixels:
 *   not-visible        the line is not on screen when it should be
 *   clipped            letters touch the frame edge
 *   outside-safe-area  letters are closer than 5% to an edge
 *   collision          two lines overlap
 *   low-contrast       the line does not stand out from the picture behind it
 *   too-small          the font is too small to read at this size
 * and from the fonts themselves:
 *   missing-glyphs     no font in the line's font list has a character (it would show as a box)
 *   font-not-found     a font named in the style is neither a Google Font nor a file in fonts/
 *
 * Fixes never move lyrics (positions stay exactly as chosen). They go in
 * project.json "adjust" per screen: shrink to fit, add dark backing, add an
 * outline; or, for fonts, use the Noto font for that script. Failed frames are
 * re-rendered and re-checked, up to three rounds.
 */
import fs from "node:fs";
import path from "node:path";
import { getAvailableFonts } from "@remotion/google-fonts";
import { facesInOutput, outputSize, type Framing } from "../../src/core/frame";
import { parseFontFile, FONT_EXTENSIONS } from "../../src/core/fontfiles";
import { MASK_COLORS } from "../../src/core/qc";
import { DEFAULT_FONT_FOR_SCRIPT } from "../../src/core/script";
import {
  lyricsEndBy,
  paginate,
  schedule,
  type Page,
} from "../../src/core/timeline";
import { fontStack } from "../../src/render/fonts";
import type { Project } from "../../src/schema/project";
import type { Song } from "../../src/schema/song";
import type { Style } from "../../src/schema/style";
import { resolveStyle, textStyleFor } from "../../src/style/resolve";
import type { Paths } from "./project";
import { renderStills, type FormatProps } from "./render";
import { fmtTime, info, ok, py, readJson, warn, writeJson } from "./util";

export type Format = {
  size: "source" | "1080" | "4k";
  aspect: "source" | "16:9" | "9:16";
  label: string;
};

export function formatLabel(
  size: Format["size"],
  aspect: Format["aspect"],
): string {
  if (size === "source" && aspect === "source") return "source";
  return `${size === "source" ? "src" : size === "4k" ? "4k" : "1080p"}-${aspect === "source" ? "src" : aspect.replace(":", "x")}`;
}

export const orientation = (w: number, h: number) =>
  (w > h ? "landscape" : h > w ? "portrait" : "square") as
    | "landscape"
    | "portrait"
    | "square";

type Problem = { line: string; kind: string; detail: string; edges?: string[] };
type Moment = {
  id: string;
  t: number;
  groupId: string;
  lines: {
    lineId: string;
    color: [number, number, number];
    fontPx: number;
    minFontPx: number;
    active: boolean;
  }[];
};
export type QcResult = {
  pass: boolean;
  format: string;
  checked: number;
  lines: number;
  problems: (Problem & { t: number; id: string })[];
  rounds: number;
  report: string;
  dir: string;
};

/** One settled moment per sung line: after its screen has entered, mid-line, before it leaves. */
function moments(
  song: Song,
  style: Style,
  W: number,
  H: number,
  adjust: Record<string, { scale: number }>,
  endBy: number = song.duration,
): Moment[] {
  const scale = Math.min(W, H) / 1080;
  const tracks = new Map(song.tracks.map((t) => [t.id, t]));
  const px = (lineId: string, groupId: string) => {
    const line = song.groups
      .flatMap((g) => g.lines)
      .find((l) => l.id === lineId);
    const ts = textStyleFor(style, tracks.get(line?.track ?? "")!);
    return ts.fontSize * scale * (adjust[groupId]?.scale ?? 1);
  };
  const minPx = 24 * scale;
  const out: Moment[] = [];
  if (style.layout.type === "scroll") {
    const sung = song.groups.flatMap((g) =>
      g.lines.filter((l) => l.sung).map((l) => ({ l, g })),
    );
    sung.forEach(({ l, g }) => {
      const companions = g.lines.filter((c) => !c.sung && c.pairOf === l.id);
      out.push({
        id: l.id,
        t: Math.min(
          l.end - 0.05,
          Math.max(l.start + 0.5, (l.start + l.end) / 2),
        ),
        groupId: g.id,
        lines: [l, ...companions].map((x) => ({
          lineId: x.id,
          color: MASK_COLORS[1],
          fontPx: px(x.id, g.id),
          minFontPx: minPx,
          active: true,
        })),
      });
    });
    return out;
  }
  const pages: Page[] = schedule(
    paginate(song, style),
    style,
    song.duration,
    endBy,
  );
  for (const page of pages) {
    const settle = page.enterStart + page.enterDur + 0.08;
    const leave = Math.min(page.exitStart - 0.05, song.duration - 0.05);
    for (const l of page.lines.filter((x) => x.sung)) {
      const mid = (l.start + l.end) / 2;
      const t =
        leave >= settle ? Math.min(leave, Math.max(settle, mid)) : settle;
      out.push({
        id: l.id,
        t: Math.round(t * 1000) / 1000,
        groupId: page.groupId,
        // Contrast is judged on the line being sung (and its translation); other lines
        // may be dimmed on purpose by the style, so they get the geometry checks only.
        lines: page.lines.map((x, i) => ({
          lineId: x.id,
          color: MASK_COLORS[i % MASK_COLORS.length],
          fontPx: px(x.id, page.groupId),
          minFontPx: minPx,
          active: x.id === l.id || x.pairOf === l.id,
        })),
      });
    }
  }
  return out;
}

/** Font problems are the same for every format, so they are checked once. */
export async function checkFonts(
  p: Paths,
  project: Project,
  song: Song,
): Promise<Problem[]> {
  const style = resolveStyle(project.style as Record<string, unknown>);
  const google = new Map(getAvailableFonts().map((f) => [f.fontFamily, f]));
  const fontDir = path.join(p.dir, "fonts");
  const localFiles = fs.existsSync(fontDir)
    ? fs
        .readdirSync(fontDir)
        .filter((f) => FONT_EXTENSIONS.includes(path.extname(f).toLowerCase()))
    : [];
  const local = new Map<string, string[]>();
  for (const f of localFiles) {
    const parsed = parseFontFile(`fonts/${f}`)!;
    local.set(parsed.family, [
      ...(local.get(parsed.family) ?? []),
      path.join(fontDir, f),
    ]);
  }
  for (const lf of project.localFonts)
    local.set(lf.family, [
      ...(local.get(lf.family) ?? []),
      path.join(p.dir, lf.src),
    ]);

  const problems: Problem[] = [];
  const tracks = new Map(song.tracks.map((t) => [t.id, t]));
  const rangesCache = new Map<string, [number, number][]>();
  const googleRanges = async (family: string) => {
    if (rangesCache.has(family)) return rangesCache.get(family)!;
    const info = (await google.get(family)!.load()).getInfo();
    const ranges: [number, number][] = [];
    for (const r of Object.values(info.unicodeRanges)) {
      for (const part of String(r).split(",")) {
        const q = part.trim().replace(/^U\+/i, "");
        const [a, b] = q.includes("-")
          ? q.split("-")
          : [q.replace(/\?/g, "0"), q.replace(/\?/g, "F")];
        ranges.push([parseInt(a, 16), parseInt(b, 16)]);
      }
    }
    rangesCache.set(family, ranges);
    return ranges;
  };
  const localMissing = new Map<string, Set<string>>();
  const allText = song.groups
    .flatMap((g) => g.lines.flatMap((l) => l.words.map((w) => w.text)))
    .join(" ");
  for (const [family, files] of local) {
    const tmp = path.join(p.work, "fontcheck.txt");
    fs.mkdirSync(p.work, { recursive: true });
    fs.writeFileSync(tmp, allText.toUpperCase() + allText, "utf8");
    const res = JSON.parse(
      (
        await py(
          ["fontcheck", "--text-file", tmp, ...files],
          "Font check",
          true,
        )
      )
        .trim()
        .split(/\r?\n/)
        .pop()!,
    );
    const missing = new Set<string>(allText.split(""));
    for (const f of files) {
      const r = res[f];
      if (!Array.isArray(r)) continue;
      for (const ch of [...missing]) if (!r.includes(ch)) missing.delete(ch);
    }
    localMissing.set(family, missing);
  }

  const named = new Set<string>();
  for (const g of song.groups)
    for (const l of g.lines) {
      const track = tracks.get(l.track)!;
      const ts = textStyleFor(style, track);
      const stack = fontStack(style, ts, track.script);
      for (const fam of stack) named.add(fam);
      let text = l.words.map((w) => w.text).join("");
      if (ts.textTransform === "uppercase") text = text.toUpperCase();
      const missing: string[] = [];
      for (const ch of new Set([...text].filter((c) => !/\s/.test(c)))) {
        const cp = ch.codePointAt(0)!;
        let covered = false;
        for (const fam of stack) {
          if (local.has(fam)) {
            if (!localMissing.get(fam)?.has(ch)) covered = true;
          } else if (google.has(fam)) {
            if ((await googleRanges(fam)).some(([a, b]) => cp >= a && cp <= b))
              covered = true;
          }
          if (covered) break;
        }
        if (!covered) missing.push(ch);
      }
      if (missing.length)
        problems.push({
          line: l.id,
          kind: "missing-glyphs",
          detail: `no font has: ${missing.join(" ")} (script ${track.script})`,
        });
    }
  for (const fam of named) {
    if (!google.has(fam) && !local.has(fam))
      problems.push({
        line: "-",
        kind: "font-not-found",
        detail: `"${fam}" is not a Google Font and there is no file for it in fonts/`,
      });
  }
  return problems;
}

/** Run QC for one export format, fixing and re-checking failed screens. */
export async function runQc(
  p: Paths,
  fmt: Format,
  opts: { maxRounds?: number } = {},
): Promise<QcResult> {
  const maxRounds = opts.maxRounds ?? 3;
  const dir = path.join(p.review, "qc", fmt.label);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  let round = 0;
  let problems: (Problem & { t: number; id: string })[] = [];
  let checked = 0;
  let lineCount = 0;
  const fixesLog: string[] = [];
  let todo: Set<string> | null = null; // moment ids to (re)check; null = all

  while (round < maxRounds) {
    round++;
    const project = readJson<Project>(p.project);
    const song = readJson<Song>(p.song);
    const style = resolveStyle(project.style as Record<string, unknown>);
    const { width: W, height: H } =
      fmt.size === "source" && fmt.aspect === "source"
        ? outputSize(
            project.output.width ?? project.media.width,
            project.output.height ?? project.media.height,
            "source",
            "source",
          )
        : outputSize(
            project.media.width,
            project.media.height,
            fmt.size,
            fmt.aspect,
          );
    const shape = orientation(W, H);
    const adjust = (project.adjust?.[shape] ?? {}) as Record<
      string,
      { scale: number; backing: number; outline: boolean; reason?: string }
    >;
    const all = moments(
      song,
      style,
      W,
      H,
      adjust,
      lyricsEndBy(song.duration, project.graphics),
    );
    lineCount = all.length;
    const list = todo ? all.filter((m) => todo!.has(m.id)) : all;
    info(
      `QC round ${round} (${fmt.label}, ${W}x${H}): checking ${list.length} line(s)`,
    );
    const framing: Framing = {
      mode: project.background.fit,
      srcW: project.media.width,
      srcH: project.media.height,
      W,
      H,
    };
    const faces = facesInOutput(
      framing,
      (readJsonSafe(p.analysis)?.faces as never) ?? [],
    );
    const qcScale = Math.min(1, (960 / Math.max(W, H)) * (W > H ? 1 : 1.6));
    const stills = list.flatMap((m) => [
      { time: m.t, out: path.join(dir, `${m.id}-frame.jpg`) },
      { time: m.t, out: path.join(dir, `${m.id}-mask.png`), qcMask: true },
    ]);
    await renderStills(p.dir, stills, qcScale, {
      size: fmt.size,
      aspect: fmt.aspect,
    } as FormatProps);
    const job = list.map((m) => {
      const near = faces.reduce<{
        t: number;
        boxes: [number, number, number, number][];
      } | null>(
        (best, s) =>
          !best || Math.abs(s.t - m.t) < Math.abs(best.t - m.t) ? s : best,
        null,
      );
      return {
        id: m.id,
        t: m.t,
        mask: path.join(dir, `${m.id}-mask.png`),
        frame: path.join(dir, `${m.id}-frame.jpg`),
        annotated: path.join(dir, "failed", `${m.id}.jpg`),
        faces: near && Math.abs(near.t - m.t) < 0.6 ? near.boxes : [],
        lines: m.lines,
      };
    });
    const jobFile = path.join(dir, "job.json");
    writeJson(jobFile, job);
    await py(
      ["qc", "--job", jobFile, "--out", path.join(dir, "measure.json")],
      "QC measure",
      true,
    );
    const measured = readJson<
      {
        id: string;
        t: number;
        problems: Problem[];
        lines: { line: string; coversFace?: boolean }[];
      }[]
    >(path.join(dir, "measure.json"));
    if (round === 1) checked = list.length;
    const fresh = measured.flatMap((r) =>
      r.problems.map((pr) => ({ ...pr, t: r.t, id: r.id })),
    );
    // Keep problems from moments not re-checked this round.
    problems = [
      ...problems.filter((x) => !list.some((m) => m.id === x.id)),
      ...fresh,
    ];
    const faceNotes = measured.flatMap((r) =>
      r.lines
        .filter((l) => l.coversFace)
        .map((l) => ({ id: r.id, line: l.line, t: r.t })),
    );
    writeJson(path.join(dir, "faces.json"), faceNotes);
    if (!fresh.length) break;
    if (round === maxRounds) break;

    // ---- fix: per screen, never moving anything --------------------------------
    const byGroup = new Map<string, string[]>();
    for (const pr of fresh) {
      const m = all.find((x) => x.id === pr.id)!;
      byGroup.set(m.groupId, [...(byGroup.get(m.groupId) ?? []), pr.kind]);
    }
    const raw = readJson<Record<string, unknown>>(p.project);
    const adj =
      (raw.adjust as Record<string, Record<string, Record<string, unknown>>>) ??
      {};
    adj[shape] = adj[shape] ?? {};
    // Text too close to the top/bottom (or sides) is a margin problem: widen the margin for the
    // WHOLE video, so every screen keeps the same position, instead of moving single screens.
    const edgeHits = fresh
      .filter((x) => x.edges?.length)
      .flatMap((x) => x.edges!);
    const projStyle = (raw.style ?? {}) as Record<string, unknown>;
    const layout = { ...((projStyle.layout as Record<string, number>) ?? {}) };
    let marginFixed = false;
    if (
      edgeHits.some((e) => e === "top" || e === "bottom") &&
      (style.layout.marginY ?? 0) < 0.065
    ) {
      layout.marginY = 0.065;
      marginFixed = true;
      fixesLog.push(
        `whole video: top/bottom margin set to 6.5% so text stays inside the safe area`,
      );
    }
    if (
      edgeHits.some((e) => e === "left" || e === "right") &&
      (style.layout.marginX < 0.06 || style.layout.maxWidth > 0.88)
    ) {
      layout.marginX = Math.max(style.layout.marginX, 0.06);
      layout.maxWidth = Math.min(style.layout.maxWidth, 0.88);
      marginFixed = true;
      fixesLog.push(
        `whole video: side margin 6% and line width 88% so text stays inside the safe area`,
      );
    }
    if (marginFixed) raw.style = { ...projStyle, layout };
    for (const [g, kinds] of byGroup) {
      const cur = {
        scale: 1,
        backing: 0,
        outline: false,
        ...(adj[shape][g] ?? {}),
      } as {
        scale: number;
        backing: number;
        outline: boolean;
        reason?: string;
      };
      const why: string[] = [];
      const edgeOnly = fresh
        .filter((x) => all.find((m) => m.id === x.id)?.groupId === g)
        .every((x) => x.edges?.every((e) => e === "top" || e === "bottom"));
      if (
        kinds.some((k) =>
          ["clipped", "outside-safe-area", "collision"].includes(k),
        ) &&
        !(marginFixed && edgeOnly)
      ) {
        cur.scale = Math.max(0.6, Math.round(cur.scale * 0.9 * 100) / 100);
        why.push(`text shrunk to ${Math.round(cur.scale * 100)}% to fit`);
      }
      if (kinds.includes("too-small")) {
        cur.scale = Math.min(1.4, Math.round(cur.scale * 1.15 * 100) / 100);
        why.push(`text enlarged to ${Math.round(cur.scale * 100)}%`);
      }
      if (kinds.includes("low-contrast")) {
        if (cur.backing < 1) {
          cur.backing = Math.min(1, cur.backing + 0.5);
          why.push(`dark backing ${Math.round(cur.backing * 100)}%`);
        } else if (!cur.outline) {
          cur.outline = true;
          why.push("dark outline added");
        }
      }
      if (why.length) {
        cur.reason = `QC ${fmt.label}: ${why.join(", ")}`;
        adj[shape][g] = cur;
        fixesLog.push(`${g}: ${why.join(", ")}`);
      }
    }
    raw.adjust = adj;
    writeJson(p.project, raw);
    const fixable = new Set(
      fresh
        .filter((x) => x.kind !== "not-visible")
        .map((x) => all.find((m) => m.id === x.id)!.groupId),
    );
    if (!fixable.size) break;
    // A margin change affects every screen, so everything is checked again.
    todo = marginFixed
      ? null
      : new Set(all.filter((m) => fixable.has(m.groupId)).map((m) => m.id));
    info(`Fixed ${fixable.size} screen(s); re-rendering their frames`);
  }

  const pass = problems.length === 0;
  const faceNotes = readJsonSafe(path.join(dir, "faces.json")) as
    | { id: string; line: string; t: number }[]
    | null;
  const md: string[] = [
    `# QC: ${fmt.label}`,
    "",
    pass
      ? `**PASS** - every lyric line checked (${lineCount} lines).`
      : `**NEEDS ATTENTION** - ${problems.length} problem(s) left after ${round} round(s).`,
    "",
    "Checked on a settled frame of every line: on screen, inside the 5% safe area, not clipped, not colliding, readable contrast, readable size.",
    "",
  ];
  if (fixesLog.length)
    md.push(
      "## Fixes applied (saved in project.json)",
      "",
      ...fixesLog.map((f) => `- ${f}`),
      "",
    );
  if (problems.length) {
    md.push(
      "## Problems",
      "",
      "| Line | Time | Problem | Detail | Frame |",
      "| --- | --- | --- | --- | --- |",
    );
    for (const pr of problems)
      md.push(
        `| ${pr.line} | ${fmtTime(pr.t)} | ${pr.kind} | ${pr.detail} | ![](failed/${pr.id}.jpg) |`,
      );
    md.push("");
  }
  if (faceNotes?.length) {
    md.push(
      "## Notes",
      "",
      `Lyrics overlap a face in ${faceNotes.length} checked frame(s). Positions are kept fixed by your choice; turn on \`avoidFaces\` or change \`position\` if you want them elsewhere.`,
      "",
    );
  }
  const report = path.join(dir, "report.md");
  fs.writeFileSync(report, md.join("\n") + "\n", "utf8");
  writeJson(path.join(dir, "report.json"), {
    format: fmt.label,
    pass,
    checkedLines: lineCount,
    rounds: round,
    problems,
    fixes: fixesLog,
    faceNotes: faceNotes ?? [],
  });
  for (const f of fs.readdirSync(dir))
    if (f.endsWith("-mask.png") || f === "job.json")
      fs.rmSync(path.join(dir, f));
  if (pass) ok(`QC ${fmt.label}: all ${lineCount} lines pass`);
  else
    warn(
      `QC ${fmt.label}: ${problems.length} problem(s) remain - see ${report}`,
    );
  return {
    pass,
    format: fmt.label,
    checked,
    lines: lineCount,
    problems,
    rounds: round,
    report,
    dir,
  };
}

function readJsonSafe(file: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/** After rendering: take the QC moments from the real video and confirm they match the checked frames. */
export async function verifyVideo(
  p: Paths,
  fmt: Format,
  video: string,
  ffmpeg: string,
  env: NodeJS.ProcessEnv,
  fps: number,
): Promise<{ ok: boolean; worst: number }> {
  const dir = path.join(p.review, "qc", fmt.label);
  const frames = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.endsWith("-frame.jpg"))
    : [];
  const { run } = await import("./util");
  const report = readJsonSafe(path.join(dir, "measure.json")) as
    | { id: string; t: number }[]
    | null;
  if (!report || !frames.length) return { ok: true, worst: 0 };
  const pairs: { id: string; t: number; still: string; video: string }[] = [];
  for (const r of report) {
    const still = path.join(dir, `${r.id}-frame.jpg`);
    if (!fs.existsSync(still)) continue;
    const out = path.join(dir, `${r.id}-video.jpg`);
    await run(
      ffmpeg,
      [
        "-y",
        "-v",
        "error",
        // The same frame the QC still used (frame = round(t * fps)); seek half a frame
        // early so ffmpeg lands on it rather than the next one.
        "-ss",
        String(Math.max(0, (Math.round(r.t * fps) - 0.5) / fps)),
        "-i",
        video,
        "-frames:v",
        "1",
        out,
      ],
      { quiet: true, env, label: "Frame grab" },
    );
    pairs.push({ id: r.id, t: r.t, still, video: out });
  }
  const job = path.join(dir, "compare-job.json");
  writeJson(job, pairs);
  await py(
    ["compare", "--job", job, "--out", path.join(dir, "compare.json")],
    "Compare",
    true,
  );
  const res = readJson<{ id: string; diff: number }[]>(
    path.join(dir, "compare.json"),
  );
  const worst = Math.max(0, ...res.map((r) => r.diff));
  for (const pr of pairs) fs.rmSync(pr.video, { force: true });
  fs.rmSync(job, { force: true });
  return { ok: worst < 8, worst };
}

export { DEFAULT_FONT_FOR_SCRIPT };
