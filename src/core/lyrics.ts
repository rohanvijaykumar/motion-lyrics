/**
 * Parse lyrics.txt - a plain text format anyone can write.
 *
 *   @title: Song name              metadata (title, artist, lang)
 *   @lang: hi, en                  languages in the song, most common first
 *   # a comment                    ignored
 *   [Chorus]                       section name for the next group
 *   हर आवाज़ में रोशनी है           a sung line (language found from its script)
 *   {es} Hola mundo                a sung line with an explicit language tag
 *   > Light in every voice         a translation shown with the line above, not sung
 *                                  (blank line) starts a new group = a new screen
 *
 * Write lines in the order they are sung, including every repeat of a chorus.
 * LRC timestamps such as [01:02.50] are ignored, so synced lyrics can be pasted.
 */
import {
  DEFAULT_LANG_FOR_SCRIPT,
  detectScript,
  dirOf,
  scriptOfLang,
  scriptsCompatible,
} from "./script";
import { segmentWords } from "./segment";

export type ParsedWord = { id: string; text: string; ws: string };
export type ParsedLine = {
  id: string;
  track: string;
  lang: string;
  sung: boolean;
  pairOf?: string;
  text: string;
  words: ParsedWord[];
};
export type ParsedGroup = { id: string; section?: string; lines: ParsedLine[] };
export type ParsedTrack = {
  id: string;
  lang: string;
  script: string;
  dir: "ltr" | "rtl";
  role: "sung" | "companion";
  tier: "primary" | "secondary";
};
export type ParsedLyrics = {
  title?: string;
  artist?: string;
  langs: string[];
  tracks: ParsedTrack[];
  groups: ParsedGroup[];
  warnings: string[];
};

export type ParseOptions = {
  /** Languages to assume when lyrics.txt has no @lang line. */
  langs?: string[];
  /** Per-language tokenization; "char" gives per-character karaoke (common for Chinese/Japanese). */
  tokenize?: Record<string, "word" | "char">;
};

