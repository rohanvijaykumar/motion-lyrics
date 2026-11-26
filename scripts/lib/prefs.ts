/**
 * Preferences: everything a person can choose without touching code.
 *
 *   presets/*.json               your own named looks ({ "extends": "chalk", ... })
 *   motion-lyrics.config.json    your house defaults for every new project
 *   command-line flags           --preset --position --avoid-faces --font --color
 *   interactive questions        asked by `make` before a new video starts
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { getAvailableFonts } from "@remotion/google-fonts";
import { FONT_EXTENSIONS, parseFontFile } from "../../src/core/fontfiles";
import { deepMerge } from "../../src/core/merge";
import { PRESETS, PRESET_NAMES } from "../../src/style/presets";
import {
  ROOT,
  bold,
  cyan,
  dim,
  exists,
  fail,
  info,
  readJson,
  warn,
} from "./util";

export const PRESETS_DIR = path.join(ROOT, "presets");
export const CONFIG_FILE = path.join(ROOT, "motion-lyrics.config.json");

export type CustomPreset = {
  name: string;
  extends: string;
  description: string;
  style: Record<string, unknown>;
};

/** Presets from presets/*.json. Each extends a built-in preset (or another custom one). */
export function customPresets(): CustomPreset[] {
  if (!exists(PRESETS_DIR)) return [];
  const out: CustomPreset[] = [];
  for (const f of fs
    .readdirSync(PRESETS_DIR)
    .filter((x) => x.endsWith(".json"))) {
    const raw = readJson<Record<string, unknown>>(path.join(PRESETS_DIR, f));
    const style: Record<string, unknown> = { ...raw };
    const ext = String(raw.extends ?? "golden-sparkle");
    const description = String(raw.description ?? "");
    for (const k of ["extends", "description", "$schema"]) delete style[k];
    out.push({
      name: f.replace(/\.json$/, ""),
      extends: String(ext),
      description: String(description),
      style,
    });
  }
  return out;
}

/** Turn a preset name (built-in or custom) into a project "style" block. */
export function styleForPreset(name: string): Record<string, unknown> {
  if (PRESET_NAMES.includes(name)) return { preset: name };
  const customs = customPresets();
  const seen = new Set<string>();
  const chain: CustomPreset[] = [];
  let cur = customs.find((c) => c.name === name);
  if (!cur)
    fail(
      `Unknown preset "${name}". Built-in: ${PRESET_NAMES.join(", ")}${customs.length ? `; yours: ${customs.map((c) => c.name).join(", ")}` : ""}`,
    );
  while (cur) {
    if (seen.has(cur.name)) fail(`Preset "${name}" extends itself in a loop`);
    seen.add(cur.name);
    chain.unshift(cur);
    const parent: string = cur.extends;
    cur = PRESET_NAMES.includes(parent)
      ? undefined
      : customs.find((c) => c.name === parent);
    if (!cur && !PRESET_NAMES.includes(parent))
      fail(`Preset "${chain[0].name}" extends unknown preset "${parent}"`);
  }
  let style: Record<string, unknown> = { preset: chain[0].extends };
  for (const c of chain) style = deepMerge(style, c.style);
  style.from = name;
  return style;
}

export type HouseConfig = {
  preset?: string;
  position?: "bottom" | "center" | "top";
  avoidFaces?: boolean;
  font?: string;
  color?: string;
  style?: Record<string, unknown>;
  background?: Record<string, unknown>;
  graphics?: unknown[];
  pipeline?: Record<string, unknown>;
  export?: { size?: "1080" | "4k"; aspect?: "16:9" | "9:16"; all?: boolean };
  ask?: boolean;
};

export function houseConfig(): HouseConfig {
  return exists(CONFIG_FILE) ? readJson<HouseConfig>(CONFIG_FILE) : {};
}

/** Is `name` a Google Font? (Local fonts are files instead.) */
export function isGoogleFont(name: string): boolean {
  return getAvailableFonts().some(
    (f) => f.fontFamily.toLowerCase() === name.toLowerCase(),
  );
}

export function googleFontName(name: string): string | null {
  return (
    getAvailableFonts().find(
      (f) => f.fontFamily.toLowerCase() === name.toLowerCase(),
    )?.fontFamily ?? null
  );
}

/**
 * --font accepts a font file (copied into the project's fonts/ folder) or a
 * Google Fonts family name. Returns the family to use.
 */
