import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { parseLyrics } from "../src/core/lyrics";
import { DEFAULT_FONT_FOR_SCRIPT, DEFAULT_SERIF_FONT_FOR_SCRIPT, detectScript, dirOf, scriptOfLang } from "../src/core/script";
import { segmentWords } from "../src/core/segment";
import { EXIT_EARLY_LIMIT, paginate, schedule } from "../src/core/timeline";
import { rng } from "../src/core/random";
import { SongSchema, type Song } from "../src/schema/song";
import { StyleSchema } from "../src/schema/style";
import { PRESETS, PRESET_NAMES } from "../src/style/presets";
import { resolveStyle, textStyleFor } from "../src/style/resolve";
import { buildSong, validateSong } from "../scripts/lib/song";

describe("scripts and words", () => {
  it.each([
    ["हर आवाज़ में रोशनी है", "hi", "Deva"],
    ["مرحبا بالعالم", "ar", "Arab"],
    ["こんにちは世界", "ja", "Jpan"],
    ["我们会成为老师", "zh", "Hans"],
    ["我們會成為老師", "zh-Hant", "Hant"],
    ["안녕하세요", "ko", "Kore"],
    ["สวัสดีครับ", "th", "Thai"],
    ["வணக்கம்", "ta", "Taml"],
    ["שלום", "he", "Hebr"],
    ["Привет", "ru", "Cyrl"],
    ["Hello", "en", "Latn"],
  ])("detects %s as %s/%s", (text, lang, script) => {
    expect(detectScript(text, lang)).toBe(script);
    expect(scriptOfLang(lang)).toBe(script);
  });

  it("knows reading direction", () => {
    expect(dirOf("Arab")).toBe("rtl");
    expect(dirOf("Hebr")).toBe("rtl");
    expect(dirOf("Deva")).toBe("ltr");
  });

  it("keeps punctuation with words and whitespace separately", () => {
    expect(segmentWords("¿Qué tal, niño?", "es")).toEqual([
      { text: "¿Qué", ws: " " },
      { text: "tal,", ws: " " },
      { text: "niño?", ws: "" },
    ]);
    expect(segmentWords("Stop — go", "en").map((w) => w.text)).toEqual(["Stop —", "go"]);
  });

  it("splits languages written without spaces", () => {
    const th = segmentWords("สวัสดีครับ ยินดีต้อนรับ", "th");
    expect(th.length).toBeGreaterThanOrEqual(3);
    expect(th.map((w) => w.text + w.ws).join("")).toBe("สวัสดีครับ ยินดีต้อนรับ");
    const ja = segmentWords("こんにちは、世界。", "ja");
    expect(ja.map((w) => w.text).join("")).toBe("こんにちは、世界。");
    expect(segmentWords("我们会", "zh", "char").map((w) => w.text)).toEqual(["我", "们", "会"]);
  });

  it("never loses or reorders characters", () => {
    for (const line of ["Every voice can carry light!", "मैं ठीक हूँ, धन्यवाद।", "كل صوت يحمل نورا", "Ça va? Très bien."]) {
      const w = segmentWords(line);
      expect(w.map((x) => x.text + x.ws).join("").replace(/\s+/g, " ")).toBe(line.replace(/\s+/g, " "));
    }
  });
});

describe("lyrics.txt", () => {
  const src = `@title: Test
@lang: hi, en
# comment
[Chorus]
हर आवाज़ में रोशनी है
Light in every voice
> Luz en cada voz

{es} Hola mundo
[01:02.50] Every step is new`;

  it("parses groups, sections, languages, translations and LRC stamps", () => {
    const p = parseLyrics(src);
    expect(p.title).toBe("Test");
    expect(p.groups).toHaveLength(2);
    expect(p.groups[0].section).toBe("Chorus");
    const [hi, en, tr] = p.groups[0].lines;
    expect(hi.lang).toBe("hi");
    expect(en.lang).toBe("en");
    expect(tr.sung).toBe(false);
    expect(tr.pairOf).toBe(en.id);
    expect(p.groups[1].lines[0].lang).toBe("es");
    expect(p.groups[1].lines[1].text).toBe("Every step is new");
  });

  it("makes the screen-opening language primary and others secondary", () => {
    const p = parseLyrics(src);
    const tier = Object.fromEntries(p.tracks.map((t) => [t.id, t.tier]));
    expect(tier.hi).toBe("primary");
    expect(tier.en).toBe("secondary");
    expect(tier.es).toBe("primary");
  });

  it("does not confuse Chinese with Korean", () => {
    const p = parseLyrics("@lang: zh, ko\n我们会\n우리는");
    expect(p.warnings).toEqual([]);
    expect(p.groups[0].lines.map((l) => l.lang)).toEqual(["zh", "ko"]);
  });

  it("warns when untagged lines are ambiguous", () => {
    const p = parseLyrics("@lang: en, es\nHello there");
    expect(p.warnings.join(" ")).toMatch(/Latn/);
  });
});

function fakeSong(lines: [number, number][][]): Song {
  return SongSchema.parse({
    version: 1,
    duration: 60,
    tracks: [{ id: "en", lang: "en", script: "Latn", dir: "ltr", role: "sung", tier: "primary" }],
    groups: lines.map((g, gi) => ({
      id: `g${gi}`,
      lines: [
        {
          id: `g${gi}l0`,
          track: "en",
          sung: true,
          start: g[0][0],
          end: g[g.length - 1][1],
          words: g.map(([s, e], wi) => ({ id: `g${gi}l0w${wi}`, text: `w${wi}`, ws: " ", start: s, end: e })),
        },
      ],
    })),
  });
}

