/**
 * Build song.json from the parsed lyrics and the aligner's output, and check it.
 * Hand-corrected lines (locked: true) from an earlier song.json are kept.
 */
import type { ParsedLyrics } from "../../src/core/lyrics";
import { graphemes } from "../../src/core/segment";
import {
  SongSchema,
  type Line,
  type Song,
  type Word,
} from "../../src/schema/song";

type AlignedWord = {
  id: string;
  text: string;
  start: number;
  end: number;
  score: number;
  voiced: number;
  flags: string[];
  conf?: number;
};
type AlignedLine = {
  id: string;
  words: AlignedWord[];
  conf?: number;
  flags?: string[];
  review?: "check" | "glance" | null;
};
export type Alignment = { version: 1; lines: AlignedLine[] };

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const lineKey = (l: { track: string; words: { text: string }[] }) =>
  `${l.track}|${l.words.map((w) => w.text).join(" ")}`;

/** lyrics.json: what the Python aligner needs. */
export function lyricsForAligner(parsed: ParsedLyrics) {
  return {
    version: 1,
    lines: parsed.groups.flatMap((g) =>
      g.lines.map((l) => ({
        id: l.id,
        lang: l.lang,
        sung: l.sung,
        words: l.words.map((w) => ({ id: w.id, text: w.text })),
      })),
    ),
  };
}

export function buildSong(
  parsed: ParsedLyrics,
  alignment: Alignment,
  duration: number,
  previous: Song | null,
): { song: Song; kept: string[]; notes: string[] } {
  const aligned = new Map(alignment.lines.map((l) => [l.id, l]));
  const locked = new Map<string, Line>();
  for (const g of previous?.groups ?? [])
    for (const l of g.lines) if (l.locked) locked.set(lineKey(l), l);
  const kept: string[] = [];
  const notes: string[] = [];

  const groups = parsed.groups.map((g) => {
    const sungLines = new Map<string, Line>();
    const lines: Line[] = [];
    for (const pl of g.lines) {
      if (!pl.sung) continue;
      const prev = locked.get(lineKey({ track: pl.track, words: pl.words }));
      let words: Word[];
      let conf: number | undefined;
      let flags: string[] = [];
      let review: "check" | "glance" | undefined;
      let isLocked = false;
      if (prev && prev.words.length === pl.words.length) {
        words = pl.words.map((w, i) => ({
          ...w,
          start: prev.words[i].start,
          end: prev.words[i].end,
          conf: 1,
          flags: [],
        }));
        conf = 1;
        isLocked = true;
        kept.push(pl.id);
      } else {
        const al = aligned.get(pl.id);
        if (!al || al.words.length !== pl.words.length) {
          throw new Error(
            `Alignment is out of date for line ${pl.id} ("${pl.text}"). Re-run: npm run align -- <project>`,
          );
        }
        words = pl.words.map((w, i) => ({
          id: w.id,
          text: w.text,
          ws: w.ws,
          start: r3(al.words[i].start),
          end: r3(al.words[i].end),
          conf: al.words[i].conf,
          flags: al.words[i].flags?.length ? al.words[i].flags : undefined,
        }));
        conf = al.conf;
        flags = al.flags ?? [];
        review = al.review ?? undefined;
      }
      sanitize(words, duration, notes, pl.id);
      const line: Line = {
        id: pl.id,
        track: pl.track,
        sung: true,
        start: words[0]?.start ?? 0,
        end: words[words.length - 1]?.end ?? 0,
        words,
        conf,
        flags: flags.length ? flags : undefined,
        review,
        locked: isLocked || undefined,
      };
      sungLines.set(pl.id, line);
      lines.push(line);
    }
    // Companion (translation) lines take their timing from the sung line they follow.
    const out: Line[] = [];
    for (const pl of g.lines) {
      if (pl.sung) {
        out.push(sungLines.get(pl.id)!);
        continue;
      }
      const pair = pl.pairOf ? sungLines.get(pl.pairOf) : undefined;
      if (!pair) {
        notes.push(
          `Translation line ${pl.id} has no sung line before it in the same group; it is shown with the group.`,
        );
      }
      const start = pair?.start ?? lines[0]?.start ?? 0;
      const end = pair?.end ?? lines[lines.length - 1]?.end ?? start + 1;
      out.push({
        id: pl.id,
        track: pl.track,
        sung: false,
        pairOf: pair?.id,
        start,
        end,
        words: spread(pl.words, start, end, pl.lang),
      });
    }
    return { id: g.id, section: g.section, lines: out };
  });

  const song: Song = {
    version: 1,
    title: parsed.title,
    artist: parsed.artist,
    duration: r3(duration),
    tracks: parsed.tracks,
    groups: groups.filter((g) => g.lines.length),
  };
  return { song: SongSchema.parse(song), kept, notes };
}

