/**
 * Writing-system knowledge: which script a line is in, which way it reads,
 * which font covers it and whether its letters may be animated one by one.
 * Pure functions with no Remotion imports, shared by the renderer and the CLI.
 */

/** ISO 15924 code -> Unicode script name used in \p{Script=...}. Order matters for ties. */
const SCRIPTS: [string, string][] = [
  ["Hira", "Hiragana"],
  ["Kana", "Katakana"],
  ["Hang", "Hangul"],
  ["Hani", "Han"],
  ["Arab", "Arabic"],
  ["Hebr", "Hebrew"],
  ["Syrc", "Syriac"],
  ["Thaa", "Thaana"],
  ["Nkoo", "Nko"],
  ["Deva", "Devanagari"],
  ["Beng", "Bengali"],
  ["Guru", "Gurmukhi"],
  ["Gujr", "Gujarati"],
  ["Orya", "Oriya"],
  ["Taml", "Tamil"],
  ["Telu", "Telugu"],
  ["Knda", "Kannada"],
  ["Mlym", "Malayalam"],
  ["Sinh", "Sinhala"],
  ["Thai", "Thai"],
  ["Laoo", "Lao"],
  ["Tibt", "Tibetan"],
  ["Mymr", "Myanmar"],
  ["Khmr", "Khmer"],
  ["Ethi", "Ethiopic"],
  ["Geor", "Georgian"],
  ["Armn", "Armenian"],
  ["Grek", "Greek"],
  ["Cyrl", "Cyrillic"],
  ["Mong", "Mongolian"],
  ["Cher", "Cherokee"],
  ["Latn", "Latin"],
];

const RE = SCRIPTS.map(([code, name]) => [code, new RegExp(`\\p{Script=${name}}`, "u")] as const);

export const RTL_SCRIPTS = new Set(["Arab", "Hebr", "Syrc", "Thaa", "Nkoo"]);

/**
 * Scripts whose letters can be split into separate animated pieces without
 * breaking how they join or stack. Everything else (Arabic, Indic, Myanmar,
 * Khmer, Tibetan...) animates whole words instead.
 */
export const LETTER_SAFE_SCRIPTS = new Set([
  "Latn", "Cyrl", "Grek", "Armn", "Geor", "Hebr", "Hang", "Kore", "Jpan", "Hans", "Hant", "Hani", "Hira", "Kana", "Thai", "Ethi", "Cher",
]);

/** Scripts written without spaces between words. */
export const NO_SPACE_SCRIPTS = new Set(["Jpan", "Hans", "Hant", "Hani", "Hira", "Kana", "Thai", "Laoo", "Khmr", "Mymr", "Tibt"]);

function hanScriptFor(lang: string | undefined): string {
  const l = (lang ?? "").toLowerCase();
  if (l.startsWith("ja")) return "Jpan";
  if (l.startsWith("ko")) return "Kore";
  if (/^zh-(hant|tw|hk|mo)/.test(l) || l === "yue" || l.startsWith("yue")) return "Hant";
  return "Hans";
}

/** Dominant script of a string, e.g. "Deva". Han/kana/hangul are merged into Jpan/Kore/Hans/Hant. */
export function detectScript(text: string, lang?: string): string {
  const counts = new Map<string, number>();
  for (const ch of text) {
    if (!/\p{L}|\p{M}/u.test(ch)) continue;
    for (const [code, re] of RE) {
      if (re.test(ch)) {
        counts.set(code, (counts.get(code) ?? 0) + 1);
        break;
      }
    }
  }
  if (counts.size === 0) return lang ? scriptOfLang(lang) : "Latn";
  const kana = (counts.get("Hira") ?? 0) + (counts.get("Kana") ?? 0);
  const hangul = counts.get("Hang") ?? 0;
  const han = counts.get("Hani") ?? 0;
  if (kana > 0) return "Jpan";
  if (hangul > 0) return "Kore";
  if (han > 0) {
    let best = 0;
    for (const [code, n] of counts) if (code !== "Hani" && n > best) best = n;
    if (han >= best) return hanScriptFor(lang);
  }
  let top = "Latn";
  let n = -1;
  for (const [code, c] of counts) {
    if (c > n) {
      top = code;
      n = c;
    }
  }
  return top;
}

/** Likely script of a language tag: "hi" -> "Deva", "ja" -> "Jpan", "sr" -> "Cyrl". */
export function scriptOfLang(lang: string): string {
  try {
    const s = new Intl.Locale(lang).maximize().script;
    if (s) return s === "Hani" ? hanScriptFor(lang) : s;
  } catch {
    /* fall through */
  }
  return "Latn";
}

/** Does text written in `detected` belong to a language normally written in `langScript`? */
export function scriptsCompatible(detected: string, langScript: string): boolean {
  if (detected === langScript) return true;
  const cjk = new Set(["Jpan", "Kore", "Hans", "Hant", "Hani", "Hira", "Kana", "Hang"]);
  if (cjk.has(detected) && cjk.has(langScript)) {
    if (langScript === "Jpan") return ["Jpan", "Hans", "Hant", "Hani"].includes(detected);
    if (langScript === "Kore") return detected === "Kore"; // modern Korean lyrics are Hangul
    return ["Hans", "Hant", "Hani"].includes(detected);
  }
  return false;
}

