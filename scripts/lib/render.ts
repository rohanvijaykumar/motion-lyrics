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
import { ROOT, info } from "./util";

const ENTRY = path.join(ROOT, "src", "index.ts");
const COMPOSITION = "LyricVideo";

/**
 * Remotion copies the public folder into every bundle, so render from a staging
 * folder holding only what the video reads (not earlier renders or work files).
 */
function stagePublic(projectDir: string): string {
  const stage = path.join(projectDir, "work", "public");
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });
  for (const f of ["project.json", "song.json", "analysis.json"]) {
    const src = path.join(projectDir, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(stage, f));
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

async function bundleProject(projectDir: string): Promise<string> {
  let last = -10;
  const url = await bundle({
    entryPoint: ENTRY,
    publicDir: stagePublic(projectDir),
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
  const serveUrl = await bundleProject(projectDir);
  const inputProps = {
    debug: !!o.debug,
    size: o.size ?? "source",
    aspect: o.aspect ?? "source",
    qcMask: false,
  };
  try {
    const composition = await selectComposition({
      serveUrl,
      id: COMPOSITION,
      inputProps,
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
  items: { time: number; out: string; qcMask?: boolean }[],
  scale = 0.5,
  opts: FormatProps & { debug?: boolean } = {},
) {
  await ensureBrowser();
  const serveUrl = await bundleProject(projectDir);
  const inputProps = {
    debug: !!opts.debug,
    size: opts.size ?? "source",
    aspect: opts.aspect ?? "source",
    qcMask: false,
  };
  const browser = await openBrowser("chrome");
  try {
    const composition = await selectComposition({
      serveUrl,
      id: COMPOSITION,
      inputProps,
      puppeteerInstance: browser,
      timeoutInMilliseconds: 120000,
    });
    let maskComposition: Awaited<ReturnType<typeof selectComposition>> | null =
      null;
    for (const it of items) {
      const frame = Math.min(
        composition.durationInFrames - 1,
        Math.max(0, Math.round(it.time * composition.fps)),
      );
      const props = { ...inputProps, qcMask: !!it.qcMask };
      if (it.qcMask && !maskComposition)
        maskComposition = await selectComposition({
          serveUrl,
          id: COMPOSITION,
          inputProps: props,
          puppeteerInstance: browser,
          timeoutInMilliseconds: 120000,
        });
      const comp = it.qcMask ? maskComposition! : composition;
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
