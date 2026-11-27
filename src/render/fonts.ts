/**
 * Font selection and loading for any script.
 *
 * For each line we build a font stack: the style's font for that script, then
 * the style's main font, then the Noto family made for the script. Only the
 * slices of each font that contain characters actually used in the lyrics are
 * downloaded (Chinese and Japanese fonts come in ~100 slices), and rendering
 * waits until they are ready so no frame ever shows a fallback font.
 */
import { getAvailableFonts } from "@remotion/google-fonts";
import { loadFont as loadLocalFont } from "@remotion/fonts";
import { continueRender, delayRender, staticFile } from "remotion";
import {
  DEFAULT_FONT_FOR_SCRIPT,
  DEFAULT_SERIF_FONT_FOR_SCRIPT,
} from "../core/script";
import type { Style, TextStyle } from "../schema/style";

export type FontNeed = {
  family: string;
  weight: number;
  italic: boolean;
  text: string;
};

export function fontStack(
  style: Style,
  ts: TextStyle,
  script: string,
): string[] {
  const fallback = (
    style.fontFallback === "serif"
      ? DEFAULT_SERIF_FONT_FOR_SCRIPT
      : DEFAULT_FONT_FOR_SCRIPT
  )[script];
  const stack = [
    style.fonts[script],
    ts.fontFamily,
    fallback,
    style.fontFallback === "serif" ? "Noto Serif" : "Noto Sans",
  ];
  return [...new Set(stack.filter((f): f is string => !!f))];
}

/**
 * @remotion/google-fonts registers fonts whose names contain digits with the
 * digits spelled out ("Press Start 2P" -> "Press Start TwoP", "B612" ->
 * "BSixOneTwo"), so both spellings go into the CSS stack. A local font keeps
 * its own name, which is listed first.
 */
const DIGITS = [
  "Zero",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
];
export const registeredFamily = (family: string) =>
  family.replace(/\d/g, (d) => DIGITS[Number(d)]);

export const cssFamily = (stack: string[]) =>
  [
    ...[...new Set(stack.flatMap((f) => [f, registeredFamily(f)]))].map(
      (f) => `"${f}"`,
    ),
    "sans-serif",
  ].join(", ");

type RangeList = [number, number][];
function parseRanges(s: string | undefined): RangeList | null {
  if (!s) return null;
  return s.split(",").map((part) => {
    const p = part.trim().replace(/^U\+/i, "");
    if (p.includes("-")) {
      const [a, b] = p.split("-");
      return [parseInt(a, 16), parseInt(b, 16)] as [number, number];
    }
    if (p.includes("?")) {
      return [
        parseInt(p.replace(/\?/g, "0"), 16),
        parseInt(p.replace(/\?/g, "F"), 16),
      ] as [number, number];
    }
    const v = parseInt(p, 16);
    return [v, v] as [number, number];
  });
}

const covers = (ranges: RangeList, cps: Set<number>) => {
  for (const cp of cps)
    for (const [a, b] of ranges) if (cp >= a && cp <= b) return true;
  return false;
};

const nearestWeight = (available: string[], want: number) =>
  available
    .map(Number)
    .sort((a, b) => Math.abs(a - want) - Math.abs(b - want))[0];

/**
 * Load every Google Font needed, only the slices whose characters appear in the text.
 * Throws if a font cannot be fetched, so a render never silently falls back.
 */
export async function loadGoogleFonts(needs: FontNeed[]): Promise<void> {
  const available = getAvailableFonts();
  const byFamily = new Map<string, FontNeed[]>();
  for (const n of needs)
    byFamily.set(n.family, [...(byFamily.get(n.family) ?? []), n]);

  await Promise.all(
    [...byFamily.entries()].map(async ([family, list]) => {
      const entry = available.find((f) => f.fontFamily === family);
      if (!entry) return; // local font or system font; handled elsewhere
      const font = await entry.load();
      const info = font.getInfo();
      for (const italic of [false, true]) {
        const styleKey = italic ? "italic" : "normal";
        const forStyle = list.filter((n) => n.italic === italic);
        if (!forStyle.length) continue;
        const styleFonts = info.fonts[styleKey] ?? info.fonts.normal;
        const actualStyle = info.fonts[styleKey] ? styleKey : "normal";
        const weights = [
          ...new Set(
            forStyle.map((n) =>
              String(nearestWeight(Object.keys(styleFonts), n.weight)),
            ),
          ),
        ];
        const cps = new Set<number>();
        for (const n of forStyle)
          for (const ch of n.text) cps.add(ch.codePointAt(0)!);
        const subsetKeys = Object.keys(styleFonts[weights[0]] ?? {});
        const subsets = subsetKeys.filter((k) => {
          const r = parseRanges(info.unicodeRanges[k]);
          return r ? covers(r, cps) : false;
        });
        if (!subsets.length) continue; // this font has none of these characters; the stack falls through
        const handle = font.loadFont(actualStyle as never, {
          weights: weights as never,
          subsets: subsets as never,
          ignoreTooManyRequestsWarning: true,
        });
        await handle.waitUntilDone();
      }
    }),
  );
}

/** Load project-supplied font files (project.json "localFonts"). */
export async function loadLocalFonts(
  fonts: { family: string; src: string; weight: string; style: string }[],
) {
  await Promise.all(
    fonts.map((f) =>
      loadLocalFont({
        family: f.family,
        url: staticFile(f.src),
        weight: f.weight,
        style: f.style,
      }),
    ),
  );
}

/** Block rendering until fonts are ready. Call once per render tab. */
export function holdRenderFor<T>(
  label: string,
  work: () => Promise<T>,
): Promise<T> {
  const handle = delayRender(label, { timeoutInMilliseconds: 120000 });
  return work().finally(() => continueRender(handle));
}
