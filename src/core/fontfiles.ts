/**
 * Font files a person drops into a project's fonts/ folder are used by name.
 * The family name is the file name up to the first dash; the part after it
 * gives the weight and style:
 *
 *   fonts/Gotham-Bold.otf          -> family "Gotham", weight 700
 *   fonts/MyFont.ttf               -> family "MyFont", weight 400
 *   fonts/Gotham-BookItalic.otf    -> family "Gotham", weight 400, italic
 *   fonts/My_Brand_Font.ttf        -> family "My Brand Font", weight 400
 *   fonts/Inter[wght].ttf          -> family "Inter", every weight (variable font)
 */
export type FontFile = {
  family: string;
  src: string;
  weight: string;
  style: "normal" | "italic";
};

export const FONT_EXTENSIONS = [".ttf", ".otf", ".woff", ".woff2"];

const WEIGHTS: [RegExp, string][] = [
  [/(extra|ultra)\s*light/i, "200"],
  [/(semi|demi)\s*bold/i, "600"],
  [/(extra|ultra)\s*bold/i, "800"],
  [/thin|hairline/i, "100"],
  [/light/i, "300"],
  [/medium/i, "500"],
  [/black|heavy/i, "900"],
  [/bold/i, "700"],
  [/regular|normal|book|roman/i, "400"],
];

export function parseFontFile(path: string): FontFile | null {
  const name = path.split("/").pop() ?? path;
  const dot = name.lastIndexOf(".");
  if (dot < 0 || !FONT_EXTENSIONS.includes(name.slice(dot).toLowerCase()))
    return null;
  const base = name.slice(0, dot);
  const variable = /\[.*\]/.test(base);
  const clean = base.replace(/\[.*\]/, "");
  const dash = clean.indexOf("-");
  const familyPart = dash > 0 ? clean.slice(0, dash) : clean;
  const stylePart = dash > 0 ? clean.slice(dash + 1) : "";
  const family = familyPart.replace(/_+/g, " ").trim();
  let weight = variable ? "100 900" : "400";
  if (!variable)
    for (const [re, w] of WEIGHTS)
      if (re.test(stylePart)) {
        weight = w;
        break;
      }
  return {
    family,
    src: path,
    weight,
    style: /italic|oblique/i.test(stylePart) ? "italic" : "normal",
  };
}
