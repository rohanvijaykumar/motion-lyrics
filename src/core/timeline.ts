/**
 * When each screen ("page") of lyrics enters and leaves.
 *
 * Rules, checked by tests/timeline.test.ts:
 *   1. A page has finished entering by the time its first word is sung
 *      (unless the previous page is still finishing its last word).
 *   2. A page never starts leaving more than 0.12 s before its last word ends.
 *   3. Pages that share a slot never overlap: the next one starts entering
 *      only once the previous one has left. Hand-offs between tightly sung
 *      lines become quick, gapless swaps instead of a muddy crossfade.
 */
import type { Line, Song, Word } from "../schema/song";
import type { Style } from "../schema/style";

export type Page = {
  id: string;
  groupId: string;
  section?: string;
  lines: Line[];
  slot: number;
  first: number;
  last: number;
  enterStart: number;
  enterDur: number;
  exitStart: number;
  exitDur: number;
};

export const EXIT_EARLY_LIMIT = 0.12;
const QUICK_EXIT = 0.2;
const QUICK_ENTER = 0.22;
const MIN_ENTER = 0.12;

const sungWords = (lines: Line[]): Word[] => lines.filter((l) => l.sung).flatMap((l) => l.words);

function makePage(id: string, groupId: string, lines: Line[], slot: number, section?: string): Page | null {
  const words = sungWords(lines);
  if (!words.length) return null;
  return {
    id,
    groupId,
    section,
    lines,
    slot,
    first: Math.min(...words.map((w) => w.start)),
    last: Math.max(...words.map((w) => w.end)),
    enterStart: 0,
    enterDur: 0,
    exitStart: 0,
    exitDur: 0,
  };
}

/** Split the song into pages for the chosen layout. */
export function paginate(song: Song, style: Style): Page[] {
  const type = style.layout.type;
  const pages: Page[] = [];
  if (type === "stack") {
    for (const g of song.groups) {
      const p = makePage(g.id, g.id, g.lines, 0, g.section);
      if (p) pages.push(p);
    }
  } else if (type === "alternate" || type === "kinetic") {
    let n = 0;
    for (const g of song.groups) {
      for (const l of g.lines.filter((x) => x.sung)) {
        const companions = g.lines.filter((c) => !c.sung && c.pairOf === l.id);
        const p = makePage(l.id, g.id, [l, ...companions], type === "alternate" ? n % 2 : 0, g.section);
        if (p) {
          pages.push(p);
          n++;
        }
      }
    }
  } else if (type === "pop") {
    for (const g of song.groups) {
      for (const l of g.lines.filter((x) => x.sung)) {
        let chunk: Word[] = [];
        let chars = 0;
        const flush = () => {
          if (!chunk.length) return;
          const sub: Line = { ...l, id: `${l.id}p${pages.length}`, words: chunk, start: chunk[0].start, end: chunk[chunk.length - 1].end };
          const p = makePage(sub.id, g.id, [sub], 0, g.section);
          if (p) pages.push(p);
          chunk = [];
          chars = 0;
        };
        l.words.forEach((w, i) => {
          const prev = l.words[i - 1];
          const gap = prev ? w.start - prev.end : 0;
          const len = [...w.text].length;
          if (
            chunk.length &&
            (chunk.length >= style.layout.wordsPerPage || chars + len > style.layout.maxCharsPerPage || gap > 0.6)
          )
            flush();
          chunk.push(w);
          chars += len + (w.ws ? 1 : 0);
        });
        flush();
      }
    }
  }
  pages.sort((a, b) => a.first - b.first);
  return pages;
}

/** Fill in enter/exit times. `duration` is the video length in seconds. */
export function schedule(pages: Page[], style: Style, duration: number): Page[] {
  const lead = style.timing.lead;
  const tail = style.timing.tail;
  const enterDur = style.enter.type === "none" ? 0.001 : style.enter.duration;
  const exitDur = style.exit.type === "none" ? 0.001 : style.exit.duration;
  const slots = new Map<number, Page[]>();
  for (const p of pages) slots.set(p.slot, [...(slots.get(p.slot) ?? []), p]);

  for (const list of slots.values()) {
    list.sort((a, b) => a.first - b.first);
    list.forEach((p, i) => {
      if (i === 0) {
        p.enterStart = Math.max(0, p.first - lead);
        p.enterDur = clamp(p.first + 0.1 - p.enterStart, MIN_ENTER, enterDur);
      }
      const next = list[i + 1];
      p.exitDur = exitDur;
      p.exitStart = p.last + tail;
      if (!next) return;
      const naturalEnter = Math.max(0, next.first - lead);
      let tight = false;
      if (p.exitStart + p.exitDur > naturalEnter) {
        p.exitStart = naturalEnter - p.exitDur;
        if (p.exitStart < p.last) {
          // Tight hand-off: a quick swap right around the last word.
          tight = true;
          p.exitDur = Math.min(exitDur, QUICK_EXIT);
          const want = next.first + 0.1 - Math.min(enterDur, QUICK_ENTER) - p.exitDur;
          p.exitStart = clamp(want, p.last - EXIT_EARLY_LIMIT, p.last);
        }
      }
      // A tight swap is gapless: the next page arrives the moment this one is gone.
      next.enterStart = tight ? p.exitStart + p.exitDur : Math.max(naturalEnter, p.exitStart + p.exitDur - 0.02);
      next.enterDur = clamp(next.first + 0.1 - next.enterStart, MIN_ENTER, enterDur);
    });
    const lastPage = list[list.length - 1];
    if (lastPage) {
      if (style.timing.holdLast && duration - lastPage.last <= 8) {
        lastPage.exitStart = duration + 1; // stays to the end
      } else {
        lastPage.exitStart = Math.min(lastPage.last + tail, Math.max(lastPage.last, duration - lastPage.exitDur));
      }
    }
  }
  for (const p of pages) {
    p.enterStart = round3(p.enterStart);
    p.enterDur = round3(p.enterDur);
    p.exitStart = round3(p.exitStart);
    p.exitDur = round3(p.exitDur);
  }
  return pages;
}

export const pageEnd = (p: Page) => p.exitStart + p.exitDur;

/** 0 -> 1 progress of a word being sung at time t. */
export function wordProgress(w: Word, t: number): number {
  if (t <= w.start) return 0;
  if (t >= w.end) return 1;
  return (t - w.start) / Math.max(0.001, w.end - w.start);
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;
