---
name: motion-lyrics
description: Make a lyric video (karaoke-style highlighted lyrics, translations, titles and other graphics) from a video or song and its lyrics, in any language or script, using this repository's Remotion framework. Use when someone asks to add lyrics, captions, subtitles, karaoke or lyric animations to a video, to re-time lyrics, change a lyric video's style, or render one.
---

# Making a lyric video with motion-lyrics

Follow **AGENTS.md** at the repository root. It is the authoritative process; this is the
short version so you can start immediately.

1. `npm run doctor` - if anything fails, `npm install` and `npm run setup` first.
2. Put the person's exact lyrics in a `lyrics.txt` (format in AGENTS.md section 2): `@lang`
   line, one sung line per line in sung order, blank line between screens, `>` for
   translations, `{lang}` tags when two languages share a script.
3. `npm run make -- <name> --video <file> --lyrics lyrics.txt --preset <preset> --no-render`
   (`npm run presets` lists looks).
4. Read `projects/<name>/review/report.md`. Open every **Check** line's strip image and the
   contact sheet. Fix timing with `npm run shift` (never hand-type unverified numbers).
5. `npm run render -- <name> --draft`, then `npm run render -- <name>`.
6. Report the output path, which lines you changed or confirmed, and that the person should
   watch it once with sound (you cannot hear audio).

Style, layout, colours, sizes and graphics live in `projects/<name>/project.json`; see
`docs/styles.md` and `docs/graphics.md`. Do not edit `src/` to customise one video.
