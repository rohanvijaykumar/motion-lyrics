/**
 * Review pack: everything a person or an AI agent needs to approve the timing
 * without guessing.
 *
 *   review/report.md          summary + every flagged line, with how to fix it
 *   review/report.json        the same, machine-readable
 *   review/contact-sheet.jpg  one still per lyric screen, to check look & placement
 *   review/strips/<line>.png  vocal spectrogram with word boxes for flagged lines
 */
import fs from "node:fs";
import path from "node:path";
import type { Song } from "../../src/schema/song";
import type { Paths } from "./project";
import { renderStills } from "./render";
import { fmtTime, ok, py, writeJson } from "./util";

export type Flagged = {
  id: string;
  level: "check" | "glance";
  text: string;
  start: number;
  end: number;
  conf: number | null;
  flags: string[];
  words: { text: string; flags: string[] }[];
};

/** Lines to review: "check" (likely wrong) first, then "glance" (watch in the draft). */
export function flaggedLines(song: Song): Flagged[] {
  const out: Flagged[] = [];
  for (const g of song.groups)
    for (const l of g.lines) {
      if (!l.sung || l.locked || !l.review) continue;
      const wordFlags = l.words.filter((w) => w.flags?.length);
      out.push({
        id: l.id,
        level: l.review,
        text: l.words.map((w) => w.text + (w.ws ? " " : "")).join(""),
        start: l.start,
        end: l.end,
        conf: l.conf ?? null,
        flags: [
          ...new Set([
            ...(l.flags ?? []),
            ...wordFlags.flatMap((w) => w.flags ?? []),
          ]),
        ],
        words: wordFlags.map((w) => ({ text: w.text, flags: w.flags ?? [] })),
      });
    }
  return out.sort((a, b) =>
    a.level === b.level ? a.start - b.start : a.level === "check" ? -1 : 1,
  );
}

const FLAG_HELP: Record<string, string> = {
  "whisper-disagrees":
    "the speech recognizer heard this line at a different time",
  "whisper-unheard":
    "the speech recognizer did not hear these words (could be fine for heavy production)",
  "aligner-unsure": "the aligner had low confidence for a word",
  "in-silence": "a word is placed where the vocal is quiet",
  "very-long": "a word lasts more than 6 seconds",
  "many-flagged-words": "a third or more of the words have issues",
  "low-confidence": "overall confidence is low",
  unalignable:
    "a word has no letters the aligner can use (numbers or symbols); its time is estimated",
};