/** A sensible language for a script when the lyrics do not say. */
export const DEFAULT_LANG_FOR_SCRIPT: Record<string, string> = {
  Latn: "en", Cyrl: "ru", Grek: "el", Armn: "hy", Geor: "ka", Hebr: "he", Arab: "ar", Syrc: "syr", Thaa: "dv",
  Deva: "hi", Beng: "bn", Guru: "pa", Gujr: "gu", Orya: "or", Taml: "ta", Telu: "te", Knda: "kn", Mlym: "ml",
  Sinh: "si", Thai: "th", Laoo: "lo", Tibt: "bo", Mymr: "my", Khmr: "km", Ethi: "am", Kore: "ko", Jpan: "ja",
  Hans: "zh", Hant: "zh-Hant", Mong: "mn", Cher: "chr", Nkoo: "nqo",
};

export const dirOf = (script: string): "ltr" | "rtl" => (RTL_SCRIPTS.has(script) ? "rtl" : "ltr");

/** Google Fonts family that covers a script well (the Noto family, made for exactly this). */
export const DEFAULT_FONT_FOR_SCRIPT: Record<string, string> = {
  Latn: "Noto Sans", Cyrl: "Noto Sans", Grek: "Noto Sans", Armn: "Noto Sans Armenian", Geor: "Noto Sans Georgian",
  Hebr: "Noto Sans Hebrew", Arab: "Noto Sans Arabic", Syrc: "Noto Sans Syriac", Thaa: "Noto Sans Thaana",
  Deva: "Noto Sans Devanagari", Beng: "Noto Sans Bengali", Guru: "Noto Sans Gurmukhi", Gujr: "Noto Sans Gujarati",
  Orya: "Noto Sans Oriya", Taml: "Noto Sans Tamil", Telu: "Noto Sans Telugu", Knda: "Noto Sans Kannada",
  Mlym: "Noto Sans Malayalam", Sinh: "Noto Sans Sinhala", Thai: "Noto Sans Thai", Laoo: "Noto Sans Lao",
  Tibt: "Noto Serif Tibetan", Mymr: "Noto Sans Myanmar", Khmr: "Noto Sans Khmer", Ethi: "Noto Sans Ethiopic",
  Kore: "Noto Sans KR", Jpan: "Noto Sans JP", Hans: "Noto Sans SC", Hant: "Noto Sans TC", Mong: "Noto Sans Mongolian",
  Cher: "Noto Sans Cherokee", Nkoo: "Noto Sans NKo",
};

/** Serif counterparts, used when a style sets fontFallback: "serif". */
export const DEFAULT_SERIF_FONT_FOR_SCRIPT: Record<string, string> = {
  ...DEFAULT_FONT_FOR_SCRIPT,
  Latn: "Noto Serif", Cyrl: "Noto Serif", Grek: "Noto Serif", Armn: "Noto Serif Armenian", Geor: "Noto Serif Georgian",
  Hebr: "Noto Serif Hebrew", Arab: "Noto Naskh Arabic", Deva: "Noto Serif Devanagari", Beng: "Noto Serif Bengali",
  Guru: "Noto Serif Gurmukhi", Gujr: "Noto Serif Gujarati", Taml: "Noto Serif Tamil", Telu: "Noto Serif Telugu",
  Knda: "Noto Serif Kannada", Mlym: "Noto Serif Malayalam", Sinh: "Noto Serif Sinhala", Thai: "Noto Serif Thai",
  Laoo: "Noto Serif Lao", Mymr: "Noto Serif Myanmar", Khmr: "Noto Serif Khmer", Ethi: "Noto Serif Ethiopic",
  Kore: "Noto Serif KR", Jpan: "Noto Serif JP", Hans: "Noto Serif SC", Hant: "Noto Serif TC",
};

/** Google Fonts subset names that hold a script's glyphs. */
export const SUBSETS_FOR_SCRIPT: Record<string, string[]> = {
  Latn: ["latin", "latin-ext", "vietnamese"], Cyrl: ["cyrillic", "cyrillic-ext"], Grek: ["greek", "greek-ext"],
  Armn: ["armenian"], Geor: ["georgian"], Hebr: ["hebrew"], Arab: ["arabic"], Syrc: ["syriac"], Thaa: ["thaana"],
  Deva: ["devanagari"], Beng: ["bengali"], Guru: ["gurmukhi"], Gujr: ["gujarati"], Orya: ["oriya"], Taml: ["tamil"],
  Telu: ["telugu"], Knda: ["kannada"], Mlym: ["malayalam"], Sinh: ["sinhala"], Thai: ["thai"], Laoo: ["lao"],
  Tibt: ["tibetan"], Mymr: ["myanmar"], Khmr: ["khmer"], Ethi: ["ethiopic"], Kore: ["korean"], Jpan: ["japanese"],
  Hans: ["chinese-simplified"], Hant: ["chinese-traditional"], Mong: ["mongolian"], Cher: ["cherokee"], Nkoo: ["nko"],
};