export function installFont(projectDir: string, font: string): string {
  const asFile = path.resolve(font);
  if (
    exists(asFile) &&
    FONT_EXTENSIONS.includes(path.extname(asFile).toLowerCase())
  ) {
    const dir = path.join(projectDir, "fonts");
    fs.mkdirSync(dir, { recursive: true });
    const dst = path.join(dir, path.basename(asFile));
    fs.copyFileSync(asFile, dst);
    const parsed = parseFontFile(`fonts/${path.basename(asFile)}`)!;
    info(
      `Font file added: ${path.basename(asFile)} -> family "${parsed.family}" weight ${parsed.weight}`,
    );
    return parsed.family;
  }
  const g = googleFontName(font);
  if (!g)
    fail(
      `"${font}" is neither a font file nor a Google Fonts family. Browse names at https://fonts.google.com`,
    );
  return g;
}

export type Choices = {
  preset: string;
  position: "bottom" | "center" | "top";
  avoidFaces: boolean;
  font?: string;
  color?: string;
};

/** Apply choices on top of a style block (fonts set for both tiers). */
export function applyChoices(
  style: Record<string, unknown>,
  c: Partial<Choices>,
  family?: string,
): Record<string, unknown> {
  let s = style;
  const layout: Record<string, unknown> = {};
  if (c.position) layout.position = c.position;
  if (c.avoidFaces !== undefined) layout.avoidFaces = c.avoidFaces;
  if (Object.keys(layout).length) s = deepMerge(s, { layout });
  if (family)
    s = deepMerge(s, {
      text: {
        primary: { fontFamily: family },
        secondary: { fontFamily: family },
      },
    });
  if (c.color)
    s = deepMerge(s, {
      text: {
        primary: { sungColor: c.color },
        secondary: { sungColor: c.color },
      },
    });
  return s;
}

/**
 * Ask the person how the video should look, before any work starts.
 * Only in an interactive terminal; agents pass flags instead (AGENTS.md step 1).
 */
export async function askChoices(defaults: Choices): Promise<Choices> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const all = [...PRESET_NAMES, ...customPresets().map((c) => c.name)];
    console.log(
      `\n${bold("A few choices before we start")} ${dim("(press Enter to keep the value in brackets)")}\n`,
    );
    all.forEach((n, i) =>
      console.log(
        `  ${cyan(String(i + 1).padStart(2))}. ${n.padEnd(18)} ${dim((PRESETS[n]?.description ?? customPresets().find((c) => c.name === n)?.description ?? "").slice(0, 90))}`,
      ),
    );
    const p = (await rl.question(`\n  Style [${defaults.preset}]: `)).trim();
    const preset = p
      ? (all[Number(p) - 1] ?? (all.includes(p) ? p : defaults.preset))
      : defaults.preset;
    if (
      p &&
      preset === defaults.preset &&
      p !== defaults.preset &&
      !all[Number(p) - 1]
    )
      warn(`Unknown style "${p}", keeping ${defaults.preset}`);
    const pos = (
      await rl.question(
        `  Where should the lyrics sit? bottom / center / top [${defaults.position}]: `,
      )
    )
      .trim()
      .toLowerCase();
    const position = (
      ["bottom", "center", "top"].includes(pos) ? pos : defaults.position
    ) as Choices["position"];
    const af = (
      await rl.question(
        `  Move lyrics away from faces when they would cover one? (they may change position) y/N [${defaults.avoidFaces ? "y" : "n"}]: `,
      )
    )
      .trim()
      .toLowerCase();
    const avoidFaces = af ? af.startsWith("y") : defaults.avoidFaces;
    const font =
      (
        await rl.question(
          `  Font: a Google Fonts name or a font file path, or Enter for the style's font${defaults.font ? ` [${defaults.font}]` : ""}: `,
        )
      ).trim() || defaults.font;
    console.log("");
    return { preset, position, avoidFaces, font, color: defaults.color };
  } finally {
    rl.close();
  }
}

export function listPresets() {
  const customs = customPresets();
  console.log(
    bold("Built-in presets") +
      dim(
        '  (choose with --preset <name>, or "style": { "preset": "<name>" } in project.json)\n',
      ),
  );
  for (const name of PRESET_NAMES)
    console.log(`  ${cyan(bold(name))}\n    ${PRESETS[name].description}\n`);
  console.log(
    bold("Your presets") +
      dim("  (JSON files in presets/; see presets/README.md)\n"),
  );
  if (!customs.length) console.log(dim("  none yet\n"));
  for (const c of customs)
    console.log(
      `  ${cyan(bold(c.name))} ${dim(`(extends ${c.extends})`)}\n    ${c.description || dim("no description")}\n`,
    );
}