describe("page timing", () => {
  const style = resolveStyle({ preset: "golden-sparkle" });
  const cases: [string, [number, number][][]][] = [
    ["roomy", [[[2, 2.5], [2.5, 3]], [[8, 8.5], [8.5, 9]]]],
    ["tight hand-off", [[[2, 2.5], [2.5, 3.0]], [[3.15, 3.5], [3.5, 4]]]],
    ["back-to-back", [[[1, 1.4]], [[1.4, 1.8]], [[1.8, 2.2]], [[2.25, 3]]]],
    ["starts at zero", [[[0, 0.4]], [[5, 6]]]],
  ];
  it.each(cases)("%s obeys the hand-off rules", (_name, groups) => {
    const pages = schedule(paginate(fakeSong(groups), style), style, 60);
    pages.forEach((p, i) => {
      expect(p.enterStart).toBeGreaterThanOrEqual(0);
      expect(p.exitStart).toBeGreaterThanOrEqual(p.last - EXIT_EARLY_LIMIT - 1e-6);
      const next = pages[i + 1];
      if (next) expect(next.enterStart).toBeGreaterThanOrEqual(p.exitStart + p.exitDur - 0.021);
      if (!pages[i - 1] || pages[i - 1].exitStart + pages[i - 1].exitDur <= p.first - 0.3) {
        expect(p.enterStart + p.enterDur).toBeLessThanOrEqual(Math.max(p.first + 0.1, p.enterStart + 0.12) + 1e-6);
      }
    });
  });

  it("pop layout never exceeds the word limit", () => {
    const pop = resolveStyle({ preset: "social-pop" });
    const g = [[[1, 1.2], [1.2, 1.4], [1.4, 1.6], [1.6, 1.8], [1.8, 2], [2, 2.2], [2.2, 2.4]] as [number, number][]];
    const pages = paginate(fakeSong(g), pop);
    expect(pages.every((p) => p.lines[0].words.length <= pop.layout.wordsPerPage)).toBe(true);
    expect(pages.reduce((n, p) => n + p.lines[0].words.length, 0)).toBe(7);
  });
});

describe("styles", () => {
  it.each(PRESET_NAMES)("preset %s resolves", (name) => {
    const s = resolveStyle({ preset: name });
    expect(s.name).toBe(name);
    expect(() => StyleSchema.parse(s)).not.toThrow();
  });

  it("overrides merge deeply and track overrides apply", () => {
    const s = resolveStyle({ preset: "golden-sparkle", text: { primary: { fontSize: 90 } }, tracks: { en: { sungColor: "#ff0000" } } });
    expect(s.text.primary.fontSize).toBe(90);
    expect(s.text.primary.fontFamily).toBe("Poppins");
    expect(textStyleFor(s, { id: "en", tier: "secondary" }).sungColor).toBe("#ff0000");
    expect(textStyleFor(s, { id: "en", tier: "secondary" }).fontSize).toBe(60);
  });

  it("rejects unknown presets and bad values clearly", () => {
    expect(() => resolveStyle({ preset: "nope" })).toThrow(/Available/);
    expect(() => resolveStyle({ preset: "chalk", layout: { type: "zigzag" } })).toThrow(/layout\.type/);
  });

  it("every font named by presets and script defaults exists in Google Fonts", () => {
    const index = fs.readFileSync("node_modules/@remotion/google-fonts/dist/esm/index.mjs", "utf8");
    const names = new Set<string>([...Object.values(DEFAULT_FONT_FOR_SCRIPT), ...Object.values(DEFAULT_SERIF_FONT_FOR_SCRIPT), "Noto Sans", "Noto Serif"]);
    for (const p of Object.values(PRESETS)) {
      for (const tier of ["primary", "secondary"] as const) {
        const f = p.text?.[tier]?.fontFamily;
        if (f) names.add(f);
      }
    }
    const missing = [...names].filter((n) => !index.includes(`fontFamily: '${n}'`));
    expect(missing).toEqual([]);
  });
});

describe("song builder", () => {
  const parsed = parseLyrics("@lang: en\nOne two three\n> Uno dos tres");
  const alignment = {
    version: 1 as const,
    lines: [{ id: "g0l0", words: ["One", "two", "three"].map((t, i) => ({ id: `g0l0w${i}`, text: t, start: 1 + i, end: 1.8 + i, score: 0.5, voiced: 1, flags: [], conf: 0.9 })) }],
  };

  it("times translations across their sung line", () => {
    const { song } = buildSong(parsed, alignment, 10, null);
    const tr = song.groups[0].lines[1];
    expect(tr.sung).toBe(false);
    expect(tr.start).toBe(1);
    expect(tr.end).toBeCloseTo(3.8);
    expect(validateSong(song, 10).filter((i) => i.level === "error")).toEqual([]);
  });

  it("keeps locked lines when re-aligned", () => {
    const { song } = buildSong(parsed, alignment, 10, null);
    song.groups[0].lines[0].locked = true;
    song.groups[0].lines[0].words[0].start = 0.5;
    const again = buildSong(parsed, alignment, 10, song);
    expect(again.kept).toEqual(["g0l0"]);
    expect(again.song.groups[0].lines[0].words[0].start).toBe(0.5);
  });

  it("catches broken timing", () => {
    const { song } = buildSong(parsed, alignment, 10, null);
    song.groups[0].lines[0].words[1].end = song.groups[0].lines[0].words[1].start - 0.1;
    expect(validateSong(song, 10).some((i) => i.level === "error")).toBe(true);
  });
});

describe("determinism", () => {
  it("seeded random is repeatable", () => {
    const a = rng("word-1");
    const b = rng("word-1");
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(rng("word-2")()).not.toBe(rng("word-1")());
  });
});
