/** Rendering through Remotion's Node API: bundle once, then render video or stills. */
import { bundle } from "@remotion/bundler";
import {
  ensureBrowser,
  openBrowser,
  renderMedia,
  renderStill,
  selectComposition,
} from "@remotion/renderer";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ProjectSchema } from "../../src/schema/project";
import { styleUsesWebGL } from "../../src/schema/style";
import { resolveStyle } from "../../src/style/resolve";
import { ROOT, info } from "./util";
import { webpackOverride } from "./webpack";

const ENTRY = path.join(ROOT, "src", "index.ts");
const COMPOSITION = "LyricVideo";

type ProjectNeeds = { webgl: boolean; audio: string | null };

/** What a project asks of the renderer: WebGL (GPU looks, 3D, shaders, leaks) and the visualizer WAV. */
function projectNeeds(projectDir: string): ProjectNeeds {
  try {
    const raw = JSON.parse(
      fs.readFileSync(path.join(projectDir, "project.json"), "utf8"),
    );
    const project = ProjectSchema.parse(raw);
    const style = resolveStyle(project.style as Record<string, unknown>);
    const webgl =
      styleUsesWebGL(style) ||
      project.graphics.some(
        (g) => g.type === "lightLeak" || g.type === "starburst",
      );
    const a = project.media.audio;
    const audio =
      style.effects.visualizer.type === "none"
        ? null
        : a && /\.wav$/i.test(a)
          ? null // already in media/
          : "work/audio.wav";
    return { webgl, audio };
  } catch {
    return { webgl: false, audio: null };
  }
}

/**
 * Chrome options. WebGL needs a GPU backend: ANGLE by default, or set
 * MOTION_LYRICS_GL (angle, swangle, egl, vulkan, swiftshader) if a machine needs another.
 */
function chromiumFor(needs: ProjectNeeds) {
  if (!needs.webgl) return {};
  const gl = (process.env.MOTION_LYRICS_GL ?? "angle") as
    | "angle"
    | "swangle"
    | "egl"
    | "vulkan"
    | "swiftshader";
  return { gl };
}

/**
 * Remotion copies the public folder into every bundle, so render from a staging
 * folder holding only what the video reads (not earlier renders or work files).
 */
function stagePublic(projectDir: string, needs: ProjectNeeds): string {
  const stage = path.join(projectDir, "work", "public");
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });
  for (const f of ["project.json", "song.json", "analysis.json"]) {
    const src = path.join(projectDir, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(stage, f));
  }
  if (needs.audio) {
    const src = path.join(projectDir, needs.audio);
    if (fs.existsSync(src)) {
      const to = path.join(stage, needs.audio);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      try {
        fs.linkSync(src, to);
      } catch {
        fs.copyFileSync(src, to);
      }
    }
  }
  for (const dir of ["media", "fonts"]) {
    const src = path.join(projectDir, dir);
    if (!fs.existsSync(src)) continue;
    for (const entry of fs.readdirSync(src, {
      recursive: true,
      withFileTypes: true,
    })) {
      if (!entry.isFile()) continue;
      const from = path.join(entry.parentPath, entry.name);
      const to = path.join(stage, path.relative(projectDir, from));
      fs.mkdirSync(path.dirname(to), { recursive: true });
      try {
        fs.linkSync(from, to);
      } catch {
        fs.copyFileSync(from, to);
      }
    }
  }
  return stage;
}

async function bundleProject(
  projectDir: string,
  needs: ProjectNeeds,
): Promise<string> {
  let last = -10;
  const url = await bundle({
    entryPoint: ENTRY,
    publicDir: stagePublic(projectDir, needs),
    webpackOverride,
    onProgress: (p) => {
      if (p - last >= 25 || p === 100) {
        info(`Bundling ${p}%`);
        last = p;
      }
    },
  });
  // Remember temporary bundles so `npm run approve` can clean them up.
  const list = path.join(projectDir, "work", "bundles.json");
  const prev: string[] = fs.existsSync(list)
    ? JSON.parse(fs.readFileSync(list, "utf8"))
    : [];
  fs.writeFileSync(list, JSON.stringify([...new Set([...prev, url])], null, 2));
  return url;
}

export type FormatProps = {
  size?: "source" | "1080" | "4k";
  aspect?: "source" | "16:9" | "9:16";
};

export type RenderOptions = FormatProps & {
  out: string;
  debug?: boolean;
  scale?: number;
  crf?: number;
  concurrency?: number | null;
  frameRange?: [number, number];
};