/** Spread a translation's words across its sung line, in proportion to their length. */
function spread(
  words: { id: string; text: string; ws: string }[],
  start: number,
  end: number,
  lang: string,
): Word[] {
  const lens = words.map((w) => Math.max(1, graphemes(w.text, lang).length));
  const total = lens.reduce((a, b) => a + b, 0);
  let acc = 0;
  return words.map((w, i) => {
    const a = start + ((end - start) * acc) / total;
    acc += lens[i];
    const b = start + ((end - start) * acc) / total;
    return { id: w.id, text: w.text, ws: w.ws, start: r3(a), end: r3(b) };
  });
}

/** Make word times well-formed: inside the video, in order, never zero-length. */
function sanitize(
  words: Word[],
  duration: number,
  notes: string[],
  lineId: string,
) {
  let prevStart = -Infinity;
  for (const w of words) {
    if (!Number.isFinite(w.start) || !Number.isFinite(w.end))
      throw new Error(`Line ${lineId}: word "${w.text}" has no timing`);
    w.start = Math.min(Math.max(0, w.start), duration);
    w.end = Math.min(Math.max(w.end, w.start + 0.05), duration + 0.5);
    if (w.start < prevStart) {
      notes.push(
        `Line ${lineId}: word "${w.text}" started before the previous word; moved to keep order.`,
      );
      w.start = prevStart;
      w.end = Math.max(w.end, w.start + 0.05);
    }
    prevStart = w.start;
    w.start = r3(w.start);
    w.end = r3(w.end);
  }
}

export type Issue = {
  level: "error" | "warning";
  where: string;
  message: string;
};

/** Checks run by `npm run validate` and before every render. */
export function validateSong(song: Song, duration: number): Issue[] {
  const issues: Issue[] = [];
  const trackIds = new Set(song.tracks.map((t) => t.id));
  const lineIds = new Set(song.groups.flatMap((g) => g.lines.map((l) => l.id)));
  let lastSung = -Infinity;
  for (const g of song.groups) {
    for (const l of g.lines) {
      const where = `line ${l.id}`;
      if (!trackIds.has(l.track))
        issues.push({
          level: "error",
          where,
          message: `unknown track "${l.track}"`,
        });
      if (!l.words.length)
        issues.push({ level: "error", where, message: "has no words" });
      if (!l.sung && l.pairOf && !lineIds.has(l.pairOf))
        issues.push({
          level: "error",
          where,
          message: `pairOf "${l.pairOf}" does not exist`,
        });
      let prev = -Infinity;
      for (const w of l.words) {
        const ww = `${where} word "${w.text}"`;
        if (!(w.end > w.start))
          issues.push({
            level: "error",
            where: ww,
            message: `end (${w.end}) must be after start (${w.start})`,
          });
        if (w.start < 0 || w.end > duration + 0.5)
          issues.push({
            level: "error",
            where: ww,
            message: `outside the video (0-${duration.toFixed(2)}s)`,
          });
        if (w.start < prev - 0.001)
          issues.push({
            level: "error",
            where: ww,
            message: "starts before the previous word",
          });
        if (w.end - w.start > 8)
          issues.push({
            level: "warning",
            where: ww,
            message: `lasts ${(w.end - w.start).toFixed(1)}s`,
          });
        prev = w.start;
      }
      if (l.sung && l.words.length) {
        if (l.words[0].start < lastSung - 1.0)
          issues.push({
            level: "warning",
            where,
            message:
              "starts more than 1s before the previous sung line (overlapping singers are fine; otherwise check timing)",
          });
        lastSung = Math.max(lastSung, l.words[0].start);
      }
    }
  }
  return issues;
}
