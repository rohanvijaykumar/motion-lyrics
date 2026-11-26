---
name: motion-lyrics
description: Make a lyric video (karaoke-style highlighted lyrics, translations, titles and other graphics) from a video or song and its lyrics, in any language or script, in 1080p or 4K, 16:9 or 9:16, using this repository's Remotion framework. Use when someone asks to add lyrics, captions, subtitles, karaoke or lyric animations to a video, to re-time lyrics, change a lyric video's style, export other sizes, or approve and clean up a lyric video project.
---

# Making a lyric video with motion-lyrics

Follow **AGENTS.md** at the repository root. It is the authoritative process; this is the
short version so you can start immediately.

1. `npm run doctor` - if anything fails, `npm install` and `npm run setup` first.
2. Put the person's exact lyrics in a `lyrics.txt` (AGENTS.md section 2).
3. **Ask the person** (and wait): style preset (`npm run presets`), lyric position
   (bottom/center/top, fixed for the whole video), face avoidance on/off (default off),
   optional font, colour and export sizes.
4. `npm run make -- <name> --video <file> --lyrics lyrics.txt --preset <p> --position <pos> --avoid-faces off --no-render`
5. Read `projects/<name>/review/report.md`; open every **Check** line's strip. Fix timing with
   `npm run shift` (never hand-type unverified numbers).
6. `npm run render -- <name>` (add `--size`, `--aspect` or `--all`). This runs visual QC on every
   lyric line first. Open `review/qc/<format>/report.md` and the frame images and look at them.
7. Report the output paths, QC results, which lines you changed, and that the person should
   watch it once with sound (you cannot hear audio).
8. Only after the person approves: `npm run approve -- <name> --yes` (keeps the video, cleans up).

Style, layout, colours, sizes, fonts and graphics live in `projects/<name>/project.json`; see
`docs/styles.md` and `docs/graphics.md`. Do not edit `src/` to customise one video.
