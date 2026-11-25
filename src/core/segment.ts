/**
 * Split a lyric line into words for any language.
 *
 * Uses the browser/Node built-in Intl.Segmenter, which knows word boundaries
 * even for languages written without spaces (Japanese, Chinese, Thai, Khmer,
 * Lao, Burmese). Punctuation stays attached to its word so the line displays
 * exactly as written, and the whitespace after each word is kept separately.
 */

export type Token = { text: string; ws: string };

const isSpace = (s: string) => /^\s+$/u.test(s);

export function segmentWords(text: string, lang?: string, mode: "word" | "char" = "word"): Token[] {
  let segmenter: Intl.Segmenter;
  try {
    segmenter = new Intl.Segmenter(lang || undefined, { granularity: "word" });
  } catch {
    segmenter = new Intl.Segmenter(undefined, { granularity: "word" });
  }
  const words: Token[] = [];
  let lead = "";
  for (const s of segmenter.segment(text.trim())) {
    const seg = s.segment;
    if (s.isWordLike) {
      words.push({ text: lead + seg, ws: "" });
      lead = "";
    } else if (isSpace(seg)) {
      const last = words[words.length - 1];
      if (lead) {
        // Free-standing punctuation such as " — " belongs with the word before it.
        if (last) {
          last.text += (last.ws ? " " : "") + lead;
          lead = "";
        } else {
          lead += " ";
        }
      }
      if (last) last.ws = " ";
    } else {
      // Punctuation or symbols: trailing if it touches the previous word, else leading.
      const last = words[words.length - 1];
      if (last && last.ws === "") last.text += seg;
      else lead += seg;
    }
  }
  if (lead) {
    if (words.length) {
      const last = words[words.length - 1];
      last.text += (last.ws ? " " : "") + lead;
    } else {
      words.push({ text: lead, ws: "" });
    }
  }
  if (words.length) words[words.length - 1].ws = "";
  if (mode === "char") return splitChars(words, lang);
  return words;
}

/** Per-character tokens (karaoke for Chinese/Japanese), keeping grapheme clusters intact. */
function splitChars(words: Token[], lang?: string): Token[] {
  const g = new Intl.Segmenter(lang || undefined, { granularity: "grapheme" });
  const out: Token[] = [];
  for (const w of words) {
    const chars = [...g.segment(w.text)].map((s) => s.segment);
    chars.forEach((c, i) => {
      if (/^[\p{P}\p{S}]+$/u.test(c) && out.length && out[out.length - 1].ws === "") {
        out[out.length - 1].text += c;
      } else {
        out.push({ text: c, ws: "" });
      }
      if (i === chars.length - 1) out[out.length - 1].ws = w.ws;
    });
  }
  return out;
}

/** Grapheme clusters (what a reader sees as one character). */
export function graphemes(text: string, lang?: string): string[] {
  const g = new Intl.Segmenter(lang || undefined, { granularity: "grapheme" });
  return [...g.segment(text)].map((s) => s.segment);
}
