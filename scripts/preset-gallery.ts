/**
 * Renders the demo once per preset and tiles the frames into docs/images/presets.jpg.
 *
 *   npx tsx scripts/preset-gallery.ts
 */
import fs from "node:fs";
import path from "node:path";
import { PRESET_NAMES } from "../src/style/presets";
import { renderStills } from "./lib/render";
import { ROOT, py, readJson, writeJson } from "./lib/util";

const DEMO = path.join(ROOT, "examples", "demo");
const TMP = path.join(ROOT, ".cache", "gallery");
const TIME = Number(process.argv[2] ?? 7.4);

async function main() {
  fs.rmSync(TMP, { recursive: true, force: true });
  const images: string[] = [];
  for (const name of PRESET_NAMES) {
    const dir = path.join(TMP, name);
    fs.cpSync(DEMO, dir, { recursive: true });
    const project = readJson<Record<string, unknown>>(
      path.join(dir, "project.json"),
    );
    project.style = { preset: name };
    project.graphics = [];
    project.sectionLabels = false;
    writeJson(path.join(dir, "project.json"), project);
    const out = path.join(TMP, `${name}.jpg`);
    await renderStills(dir, [{ time: TIME, out }], 0.5);
    images.push(out);
    console.log(`rendered ${name}`);
  }
  const sheet = path.join(ROOT, "docs", "images", "presets.jpg");
  fs.mkdirSync(path.dirname(sheet), { recursive: true });
  await py(["sheet", "--out", sheet, ...images], "Contact sheet", true);
  console.log(`Wrote ${sheet}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
