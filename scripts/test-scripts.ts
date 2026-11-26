/**
 * Visual test across scripts and layouts. Builds a project with synthetic
 * timing in seven scripts (Tamil, Thai, Chinese, Korean, Hebrew, Russian,
 * Bengali), renders frames with every preset (social-pop in vertical 9:16),
 * and tiles them into .cache/script-test/sheet.jpg for a person or agent to inspect.
 *
 *   npx tsx scripts/test-scripts.ts
 */
import fs from "node:fs";
import path from "node:path";
import { parseLyrics } from "../src/core/lyrics";
import { graphemes } from "../src/core/segment";
import { ProjectSchema } from "../src/schema/project";
import { PRESET_NAMES } from "../src/style/presets";
import { renderStills } from "./lib/render";
import { buildSong, type Alignment } from "./lib/song";
import { ROOT, py, writeJson } from "./lib/util";

const OUT = path.join(ROOT, ".cache", "script-test");
const LYRICS = `@lang: ta, th, zh, ko, he, ru, bn, en

ஒவ்வொரு குரலும் ஒளி தரும்
> Every voice gives light

ทุกเสียงมีแสงสว่าง
> Every voice has light

每个声音都有光
> Every voice has light

모든 목소리에 빛이 있어
> There is light in every voice

בכל קול יש אור
> In every voice there is light

В каждом голосе есть свет
> In every voice there is light

প্রতিটি কণ্ঠে আলো আছে
> Every voice has light
`;

function build(dir: string, preset: string, width: number, height: number) {
  fs.mkdirSync(dir, { recursive: true });
  const parsed = parseLyrics(LYRICS, { tokenize: { zh: "char" } });
  if (parsed.warnings.length) throw new Error(parsed.warnings.join("\n"));
  const lines: Alignment["lines"] = [];
  const mids: number[] = [];
  let t = 1.0;
  for (const g of parsed.groups) {
    for (const l of g.lines.filter((x) => x.sung)) {
      const lens = l.words.map((w) =>
        Math.max(2, graphemes(w.text, l.lang).length),
      );
      const total = lens.reduce((a, b) => a + b, 0);
      let acc = 0;
      const words = l.words.map((w, i) => {
        const s = t + (2.8 * acc) / total;
        acc += lens[i];
        const e = t + (2.8 * acc) / total;
        return {
          id: w.id,
          text: w.text,
          start: s,
          end: e - 0.03,
          score: 0.9,
          voiced: 1,
          flags: [],
          conf: 0.95,
        };
      });
      lines.push({ id: l.id, words, conf: 0.95, flags: [] });
      mids.push(t + 1.6);
      t += 4.0;
    }
  }
  const duration = t + 1;
  const { song } = buildSong(parsed, { version: 1, lines }, duration, null);
  writeJson(path.join(dir, "song.json"), song);
  writeJson(path.join(dir, "analysis.json"), {
    version: 1,
    duration,
    beats: [],
    tempo: null,
    envelope: null,
    faces: [],
  });
  writeJson(
    path.join(dir, "project.json"),
    ProjectSchema.parse({
      media: { duration, width, height, fps: 30 },
      background: { type: "gradient" },
      style: { preset },
      tokenize: { zh: "char" },
    }),
  );
  return mids;
}

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  const images: string[] = [];
  for (const preset of PRESET_NAMES) {
    const vertical = preset === "social-pop";
    const dir = path.join(OUT, preset);
    const mids = build(
      dir,
      preset,
      vertical ? 1080 : 1920,
      vertical ? 1920 : 1080,
    );
    const pick =
      preset === "golden-sparkle"
        ? mids.map((m, i) => [m, i] as const)
        : [
            [
              mids[(PRESET_NAMES.indexOf(preset) * 2) % mids.length],
              0,
            ] as const,
            [
              mids[(PRESET_NAMES.indexOf(preset) * 2 + 3) % mids.length],
              1,
            ] as const,
          ];
    const items = pick.map(([time, i]) => ({
      time,
      out: path.join(OUT, `${preset}-${i}.jpg`),
    }));
    await renderStills(dir, items, vertical ? 0.28 : 0.5);
    images.push(...items.map((x) => x.out));
    console.log(`rendered ${preset}`);
  }
  await py(
    ["sheet", "--out", path.join(OUT, "sheet.jpg"), ...images],
    "Contact sheet",
    true,
  );
  console.log(`Wrote ${path.join(OUT, "sheet.jpg")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
