/**
 * Builds examples/demo: a 20-second multilingual demo that needs no setup.
 * Timing is synthetic (each word gets a soft tone at its start), so this runs
 * the real lyrics parser and song builder without the audio pipeline.
 *
 *   npx tsx scripts/make-demo.ts
 */
import fs from "node:fs";
import path from "node:path";
import { parseLyrics } from "../src/core/lyrics";
import { graphemes } from "../src/core/segment";
import { ProjectSchema } from "../src/schema/project";
import { buildSong, type Alignment } from "./lib/song";
import { ROOT, writeJson } from "./lib/util";

const DIR = path.join(ROOT, "examples", "demo");
const DURATION = 22;

const LYRICS = `@title: Motion Lyrics Demo
@lang: en, hi, ar, ja

# Placeholder lyrics that show several scripts. Lines starting with ">" are
# translations: shown under the sung line, highlighted along with it.

[Verse]
Every voice can carry light
> {es} Cada voz puede llevar luz

हर आवाज़ में रोशनी है
> There is light in every voice

[Chorus]
كل صوت يحمل نورا
> Every voice carries light

すべての声に光がある
> There is light in every voice
`;

function synthWav(file: string, notes: { t: number; d: number; f: number }[]) {
  const sr = 22050;
  const n = Math.round(DURATION * sr);
  const data = new Float32Array(n);
  for (const note of notes) {
    const a = Math.round(note.t * sr);
    const len = Math.round(note.d * sr);
    for (let i = 0; i < len && a + i < n; i++) {
      const x = i / sr;
      const env =
        Math.min(1, x / 0.02) * Math.exp(-x / Math.max(0.15, note.d * 0.6));
      data[a + i] +=
        0.22 *
        env *
        (Math.sin(2 * Math.PI * note.f * x) +
          0.3 * Math.sin(4 * Math.PI * note.f * x));
    }
  }
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++)
    buf.writeInt16LE(
      Math.max(-32767, Math.min(32767, Math.round(data[i] * 32767))),
      44 + i * 2,
    );
  fs.writeFileSync(file, buf);
}

function main() {
  fs.mkdirSync(path.join(DIR, "media"), { recursive: true });
  fs.writeFileSync(path.join(DIR, "lyrics.txt"), LYRICS, "utf8");
  const parsed = parseLyrics(LYRICS);
  if (parsed.warnings.length) throw new Error(parsed.warnings.join("\n"));

  // Synthetic timing: sung lines at a steady pace, words sized by length.
  const scale = [392, 440, 494, 523, 587, 659];
  const notes: { t: number; d: number; f: number }[] = [];
  const lines: Alignment["lines"] = [];
  let t = 2.4;
  for (const g of parsed.groups) {
    for (const l of g.lines.filter((x) => x.sung)) {
      const lens = l.words.map((w) =>
        Math.max(2, graphemes(w.text, l.lang).length),
      );
      const total = lens.reduce((a, b) => a + b, 0);
      const lineDur = 3.0;
      let acc = 0;
      const words = l.words.map((w, i) => {
        const s = t + (lineDur * acc) / total;
        acc += lens[i];
        const e = t + (lineDur * acc) / total;
        notes.push({
          t: s,
          d: e - s,
          f: scale[(i + lines.length) % scale.length],
        });
        return {
          id: w.id,
          text: w.text,
          start: s,
          end: e - 0.04,
          score: 0.9,
          voiced: 1,
          flags: [],
          conf: 0.95,
        };
      });
      lines.push({ id: l.id, words, conf: 0.95, flags: [] });
      t += lineDur + 1.15;
    }
  }
  synthWav(path.join(DIR, "media", "tones.wav"), notes);
  // Public-domain sunset photo (examples/photos/CREDITS.md).
  fs.copyFileSync(
    path.join(ROOT, "examples", "photos", "golden-sparkle.jpg"),
    path.join(DIR, "media", "background.jpg"),
  );
  const { song } = buildSong(parsed, { version: 1, lines }, DURATION, null);
  writeJson(path.join(DIR, "song.json"), song);
  writeJson(path.join(DIR, "analysis.json"), {
    version: 1,
    duration: DURATION,
    beats: [],
    tempo: null,
    envelope: null,
    faces: [],
  });
  writeJson(
    path.join(DIR, "project.json"),
    ProjectSchema.parse({
      $schema: "../../schema/project.schema.json",
      title: "Motion Lyrics Demo",
      media: {
        audio: "media/tones.wav",
        duration: DURATION,
        width: 1920,
        height: 1080,
        fps: 30,
      },
      background: { type: "image", src: "media/background.jpg", dim: 0.2 },
      style: { preset: "golden-sparkle" },
      sectionLabels: true,
      graphics: [
        {
          type: "title",
          title: "Motion Lyrics",
          subtitle: "Any video, any language",
          start: 0,
          end: 2.3,
          at: { x: 0.5, y: 0.42 },
        },
      ],
      pipeline: { verify: false },
    }),
  );
  console.log(`Demo written to ${DIR}`);
}

main();