export async function renderVideo(projectDir: string, o: RenderOptions) {
  await ensureBrowser();
  const needs = projectNeeds(projectDir);
  const chromiumOptions = chromiumFor(needs);
  const serveUrl = await bundleProject(projectDir, needs);
  const inputProps = {
    debug: !!o.debug,
    size: o.size ?? "source",
    aspect: o.aspect ?? "source",
    qcMask: false,
    preset: "",
  };
  try {
    const composition = await selectComposition({
      serveUrl,
      id: COMPOSITION,
      inputProps,
      chromiumOptions,
      timeoutInMilliseconds: 120000,
    });
    info(
      `${composition.width}x${composition.height} @ ${composition.fps} fps, ${composition.durationInFrames} frames`,
    );
    let lastPct = -1;
    const started = Date.now();
    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      outputLocation: o.out,
      inputProps,
      scale: o.scale ?? 1,
      crf: o.crf ?? 17,
      imageFormat: "jpeg",
      jpegQuality: 92,
      audioCodec: "aac",
      audioBitrate: "320k",
      pixelFormat: "yuv420p",
      concurrency:
        o.concurrency ??
        Math.max(1, Math.min(8, Math.floor(os.cpus().length / 2))),
      frameRange: o.frameRange ?? null,
      enforceAudioTrack: true,
      chromiumOptions,
      overwrite: true,
      timeoutInMilliseconds: 120000,
      onProgress: ({ progress, renderedFrames, encodedFrames }) => {
        const pct = Math.floor(progress * 100);
        if (pct >= lastPct + 5) {
          lastPct = pct;
          const secs = (Date.now() - started) / 1000;
          const eta =
            progress > 0.02
              ? Math.round((secs / progress) * (1 - progress))
              : null;
          info(
            `Rendering ${pct}%  (${renderedFrames} rendered, ${encodedFrames} encoded${eta !== null ? `, ~${eta}s left` : ""})`,
          );
        }
      },
    });
  } finally {
    dropBundle(projectDir, serveUrl);
  }
}

/** Bundles are ~140 MB each; delete them as soon as a render is done. */
function dropBundle(projectDir: string, serveUrl: string) {
  try {
    fs.rmSync(serveUrl, { recursive: true, force: true });
    const list = path.join(projectDir, "work", "bundles.json");
    if (fs.existsSync(list)) {
      const rest = (
        JSON.parse(fs.readFileSync(list, "utf8")) as string[]
      ).filter((b) => b !== serveUrl && fs.existsSync(b));
      fs.writeFileSync(list, JSON.stringify(rest, null, 2));
    }
  } catch {
    /* left for npm run approve to clean up */
  }
}

/** Render still frames (JPEG) at the given times, reusing one browser. */
export async function renderStills(
  projectDir: string,
  items: { time: number; out: string; qcMask?: boolean; preset?: string }[],
  scale = 0.5,
  opts: FormatProps & { debug?: boolean; needs?: Partial<ProjectNeeds> } = {},
) {
  await ensureBrowser();
  const needs = { ...projectNeeds(projectDir), ...opts.needs };
  const chromiumOptions = chromiumFor(needs);
  const serveUrl = await bundleProject(projectDir, needs);
  const inputProps = {
    debug: !!opts.debug,
    size: opts.size ?? "source",
    aspect: opts.aspect ?? "source",
    qcMask: false,
    preset: "",
  };
  // Chrome with the GPU backend can be slow to start the first time; try twice.
  const browser = await openBrowser("chrome", { chromiumOptions }).catch(
    (e) => {
      if (!/timed out/i.test(String(e))) throw e;
      return openBrowser("chrome", { chromiumOptions });
    },
  );
  try {
    const composition = await selectComposition({
      serveUrl,
      id: COMPOSITION,
      inputProps,
      puppeteerInstance: browser,
      timeoutInMilliseconds: 120000,
    });
    // One composition per (mask, preset): each resolves its own style in calculateMetadata.
    const comps = new Map<string, typeof composition>([["0|", composition]]);
    for (const it of items) {
      const frame = Math.min(
        composition.durationInFrames - 1,
        Math.max(0, Math.round(it.time * composition.fps)),
      );
      const props = {
        ...inputProps,
        qcMask: !!it.qcMask,
        preset: it.preset ?? "",
      };
      const key = `${props.qcMask ? 1 : 0}|${props.preset}`;
      if (!comps.has(key))
        comps.set(
          key,
          await selectComposition({
            serveUrl,
            id: COMPOSITION,
            inputProps: props,
            puppeteerInstance: browser,
            timeoutInMilliseconds: 120000,
          }),
        );
      const comp = comps.get(key)!;
      const once = () =>
        renderStill({
          composition: comp,
          serveUrl,
          frame,
          output: it.out,
          inputProps: props,
          ...(it.qcMask
            ? { imageFormat: "png" as const }
            : { imageFormat: "jpeg" as const, jpegQuality: 88 }),
          scale,
          puppeteerInstance: browser,
          overwrite: true,
          timeoutInMilliseconds: 120000,
        });
      try {
        await once();
      } catch (e) {
        if (!/timed out/i.test(String(e))) throw e;
        await once(); // one retry: a busy machine can be slow to open a page
      }
    }
  } finally {
    await browser.close({ silent: true });
    dropBundle(projectDir, serveUrl);
  }
}