const LRC_STAMP = /\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\]/g;
const TAG = /^\{([A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)\}\s*/;

export function parseLyrics(
  source: string,
  opts: ParseOptions = {},
): ParsedLyrics {
  const warnings: string[] = [];
  let title: string | undefined;
  let artist: string | undefined;
  let langs = (opts.langs ?? []).map(normLang).filter(Boolean);

  type Raw =
    | {
        kind: "line";
        text: string;
        tag?: string;
        companion: boolean;
        row: number;
      }
    | { kind: "break" }
    | { kind: "section"; name: string };
  const raws: Raw[] = [];
  source
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .forEach((rawLine, i) => {
      const row = i + 1;
      const line = rawLine.replace(LRC_STAMP, "").trim();
      if (!line) return raws.push({ kind: "break" });
      if (line.startsWith("#")) return;
      const meta = /^@(\w+)\s*:\s*(.*)$/.exec(line);
      if (meta) {
        const key = meta[1].toLowerCase();
        if (key === "title") title = meta[2].trim();
        else if (key === "artist") artist = meta[2].trim();
        else if (key === "lang" || key === "langs" || key === "languages")
          langs = meta[2]
            .split(/[,\s]+/)
            .map(normLang)
            .filter(Boolean);
        else warnings.push(`Line ${row}: unknown setting @${meta[1]} ignored`);
        return;
      }
      const section = /^\[([^\]]+)\]$/.exec(line);
      if (section)
        return raws.push({ kind: "section", name: section[1].trim() });
      let text = line;
      let companion = false;
      if (text.startsWith(">")) {
        companion = true;
        text = text.slice(1).trim();
      }
      let tag: string | undefined;
      const m = TAG.exec(text);
      if (m) {
        tag = normLang(m[1]);
        text = text.slice(m[0].length).trim();
      }
      if (!text) return;
      raws.push({ kind: "line", text, tag, companion, row });
    });

  const ambiguousWarned = new Set<string>();
  const resolveLang = (
    text: string,
    tag: string | undefined,
    row: number,
  ): string => {
    if (tag) return tag;
    const script = detectScript(text);
    const matches = langs.filter((l) =>
      scriptsCompatible(script, scriptOfLang(l)),
    );
    if (matches.length > 1 && !ambiguousWarned.has(script)) {
      ambiguousWarned.add(script);
      warnings.push(
        `Line ${row}: ${matches.join(", ")} all use the ${script} script, so untagged ${script} lines are treated as "${matches[0]}". ` +
          `Put {${matches[1]}} before lines in ${matches[1]}.`,
      );
    }
    if (matches.length) return matches[0];
    const guess = DEFAULT_LANG_FOR_SCRIPT[script] ?? "und";
    warnings.push(
      `Line ${row}: no language for script ${script} in @lang; assumed "${guess}". Add {lang} before the line or list it in @lang.`,
    );
    if (!langs.includes(guess)) langs = [...langs, guess];
    return guess;
  };

  const tracks: ParsedTrack[] = [];
  const trackFor = (
    lang: string,
    role: "sung" | "companion",
    sample: string,
  ): string => {
    const id = role === "sung" ? lang : `${lang}.companion`;
    if (!tracks.some((t) => t.id === id)) {
      const script = detectScript(sample, lang);
      tracks.push({
        id,
        lang,
        script,
        dir: dirOf(script),
        role,
        tier: "secondary",
      });
    }
    return id;
  };

  const groups: ParsedGroup[] = [];
  let current: ParsedGroup | null = null;
  let pendingSection: string | undefined;
  let lastSung: ParsedLine | null = null;
  for (const r of raws) {
    if (r.kind === "break") {
      current = null;
      continue;
    }
    if (r.kind === "section") {
      current = null;
      pendingSection = r.name;
      continue;
    }
    if (!current) {
      current = { id: `g${groups.length}`, section: pendingSection, lines: [] };
      if (!current.section) delete current.section;
      pendingSection = undefined;
      groups.push(current);
    }
    const lang = resolveLang(r.text, r.tag, r.row);
    const role = r.companion ? "companion" : "sung";
    const track = trackFor(lang, role, r.text);
    const id = `${current.id}l${current.lines.length}`;
    const tokens = segmentWords(r.text, lang, opts.tokenize?.[lang] ?? "word");
    const line: ParsedLine = {
      id,
      track,
      lang,
      sung: !r.companion,
      text: r.text,
      words: tokens.map((t, i) => ({
        id: `${id}w${i}`,
        text: t.text,
        ws: t.ws,
      })),
    };
    if (r.companion) {
      if (!lastSung)
        warnings.push(
          `Line ${r.row}: translation line ">" has no sung line before it`,
        );
      else line.pairOf = lastSung.id;
    } else {
      lastSung = line;
    }
    current.lines.push(line);
  }

  // Tiers: a sung language that opens a screen is primary (large); a second sung
  // language within a screen and all translations are secondary (smaller).
  const leaders = new Set(
    groups.map((g) => g.lines.find((l) => l.sung)?.track).filter(Boolean),
  );
  for (const t of tracks)
    t.tier = t.role === "sung" && leaders.has(t.id) ? "primary" : "secondary";
  // Present languages in the order they first appear.
  const order = tracks.map((t) => t.lang);
  langs = [...new Set([...order, ...langs.filter((l) => order.includes(l))])];

  if (!groups.some((g) => g.lines.some((l) => l.sung)))
    warnings.push("No sung lines found in the lyrics.");
  return { title, artist, langs, tracks, groups, warnings };
}

function normLang(l: string): string {
  const s = l.trim();
  if (!s) return "";
  try {
    return Intl.getCanonicalLocales(s)[0];
  } catch {
    return s.toLowerCase();
  }
}
