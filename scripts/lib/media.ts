/** Probing and converting media with ffmpeg (the system one if present, else Remotion's bundled copy). */
import fs from "node:fs";
import path from "node:path";
import { CliError, ROOT, fail, run, which } from "./util";

type Bin = {
  ffmpeg: string;
  ffprobe: string;
  env: NodeJS.ProcessEnv;
  source: string;
};
let cached: Bin | null = null;

export function ffBinaries(): Bin {
  if (cached) return cached;
  const sysF = which("ffmpeg");
  const sysP = which("ffprobe");
  if (sysF && sysP)
    return (cached = {
      ffmpeg: sysF,
      ffprobe: sysP,
      env: {},
      source: "system",
    });
  const dir = path.join(ROOT, "node_modules", "@remotion");
  const exe = process.platform === "win32" ? ".exe" : "";
  const comp = fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((d) => d.startsWith("compositor-"))
        .map((d) => path.join(dir, d))
        .find((d) => fs.existsSync(path.join(d, `ffprobe${exe}`)))
    : undefined;
  if (!comp)
    fail(
      "ffmpeg was not found. Run `npm install` (Remotion ships its own ffmpeg) or install ffmpeg.",
    );
  const env =
    process.platform === "win32"
      ? {}
      : { LD_LIBRARY_PATH: comp, DYLD_LIBRARY_PATH: comp };
  return (cached = {
    ffmpeg: path.join(comp, `ffmpeg${exe}`),
    ffprobe: path.join(comp, `ffprobe${exe}`),
    env,
    source: "remotion",
  });
}

export type MediaInfo = {
  duration: number;
  hasVideo: boolean;
  hasAudio: boolean;
  width: number;
  height: number;
  fps: number;
  videoCodec: string | null;
  audioCodec: string | null;
  pixFmt: string | null;
  rotation: number;
};

export async function probe(file: string): Promise<MediaInfo> {
  const b = ffBinaries();
  const out = await run(
    b.ffprobe,
    ["-v", "error", "-show_streams", "-show_format", "-of", "json", file],
    {
      quiet: true,
      env: b.env,
      label: "ffprobe",
    },
  );
  const j = JSON.parse(out) as {
    streams: {
      codec_type: string;
      codec_name: string;
      width?: number;
      height?: number;
      avg_frame_rate?: string;
      r_frame_rate?: string;
      pix_fmt?: string;
      tags?: { rotate?: string };
      side_data_list?: { rotation?: number }[];
    }[];
    format: { duration?: string };
  };
  const v = j.streams.find(
    (s) =>
      s.codec_type === "video" &&
      s.codec_name !== "mjpeg" &&
      s.codec_name !== "png",
  );
  const a = j.streams.find((s) => s.codec_type === "audio");
  const rate = (r?: string) => {
    if (!r) return 0;
    const [n, d] = r.split("/").map(Number);
    return d ? n / d : n;
  };
  let fps = rate(v?.avg_frame_rate) || rate(v?.r_frame_rate) || 30;
  if (!Number.isFinite(fps) || fps <= 0 || fps > 240) fps = 30;
  const rotation = Number(
    v?.tags?.rotate ??
      v?.side_data_list?.find((x) => x.rotation !== undefined)?.rotation ??
      0,
  );
  const swap = Math.abs(rotation) % 180 === 90;
  const duration = Number(j.format.duration ?? 0);
  if (!duration)
    throw new CliError(
      `Could not read the duration of ${file}. Is it a valid video or audio file?`,
    );
  return {
    duration,
    hasVideo: !!v,
    hasAudio: !!a,
    width: (swap ? v?.height : v?.width) ?? 1920,
    height: (swap ? v?.width : v?.height) ?? 1080,
    fps: Math.round(fps * 1000) / 1000,
    videoCodec: v?.codec_name ?? null,
    audioCodec: a?.codec_name ?? null,
    pixFmt: v?.pix_fmt ?? null,
    rotation,
  };
}

/** Can Remotion's browser decode this video directly, or must we convert it? */
export function needsTranscode(info: MediaInfo, file: string): boolean {
  const ext = path.extname(file).toLowerCase();
  const okCodec =
    info.videoCodec === "h264" &&
    (info.pixFmt === "yuv420p" || info.pixFmt === "yuvj420p");
  return !(
    okCodec &&
    [".mp4", ".mov", ".m4v"].includes(ext) &&
    info.rotation === 0
  );
}

export async function transcode(src: string, dst: string) {
  const b = ffBinaries();
  await run(
    b.ffmpeg,
    [
      "-y",
      "-v",
      "error",
      "-stats",
      "-i",
      src,
      "-map",
      "0:v:0",
      "-map",
      "0:a:0?",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "16",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "256k",
      "-movflags",
      "+faststart",
      dst,
    ],
    { env: b.env, label: "Converting video" },
  );
}

/** Song audio as 44.1 kHz stereo WAV for the pipeline. */
export async function extractAudio(src: string, dst: string) {
  const b = ffBinaries();
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  await run(
    b.ffmpeg,
    [
      "-y",
      "-v",
      "error",
      "-i",
      src,
      "-vn",
      "-ac",
      "2",
      "-ar",
      "44100",
      "-c:a",
      "pcm_s16le",
      dst,
    ],
    {
      env: b.env,
      label: "Extracting audio",
    },
  );
}
