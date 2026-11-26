/**
 * Renders every image used by the README from the demo project:
 *   docs/images/presets.jpg + docs/images/presets/<name>.jpg   one frame per style
 *   docs/images/features/*.jpg                                 titles, lower thirds, logos...
 *
 *   npx tsx scripts/docs-images.ts            (all)
 *   npx tsx scripts/docs-images.ts presets    (only the style gallery)
 *   npx tsx scripts/docs-images.ts features   (only the feature images)
 *
 * Backgrounds are public-domain / CC0 photos (examples/photos/CREDITS.md).
 */
import fs from "node:fs";
import path from "node:path";
import { PRESET_NAMES } from "../src/style/presets";
import { renderStills, type FormatProps } from "./lib/render";
import { ROOT, py, readJson, writeJson } from "./lib/util";

const DEMO = path.join(ROOT, "examples", "demo");
const PHOTOS = path.join(ROOT, "examples", "photos");
const TMP = path.join(ROOT, ".cache", "docs-images");
const OUT = path.join(ROOT, "docs", "images");

/** How much to darken each photo so lyrics stay readable. */
const DIM: Record<string, number> = {
  neon: 0.5,
  "social-pop": 0.35,
  kinetic: 0.35,
  chalk: 0.15,
  "classic-karaoke": 0.3,
  "minimal-subtitles": 0.4,
};

type Project = Record<string, unknown>;

async function shot(
  name: string,
  photo: string,
  edit: (p: Project) => void,
  items: { time: number; out: string }[],
  fmt: FormatProps = {},
  scale = 0.5,
) {
  const dir = path.join(TMP, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.cpSync(DEMO, dir, { recursive: true });
  fs.copyFileSync(
    path.join(PHOTOS, `${photo}.jpg`),
    path.join(dir, "media", "background.jpg"),
  );
  fs.copyFileSync(
    path.join(PHOTOS, "logo-example.png"),
    path.join(dir, "media", "logo.png"),
  );
  const project = readJson<Project>(path.join(dir, "project.json"));
  project.background = {
    type: "image",
    src: "media/background.jpg",
    dim: DIM[photo] ?? 0.25,
  };
  project.graphics = [];
  project.sectionLabels = false;
  edit(project);
  writeJson(path.join(dir, "project.json"), project);
  fs.mkdirSync(path.dirname(items[0].out), { recursive: true });
  await renderStills(dir, items, scale, fmt);
  console.log(`rendered ${name}`);
}

async function presets() {
  const images: string[] = [];
  for (const name of PRESET_NAMES) {
    const out = path.join(OUT, "presets", `${name}.jpg`);
    await shot(`preset-${name}`, name, (p) => (p.style = { preset: name }), [
      { time: 7.4, out },
    ]);
    images.push(out);
  }
  await py(
    ["sheet", "--out", path.join(OUT, "presets.jpg"), ...images],
    "Contact sheet",
    true,
  );
}

async function features() {
  const F = (n: string) => path.join(OUT, "features", `${n}.jpg`);
  // Title card at the start.
  await shot(
    "title",
    "cinematic",
    (p) => {
      p.style = { preset: "cinematic" };
      p.graphics = [
        {
          type: "title",
          title: "Song Title",
          subtitle: "Artist name",
          start: 0,
          end: 2.3,
          at: { x: 0.5, y: 0.42 },
        },
      ];
    },
    [{ time: 1.2, out: F("title") }],
  );
  // Lower third + logo + section label over lyrics.
  await shot(
    "lower-third",
    "classic-karaoke",
    (p) => {
      p.style = { preset: "golden-sparkle", layout: { position: "bottom" } };
      p.sectionLabels = true;
      p.graphics = [
        {
          type: "lowerThird",
          title: "The Riverside Choir",
          subtitle: "Recorded live",
          start: 2.0,
          end: 6.0,
          side: "left",
        },
        {
          type: "image",
          src: "media/logo.png",
          start: 0,
          end: 22,
          width: 0.14,
          at: { x: 0.9, y: 0.9 },
          opacity: 0.9,
        },
      ];
    },
    [{ time: 3.8, out: F("lower-third-logo") }],
  );
  // Translations under the sung line (Arabic, right to left).
  await shot(
    "translations",
    "golden-sparkle",
    (p) => (p.style = { preset: "golden-sparkle" }),
    [{ time: 11.9, out: F("translations") }],
  );
  // Plain subtitles.
  await shot(
    "subtitles",
    "minimal-subtitles",
    (p) => (p.style = { preset: "minimal-subtitles" }),
    [{ time: 16.3, out: F("subtitles") }],
  );
  // Vertical social captions.
  await shot(
    "captions",
    "social-pop",
    (p) => (p.style = { preset: "social-pop" }),
    [{ time: 3.1, out: F("captions-vertical") }],
    { size: "1080", aspect: "9:16" },
    0.3,
  );
  // The same moment wide and tall.
  await shot(
    "wide",
    "scroll-focus",
    (p) => (p.style = { preset: "golden-sparkle" }),
    [{ time: 7.4, out: path.join(TMP, "wide.jpg") }],
  );
  await shot(
    "tall",
    "scroll-focus",
    (p) => (p.style = { preset: "golden-sparkle" }),
    [{ time: 7.4, out: path.join(TMP, "tall.jpg") }],
    { size: "1080", aspect: "9:16" },
    0.3,
  );
  await py(
    [
      "sheet",
      "--out",
      F("formats"),
      "--cols",
      "2",
      path.join(TMP, "wide.jpg"),
      path.join(TMP, "tall.jpg"),
    ],
    "Formats",
    true,
  );
  // End credits.
  await shot(
    "credits",
    "cinematic",
    (p) => {
      p.style = { preset: "cinematic" };
      p.graphics = [
        {
          type: "credits",
          lines: [
            "Thank you for listening",
            "Music: Your Choir",
            "Video: Your Team",
          ],
          start: 18.3,
          end: 22,
        },
      ];
    },
    [{ time: 20.5, out: F("credits") }],
  );
}

async function main() {
  const which = process.argv[2] ?? "all";
  fs.mkdirSync(TMP, { recursive: true });
  if (which === "all" || which === "presets") await presets();
  if (which === "all" || which === "features") await features();
  console.log(`Images written to ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