export async function makeReview(
  p: Paths,
  song: Song,
  opts: { stills: boolean; transcribedLyrics: boolean },
) {
  fs.mkdirSync(p.review, { recursive: true });
  const flagged = flaggedLines(song);
  const sung = song.groups.flatMap((g) => g.lines.filter((l) => l.sung));
  const meanConf = sung.length
    ? sung.reduce((a, l) => a + (l.conf ?? 0), 0) / sung.length
    : 0;

  const check = flagged.filter((f) => f.level === "check");
  const glance = flagged.filter((f) => f.level === "glance");
  // Timing strips for every flagged line.
  if (flagged.length) {
    await py(
      [
        "strips",
        "--project",
        p.dir,
        "--lines",
        flagged.map((f) => f.id).join(","),
      ],
      "Drawing timing strips",
      true,
    );
  }

  // Contact sheet: one still in the middle of each lyric group.
  let sheet: string | null = null;
  if (opts.stills) {
    const stillsDir = path.join(p.review, "stills");
    fs.rmSync(stillsDir, { recursive: true, force: true });
    fs.mkdirSync(stillsDir, { recursive: true });
    let items = song.groups
      .map((g) => {
        const ws = g.lines.filter((l) => l.sung).flatMap((l) => l.words);
        if (!ws.length) return null;
        const mid = (ws[0].start + ws[ws.length - 1].end) / 2;
        return {
          time: mid,
          out: path.join(
            stillsDir,
            `${fmtTime(mid).replace(/[:.]/g, "-")}_${g.id}.jpg`,
          ),
        };
      })
      .filter((x): x is { time: number; out: string } => !!x);
    if (items.length > 24)
      items = items.filter((_, i) => i % Math.ceil(items.length / 24) === 0);
    await renderStills(p.dir, items, 0.5);
    sheet = path.join(p.review, "contact-sheet.jpg");
    await py(
      ["sheet", "--out", sheet, ...items.map((i) => i.out)],
      "Building contact sheet",
      true,
    );
  }

  const lines: string[] = [];
  lines.push(`# Review: ${song.title ?? path.basename(p.dir)}`, "");
  if (opts.transcribedLyrics) {
    lines.push(
      "> **The lyrics were written by speech recognition because no lyrics.txt was given.**",
      "> Check every line in `lyrics.txt`, fix mistakes, then run `npm run make` again.",
      "",
    );
  }
  lines.push(
    `- Sung lines: ${sung.length}`,
    `- Average timing confidence: ${(meanConf * 100).toFixed(0)}%`,
    `- **Check** (timing likely off - look at the strip): **${check.length}**`,
    `- Glance (less certain - watch in the draft): ${glance.length}`,
  );
  if (sheet)
    lines.push(
      `- Contact sheet: [contact-sheet.jpg](contact-sheet.jpg) (one frame per lyric screen; check placement and readability)`,
    );
  lines.push("");
  const section = (title: string, list: Flagged[], intro: string[]) => {
    if (!list.length) return;
    lines.push(`## ${title}`, "", ...intro, "");
    for (const f of list) {
      lines.push(`### ${f.id} at ${fmtTime(f.start)} - ${f.text}`);
      const why = f.flags.length
        ? f.flags.map((x) => `${x} (${FLAG_HELP[x] ?? x})`).join("; ")
        : "few words were confirmed by the speech recognizer";
      lines.push(`- Why: ${why}`);
      if (f.words.length)
        lines.push(
          `- Words: ${f.words.map((w) => `"${w.text}" [${w.flags.join(", ")}]`).join(", ")}`,
        );
      lines.push(
        `- Confidence: ${f.conf !== null ? `${(f.conf * 100).toFixed(0)}%` : "n/a"}`,
        `- Strip: ![${f.id}](strips/${f.id}.png)`,
        "",
      );
    }
  };
  section("Check these lines", check, [
    "Each strip shows the isolated vocal (bright bands are sung notes) with the lyric word boxes underneath,",
    "and what the speech recognizer heard in a second row. A word box should start where its note starts.",
    "Fix timing with `npm run shift` (see below), or confirm it is right with `npm run shift -- <project> --line <id> --by 0`.",
  ]);
  section("Glance at these lines", glance, [
    "Less certain but usually right. Watch them in the draft (`npm run render -- <project> --draft`).",
  ]);
  if (!flagged.length) {
    lines.push(
      "No lines were flagged. Still watch the draft once with sound before publishing.",
      "",
    );
  }
  lines.push(
    "## How to fix timing",
    "",
    "```",
    "npm run shift -- <project> --line g3l1 --by 0.15        # move a whole line later by 0.15 s",
    "npm run shift -- <project> --word g3l1w2 --start 12.40  # set one word's start (end too with --end)",
    "npm run shift -- <project> --from 40 --to 55 --by -0.2  # move everything between 40 s and 55 s",
    "npm run render -- <project> --draft                     # quick check with the timing overlay",
    "```",
    "",
    "Edited lines are marked `locked: true` in song.json and are kept if alignment is re-run.",
  );
  fs.writeFileSync(
    path.join(p.review, "report.md"),
    lines.join("\n") + "\n",
    "utf8",
  );
  writeJson(path.join(p.review, "report.json"), {
    sungLines: sung.length,
    meanConfidence: Number(meanConf.toFixed(3)),
    check: check.length,
    glance: glance.length,
    flagged,
    contactSheet: sheet,
  });
  ok(`Review written to ${path.join(p.review, "report.md")}`);
  return { flagged, check, glance, sheet };
}
